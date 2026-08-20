// Shared PSX sound library: VAB/VAG/SEQ parsing and a sequencer/synthesizer
// that replicates the game's sound driver.
//
// The synthesis model was verified against the actual game driver by running
// the PSF rip's executable in a small MIPS interpreter and capturing every SPU
// register write (voice volumes, pitches, ADSR, reverb setup, tick timing).
// See extract_music.mjs for the render settings that came out of that.

import * as fs from "fs";
import { join } from "path";
import { try_spawn_process } from "./util.mjs";

export { REVERB_PRESETS };

// extracts SND.BIN (VAB sound bank + 2 SEQs) from disc1 into tempdir
export function extract_snd_bin(tempdir, jpsxdec_jar) {
    const path = join(tempdir, "SND.BIN");
    if (!fs.existsSync(path)) {
        try_spawn_process("java", [
            "-jar",
            jpsxdec_jar,
            "-x",
            join(tempdir, "disc1.idx"),
            "-i",
            "SND.BIN",
            "-dir",
            tempdir,
        ]);
    }
    return path;
}

// ============================================
// VAG ADPCM decoding (with loop point tracking)
// ============================================

const VAG_FILTERS = [
    [0.0, 0.0],
    [60.0 / 64.0, 0.0],
    [115.0 / 64.0, -52.0 / 64.0],
    [98.0 / 64.0, -55.0 / 64.0],
    [122.0 / 64.0, -60.0 / 64.0],
];

// decodes a full VAG body into PCM (16-bit scale), remembering SPU loop flags:
//   flag bit 0 (1) = end of sample
//   flag bit 1 (2) = on end, repeat from loop start
//   flag bit 2 (4) = this block is the loop start
function decode_vag(buffer, offset, size) {
    const samples = [];
    let s1 = 0.0;
    let s2 = 0.0;
    let loop_start = -1;
    let loops = false;

    const end = offset + size;
    let pos = offset;

    while (pos + 16 <= end) {
        const shift_filter = buffer.readUInt8(pos);
        const flags = buffer.readUInt8(pos + 1);

        const shift = shift_filter & 0x0f;
        const filter_idx = Math.min((shift_filter >> 4) & 0x0f, 4);
        const filter = VAG_FILTERS[filter_idx];

        if (flags & 4) {
            loop_start = samples.length;
        }

        for (let i = 2; i < 16; i++) {
            const byte = buffer.readUInt8(pos + i);
            for (let nibble = 0; nibble < 2; nibble++) {
                let sample = nibble === 0 ? (byte & 0x0f) : ((byte >> 4) & 0x0f);
                if (sample >= 8) sample -= 16;

                let pcm = sample * (1 << (12 - shift));
                pcm += s1 * filter[0] + s2 * filter[1];
                pcm = Math.max(-32768, Math.min(32767, pcm));

                s2 = s1;
                s1 = pcm;
                samples.push(pcm);
            }
        }

        pos += 16;

        if (flags & 1) {
            if ((flags & 2) && loop_start >= 0) loops = true;
            break;
        }
    }

    return {
        pcm: Float32Array.from(samples),
        loop_start: loops ? loop_start : -1,
    };
}

// ============================================
// VAB parsing (programs + tones + VAGs)
// ============================================

function parse_vab(buffer) {
    const magic = buffer.toString("ascii", 0, 4);
    if (magic !== "pBAV" && magic !== "VABp") {
        throw new Error(`Not a VAB file (magic: ${magic})`);
    }

    const num_programs = buffer.readUInt16LE(18);
    const num_tones = buffer.readUInt16LE(20);
    const num_vags = buffer.readUInt16LE(22);
    const master_volume = buffer.readUInt8(24);

    console.log(`VAB: ${num_programs} programs, ${num_tones} tones, ${num_vags} VAGs`);

    // program attribute table: 128 slots * 16 bytes
    const prog_offset = 32;
    const programs = new Array(128).fill(null);
    const used_slots = [];
    for (let i = 0; i < 128; i++) {
        const o = prog_offset + i * 16;
        const tones = buffer.readUInt8(o);
        if (tones > 0) {
            programs[i] = {
                num_tones: tones,
                mvol: buffer.readUInt8(o + 1),
                mpan: buffer.readUInt8(o + 4),
                tones: [],
            };
            used_slots.push(i);
        }
    }

    // tone attribute table: one 16*32-byte block per used program, in slot order
    const tone_offset = prog_offset + 128 * 16;
    for (let b = 0; b < used_slots.length; b++) {
        const prog = programs[used_slots[b]];
        const block = tone_offset + b * 16 * 32;
        for (let t = 0; t < prog.num_tones; t++) {
            const o = block + t * 32;
            prog.tones.push({
                prior: buffer.readUInt8(o),
                reverb: (buffer.readUInt8(o + 1) & 4) !== 0, // tone mode 4 = reverb send
                vol: buffer.readUInt8(o + 2),
                pan: buffer.readUInt8(o + 3),
                center: buffer.readUInt8(o + 4),
                fine: buffer.readUInt8(o + 5),
                note_min: buffer.readUInt8(o + 6),
                note_max: buffer.readUInt8(o + 7),
                pb_min: buffer.readUInt8(o + 12),
                pb_max: buffer.readUInt8(o + 13),
                adsr1: buffer.readUInt16LE(o + 16),
                adsr2: buffer.readUInt16LE(o + 18),
                vag: buffer.readInt16LE(o + 22), // 1-based
            });
        }
    }

    // VAG size table (256 entries, index 0 unused), data sector-aligned after it
    const vag_size_table = tone_offset + num_programs * 16 * 32;
    let vag_data = vag_size_table + 256 * 2;
    vag_data = Math.ceil(vag_data / 2048) * 2048;

    const vags = [null]; // 1-based like the tone table
    let cur = vag_data;
    for (let i = 0; i < num_vags; i++) {
        const size = buffer.readUInt16LE(vag_size_table + (i + 1) * 2) * 8;
        vags.push(decode_vag(buffer, cur, size));
        cur += size;
    }

    return { programs, vags, num_vags, master_volume };
}

// ============================================
// SEQ parsing
// ============================================

function parse_seq(buffer, offset) {
    if (buffer.toString("ascii", offset, offset + 4) !== "pQES") {
        throw new Error("Not a SEQ");
    }
    const resolution = buffer.readUInt16BE(offset + 8);
    const tempo = (buffer.readUInt8(offset + 10) << 16) | buffer.readUInt16BE(offset + 11);
    // 2 bytes rhythm (time signature) at +13, data starts at +15

    const events = [];
    let pos = offset + 15;
    let tick = 0;
    let running = 0;

    const read_vlq = () => {
        let v = 0;
        for (;;) {
            const b = buffer.readUInt8(pos++);
            v = (v << 7) | (b & 0x7f);
            if (!(b & 0x80)) return v;
        }
    };

    for (;;) {
        tick += read_vlq();
        let status = buffer.readUInt8(pos);
        if (status & 0x80) {
            pos++;
            if (status !== 0xff) running = status;
        } else {
            status = running;
        }

        const type = status & 0xf0;
        const ch = status & 0x0f;

        if (status === 0xff) {
            const meta = buffer.readUInt8(pos++);
            if (meta === 0x2f) {
                events.push({ tick, type: "end" });
                break;
            } else if (meta === 0x51) {
                // SEQ tempo meta: 3 bytes, no length prefix
                const t = (buffer.readUInt8(pos) << 16) | buffer.readUInt16BE(pos + 1);
                pos += 3;
                events.push({ tick, type: "tempo", tempo: t });
            } else {
                throw new Error(`Unknown meta 0x${meta.toString(16)} at 0x${(pos - 2).toString(16)}`);
            }
        } else if (type === 0x90) {
            const note = buffer.readUInt8(pos++);
            const vel = buffer.readUInt8(pos++);
            events.push({ tick, type: vel > 0 ? "on" : "off", ch, note, vel });
        } else if (type === 0x80) {
            const note = buffer.readUInt8(pos++);
            pos++; // release velocity
            events.push({ tick, type: "off", ch, note });
        } else if (type === 0xb0) {
            const cc = buffer.readUInt8(pos++);
            const val = buffer.readUInt8(pos++);
            events.push({ tick, type: "cc", ch, cc, val });
        } else if (type === 0xc0) {
            const prog = buffer.readUInt8(pos++);
            events.push({ tick, type: "prog", ch, prog });
        } else if (type === 0xe0) {
            const lsb = buffer.readUInt8(pos++);
            const msb = buffer.readUInt8(pos++);
            events.push({ tick, type: "bend", ch, value: ((msb << 7) | lsb) - 8192 });
        } else if (type === 0xd0) {
            pos++; // channel pressure - ignored
        } else if (type === 0xa0) {
            pos += 2; // poly pressure - ignored
        } else {
            throw new Error(`Unknown status 0x${status.toString(16)} at 0x${pos.toString(16)}`);
        }
    }

    return { resolution, tempo, events, end_offset: pos };
}

export function load_bank(snd_bin) {
    const buffer = fs.readFileSync(snd_bin);
    const vab = parse_vab(buffer);

    const seqs = [];
    let idx = buffer.indexOf("pQES");
    while (idx !== -1) {
        seqs.push({ offset: idx, ...parse_seq(buffer, idx) });
        idx = buffer.indexOf("pQES", idx + 4);
    }
    return { buffer, vab, seqs };
}

// ============================================
// SPU ADSR envelope (nocash algorithm)
// ============================================

const PHASE_ATTACK = 0, PHASE_DECAY = 1, PHASE_SUSTAIN = 2, PHASE_RELEASE = 3, PHASE_OFF = 4;

function make_envelope(adsr1, adsr2) {
    return {
        attack_exp: (adsr1 >> 15) & 1,
        attack_shift: (adsr1 >> 10) & 0x1f,
        attack_step: 7 - ((adsr1 >> 8) & 3),
        decay_shift: (adsr1 >> 4) & 0x0f,
        sustain_level: Math.min(32767, (((adsr1 & 0x0f) + 1) * 0x800)),
        sustain_exp: (adsr2 >> 15) & 1,
        sustain_decrease: (adsr2 >> 14) & 1,
        sustain_shift: (adsr2 >> 8) & 0x1f,
        sustain_step_n: (adsr2 >> 6) & 3,
        release_exp: (adsr2 >> 5) & 1,
        release_shift: adsr2 & 0x1f,
    };
}

function env_tick(v) {
    if (v.env_wait > 0) {
        v.env_wait--;
        return;
    }

    const e = v.env;
    let shift, step, exp_mode, decrease;

    switch (v.phase) {
        case PHASE_ATTACK:
            shift = e.attack_shift; step = e.attack_step; exp_mode = e.attack_exp; decrease = false;
            break;
        case PHASE_DECAY:
            shift = e.decay_shift; step = 8; exp_mode = true; decrease = true;
            break;
        case PHASE_SUSTAIN:
            decrease = !!e.sustain_decrease;
            shift = e.sustain_shift;
            step = decrease ? 8 - e.sustain_step_n : 7 - e.sustain_step_n;
            exp_mode = !!e.sustain_exp;
            break;
        case PHASE_RELEASE:
            shift = e.release_shift; step = 8; exp_mode = !!e.release_exp; decrease = true;
            break;
        default:
            return;
    }

    let cycles = 1 << Math.max(0, shift - 11);
    let delta = step << Math.max(0, 11 - shift);

    if (exp_mode) {
        if (!decrease) {
            if (v.env_level > 0x6000) cycles *= 4;
        } else {
            delta = (delta * v.env_level) >> 15;
            if (delta < 1) delta = 1;
        }
    }

    v.env_level += decrease ? -delta : delta;
    v.env_wait = cycles - 1;

    if (v.phase === PHASE_ATTACK && v.env_level >= 32767) {
        v.env_level = 32767;
        v.phase = PHASE_DECAY;
        v.env_wait = 0;
    } else if (v.phase === PHASE_DECAY && v.env_level <= v.env.sustain_level) {
        v.env_level = Math.max(0, v.env_level);
        v.phase = PHASE_SUSTAIN;
        v.env_wait = 0;
    } else if (v.env_level <= 0) {
        v.env_level = 0;
        if (v.phase === PHASE_RELEASE || v.phase === PHASE_SUSTAIN) v.phase = PHASE_OFF;
    } else if (v.env_level > 32767) {
        v.env_level = 32767;
    }
}

// ============================================
// SPU reverb (exact hardware algorithm, 22050 Hz with FIR resampling)
// ============================================

const s16 = (v) => (v << 16) >> 16;
const sat16 = (v) => (v < -32768 ? -32768 : v > 32767 ? 32767 : v);

// register indices in the 32-halfword preset block
const R = {
    dAPF1: 0, dAPF2: 1, vIIR: 2, vCOMB1: 3, vCOMB2: 4, vCOMB3: 5, vCOMB4: 6, vWALL: 7,
    vAPF1: 8, vAPF2: 9, mLSAME: 10, mRSAME: 11, mLCOMB1: 12, mRCOMB1: 13, mLCOMB2: 14, mRCOMB2: 15,
    dLSAME: 16, dRSAME: 17, mLDIFF: 18, mRDIFF: 19, mLCOMB3: 20, mRCOMB3: 21, mLCOMB4: 22, mRCOMB4: 23,
    dLDIFF: 24, dRDIFF: 25, mLAPF1: 26, mRAPF1: 27, mLAPF2: 28, mRAPF2: 29, vLIN: 30, vRIN: 31,
};

class Reverb {
    constructor(preset, depth_l, depth_r, wet_scale = 2) {
        this.wet_scale = wet_scale;
        const { size, regs } = preset;
        this.len = Math.max(4, size >> 1); // 16-bit samples in work area
        this.buf = new Float64Array(this.len);
        this.pos = 0;

        // volumes as signed 16-bit / 0x8000, addresses as sample offsets (regs are /8 bytes = *4 samples)
        const vol = (i) => s16(regs[i]) / 32768;
        const adr = (i) => regs[i] * 4;
        this.vIIR = vol(R.vIIR); this.vWALL = vol(R.vWALL);
        this.vCOMB1 = vol(R.vCOMB1); this.vCOMB2 = vol(R.vCOMB2);
        this.vCOMB3 = vol(R.vCOMB3); this.vCOMB4 = vol(R.vCOMB4);
        this.vAPF1 = vol(R.vAPF1); this.vAPF2 = vol(R.vAPF2);
        this.vLIN = vol(R.vLIN); this.vRIN = vol(R.vRIN);
        this.dAPF1 = adr(R.dAPF1); this.dAPF2 = adr(R.dAPF2);
        this.mLSAME = adr(R.mLSAME); this.mRSAME = adr(R.mRSAME);
        this.mLDIFF = adr(R.mLDIFF); this.mRDIFF = adr(R.mRDIFF);
        this.dLSAME = adr(R.dLSAME); this.dRSAME = adr(R.dRSAME);
        this.dLDIFF = adr(R.dLDIFF); this.dRDIFF = adr(R.dRDIFF);
        this.mLCOMB1 = adr(R.mLCOMB1); this.mRCOMB1 = adr(R.mRCOMB1);
        this.mLCOMB2 = adr(R.mLCOMB2); this.mRCOMB2 = adr(R.mRCOMB2);
        this.mLCOMB3 = adr(R.mLCOMB3); this.mRCOMB3 = adr(R.mRCOMB3);
        this.mLCOMB4 = adr(R.mLCOMB4); this.mRCOMB4 = adr(R.mRCOMB4);
        this.mLAPF1 = adr(R.mLAPF1); this.mRAPF1 = adr(R.mRAPF1);
        this.mLAPF2 = adr(R.mLAPF2); this.mRAPF2 = adr(R.mRAPF2);

        this.vLOUT = depth_l;
        this.vROUT = depth_r ?? depth_l;

        // half-band FIR state: input down-sampler and output up-sampler, per side
        this.fir = Float64Array.from(REVERB_FIR, (v) => v / 32768);
        this.in_hist_l = new Float64Array(64); this.in_hist_r = new Float64Array(64);
        this.out_hist_l = new Float64Array(64); this.out_hist_r = new Float64Array(64);
        this.hist_pos = 0;
        this.phase = 0;
    }

    get(a) { let i = (this.pos + a) % this.len; if (i < 0) i += this.len; return this.buf[i]; }
    set(a, v) { let i = (this.pos + a) % this.len; if (i < 0) i += this.len; this.buf[i] = sat16(v); }

    // one 22050 Hz reverb cycle
    cycle(lin_raw, rin_raw) {
        const Lin = this.vLIN * lin_raw;
        const Rin = this.vRIN * rin_raw;

        this.set(this.mLSAME, (Lin + this.get(this.dLSAME) * this.vWALL - this.get(this.mLSAME - 1)) * this.vIIR + this.get(this.mLSAME - 1));
        this.set(this.mRSAME, (Rin + this.get(this.dRSAME) * this.vWALL - this.get(this.mRSAME - 1)) * this.vIIR + this.get(this.mRSAME - 1));
        this.set(this.mLDIFF, (Lin + this.get(this.dRDIFF) * this.vWALL - this.get(this.mLDIFF - 1)) * this.vIIR + this.get(this.mLDIFF - 1));
        this.set(this.mRDIFF, (Rin + this.get(this.dLDIFF) * this.vWALL - this.get(this.mRDIFF - 1)) * this.vIIR + this.get(this.mRDIFF - 1));

        let Lout = this.vCOMB1 * this.get(this.mLCOMB1) + this.vCOMB2 * this.get(this.mLCOMB2)
            + this.vCOMB3 * this.get(this.mLCOMB3) + this.vCOMB4 * this.get(this.mLCOMB4);
        let Rout = this.vCOMB1 * this.get(this.mRCOMB1) + this.vCOMB2 * this.get(this.mRCOMB2)
            + this.vCOMB3 * this.get(this.mRCOMB3) + this.vCOMB4 * this.get(this.mRCOMB4);

        Lout = Lout - this.vAPF1 * this.get(this.mLAPF1 - this.dAPF1);
        this.set(this.mLAPF1, Lout);
        Lout = Lout * this.vAPF1 + this.get(this.mLAPF1 - this.dAPF1);
        Rout = Rout - this.vAPF1 * this.get(this.mRAPF1 - this.dAPF1);
        this.set(this.mRAPF1, Rout);
        Rout = Rout * this.vAPF1 + this.get(this.mRAPF1 - this.dAPF1);

        Lout = Lout - this.vAPF2 * this.get(this.mLAPF2 - this.dAPF2);
        this.set(this.mLAPF2, Lout);
        Lout = Lout * this.vAPF2 + this.get(this.mLAPF2 - this.dAPF2);
        Rout = Rout - this.vAPF2 * this.get(this.mRAPF2 - this.dAPF2);
        this.set(this.mRAPF2, Rout);
        Rout = Rout * this.vAPF2 + this.get(this.mRAPF2 - this.dAPF2);

        this.pos = this.pos + 1 >= this.len ? 0 : this.pos + 1;
        return [sat16(Lout) * this.vLOUT, sat16(Rout) * this.vROUT];
    }

    // runs at 44100 Hz; returns wet [l, r] for this output sample
    process(inl, inr) {
        const hp = this.hist_pos;
        this.in_hist_l[hp & 63] = inl;
        this.in_hist_r[hp & 63] = inr;

        if (this.phase === 0) {
            // downsample input through the 39-tap FIR, run one reverb cycle,
            // push its output into the zero-stuffed up-sampler history
            let dl = 0, dr = 0;
            for (let k = 0; k < 39; k++) {
                const i = (hp - k) & 63;
                dl += this.fir[k] * this.in_hist_l[i];
                dr += this.fir[k] * this.in_hist_r[i];
            }
            const [wl, wr] = this.cycle(sat16(dl), sat16(dr));
            this.out_hist_l[hp & 63] = wl;
            this.out_hist_r[hp & 63] = wr;
        } else {
            this.out_hist_l[hp & 63] = 0;
            this.out_hist_r[hp & 63] = 0;
        }
        this.phase ^= 1;
        this.hist_pos = hp + 1;

        // upsample: FIR over zero-stuffed 22050 output
        let ol = 0, or_ = 0;
        for (let k = 0; k < 39; k++) {
            const i = (hp - k) & 63;
            ol += this.fir[k] * this.out_hist_l[i];
            or_ += this.fir[k] * this.out_hist_r[i];
        }
        return [ol * this.wet_scale, or_ * this.wet_scale];
    }
}

// ============================================
// Sequencer + synth
// ============================================

export const SAMPLE_RATE = 44100;
const FRAMES_PER_VSYNC = SAMPLE_RATE / 60; // driver processes SEQ events at 60 Hz
const MAX_VOICES = 24;

export function render_seq(seq, vab, opts) {
    const { events, resolution } = seq;
    const target_secs = opts.length + opts.fade;
    const preset = REVERB_PRESETS[opts.preset ?? "Reverb off"];
    const reverb = new Reverb(preset, opts.depth_l ?? 0, opts.depth_r ?? 0, opts.wet_scale ?? 2);
    const gain = opts.gain ?? 0.5;

    const chans = [];
    for (let i = 0; i < 16; i++) {
        chans.push({ prog: 0, vol: 127, expr: 127, pan: 64, bend: 0 });
    }

    // 24 fixed SPU voice slots; when a captured allocation schedule is
    // available it is replayed exactly, otherwise approximate the driver
    // (lowest-index slot that is not currently keyed on)
    const voices = new Array(MAX_VOICES).fill(null);
    const master = (vab.master_volume / 127) * gain;
    let keyon_counter = 0;

    const key_on = (ch, note, vel) => {
        const c = chans[ch];
        const prog = vab.programs[c.prog];
        if (!prog) return;
        for (const tone of prog.tones) {
            if (note < tone.note_min || note > tone.note_max) continue;
            const vag = vab.vags[tone.vag];
            if (!vag || vag.pcm.length === 0) continue;

            let slot = -1;
            if (typeof opts.slot_schedule?.[keyon_counter] === "number") {
                slot = opts.slot_schedule[keyon_counter];
            } else {
                for (let i = 0; i < MAX_VOICES; i++) {
                    if (voices[i] === null || voices[i].phase >= PHASE_RELEASE) { slot = i; break; }
                }
                if (slot === -1) {
                    // all 24 keyed on: steal the quietest
                    let vscore = Infinity;
                    for (let i = 0; i < MAX_VOICES; i++) {
                        if (voices[i].env_level < vscore) { vscore = voices[i].env_level; slot = i; }
                    }
                }
            }
            keyon_counter++;

            voices[slot] = {
                ch, note,
                vag,
                idx: 0,
                frac: 0, // 12-bit pitch counter fraction
                // fine tune is in 1/128ths of a semitone, additive
                base_pitch: Math.round(4096 * Math.pow(2, (note + tone.fine / 128 - tone.center) / 12)),
                tone,
                vel: vel / 127,
                env: make_envelope(tone.adsr1, tone.adsr2),
                env_level: 0,
                env_wait: 0,
                phase: PHASE_ATTACK,
            };
        }
    };

    const key_off = (ch, note) => {
        for (const v of voices) {
            if (v && v.ch === ch && v.note === note && v.phase < PHASE_RELEASE) {
                v.phase = PHASE_RELEASE;
                v.env_wait = 0;
            }
        }
    };

    const total_frames = Math.ceil(target_secs * SAMPLE_RATE);
    const left = new Float32Array(total_frames);
    const right = new Float32Array(total_frames);

    let tempo = seq.tempo;
    let frame = 0;
    let ev_idx = 0;
    let loop_start_idx = -1;
    let loop_count = 0;
    let track_ended = false;

    // The driver counts event deltas in tenths of a tick and subtracts an
    // INTEGER amount per 60 Hz vsync: round(resolution * 1e7 / (tempo * 60)).
    // The rounding means playback runs slightly off the notated tempo,
    // exactly like the real game.
    const vsync_advance = () => Math.round(resolution * 1e7 / (tempo * 60));

    const mix_frames = (n) => {
        const end_frame = Math.min(frame + n, total_frames);
        for (; frame < end_frame; frame++) {
            let l = 0, r = 0, rev_l = 0, rev_r = 0;
            for (const v of voices) {
                if (v === null || v.phase === PHASE_OFF) continue;

                const pcm = v.vag.pcm;
                const len = pcm.length;
                const idx = v.idx;
                if (idx >= len) { v.phase = PHASE_OFF; continue; }

                // 4-point gaussian interpolation on (oldest..new) with 8-bit index
                const gi = (v.frac >> 4) & 0xff;
                const s0 = idx >= 3 ? pcm[idx - 3] : 0;
                const s1 = idx >= 2 ? pcm[idx - 2] : 0;
                const s2 = idx >= 1 ? pcm[idx - 1] : 0;
                const s3 = pcm[idx];
                const s = (GAUSS[0xff - gi] * s0 + GAUSS[0x1ff - gi] * s1
                    + GAUSS[0x100 + gi] * s2 + GAUSS[gi] * s3) / 32768;

                env_tick(v);

                const c = chans[v.ch];
                const bend_semis = c.bend >= 0
                    ? (c.bend / 8192) * v.tone.pb_max
                    : (c.bend / 8192) * v.tone.pb_min;
                let pitch = c.bend === 0 ? v.base_pitch
                    : Math.round(v.base_pitch * Math.pow(2, bend_semis / 12));
                if (pitch > 0x4000) pitch = 0x4000;

                v.frac += pitch;
                v.idx += v.frac >> 12;
                v.frac &= 0xfff;
                while (v.idx >= len && v.vag.loop_start >= 0) {
                    v.idx -= len - v.vag.loop_start;
                }

                // the driver's SPU voice volume is the SQUARE of the combined
                // 7-bit volume product (captured from real driver execution)
                const vol_product = v.vel * (v.tone.vol / 127)
                    * ((vab.programs[c.prog]?.mvol ?? 127) / 127)
                    * (c.vol / 127) * (c.expr / 127);

                let pan = v.tone.pan + (c.pan - 64);
                pan = Math.max(0, Math.min(127, pan));
                const sample_env = (s / 32768) * (v.env_level / 32767);
                const vl = sample_env * Math.pow(vol_product * (pan <= 64 ? 1 : (127 - pan) / 63), 2);
                const vr = sample_env * Math.pow(vol_product * (pan >= 64 ? 1 : pan / 63), 2);
                l += vl;
                r += vr;
                if (v.tone.reverb) {
                    rev_l += vl;
                    rev_r += vr;
                }
            }

            // reverb works on 16-bit-scale samples
            const [wl, wr] = reverb.process(rev_l * 32768, rev_r * 32768);
            left[frame] = (l + wl / 32768) * master;
            right[frame] = (r + wr / 32768) * master;
        }
        for (let i = 0; i < MAX_VOICES; i++) {
            if (voices[i] !== null && voices[i].phase === PHASE_OFF) voices[i] = null;
        }
    };

    // deci-tick delta before each event fires
    const delta10 = events.map((ev, i) => (ev.tick - (events[i - 1]?.tick ?? 0)) * 10);

    let wait = delta10[0] ?? 0;
    let vsync_frame = 0;

    while (frame < total_frames && !track_ended && ev_idx < events.length) {
        // advance one vsync of audio, then run the driver's counter
        vsync_frame += FRAMES_PER_VSYNC;
        const target = Math.min(Math.round(vsync_frame), total_frames);
        if (target > frame) mix_frames(target - frame);
        if (frame >= total_frames) break;

        wait -= vsync_advance();
        while (wait <= 0 && ev_idx < events.length && !track_ended) {
            const ev = events[ev_idx];
            let next = ev_idx + 1;

            switch (ev.type) {
                case "on": key_on(ev.ch, ev.note, ev.vel); break;
                case "off": key_off(ev.ch, ev.note); break;
                case "prog": chans[ev.ch].prog = ev.prog; break;
                case "bend": chans[ev.ch].bend = ev.value; break;
                case "tempo": tempo = ev.tempo; break;
                case "cc":
                    switch (ev.cc) {
                        case 7: chans[ev.ch].vol = ev.val; break;
                        case 10: chans[ev.ch].pan = ev.val; break;
                        case 11: chans[ev.ch].expr = ev.val; break;
                        case 99:
                            // Sony sequencer loop markers
                            if (ev.val === 0x14) loop_start_idx = ev_idx;
                            else if (ev.val === 0x1e && loop_start_idx >= 0) {
                                loop_count++;
                                console.log(`  loop point hit (pass ${loop_count}) at ${(frame / SAMPLE_RATE).toFixed(1)}s`);
                                next = loop_start_idx + 1;
                            }
                            break;
                    }
                    break;
                case "end":
                    track_ended = true;
                    break;
            }

            if (!track_ended && next < events.length) wait += delta10[next];
            ev_idx = next;
        }
    }

    if (frame < total_frames) mix_frames(total_frames - frame);

    // fade-out over the last opts.fade seconds
    if (opts.fade > 0) {
        const fade_start = Math.floor(opts.length * SAMPLE_RATE);
        const fade_len = total_frames - fade_start;
        for (let i = fade_start; i < total_frames; i++) {
            const g = 1 - (i - fade_start) / fade_len;
            left[i] *= g;
            right[i] *= g;
        }
    }

    return { left, right };
}

// ============================================
// WAV writing
// ============================================

export function write_wav_mono(filename, samples, sample_rate) {
    const n = samples.length;
    const data_size = n * 2;
    const buffer = Buffer.alloc(44 + data_size);
    let o = 0;
    buffer.write("RIFF", o); o += 4;
    buffer.writeUInt32LE(36 + data_size, o); o += 4;
    buffer.write("WAVE", o); o += 4;
    buffer.write("fmt ", o); o += 4;
    buffer.writeUInt32LE(16, o); o += 4;
    buffer.writeUInt16LE(1, o); o += 2;
    buffer.writeUInt16LE(1, o); o += 2;
    buffer.writeUInt32LE(sample_rate, o); o += 4;
    buffer.writeUInt32LE(sample_rate * 2, o); o += 4;
    buffer.writeUInt16LE(2, o); o += 2;
    buffer.writeUInt16LE(16, o); o += 2;
    buffer.write("data", o); o += 4;
    buffer.writeUInt32LE(data_size, o); o += 4;
    for (let i = 0; i < n; i++) {
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]))), o); o += 2;
    }
    fs.writeFileSync(filename, buffer);
}

export function write_wav_stereo(filename, left, right, sample_rate) {
    const n = left.length;
    const data_size = n * 4;
    const buffer = Buffer.alloc(44 + data_size);
    let o = 0;
    buffer.write("RIFF", o); o += 4;
    buffer.writeUInt32LE(36 + data_size, o); o += 4;
    buffer.write("WAVE", o); o += 4;
    buffer.write("fmt ", o); o += 4;
    buffer.writeUInt32LE(16, o); o += 4;
    buffer.writeUInt16LE(1, o); o += 2;
    buffer.writeUInt16LE(2, o); o += 2;
    buffer.writeUInt32LE(sample_rate, o); o += 4;
    buffer.writeUInt32LE(sample_rate * 4, o); o += 4;
    buffer.writeUInt16LE(4, o); o += 2;
    buffer.writeUInt16LE(16, o); o += 2;
    buffer.write("data", o); o += 4;
    buffer.writeUInt32LE(data_size, o); o += 4;
    for (let i = 0; i < n; i++) {
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), o); o += 2;
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), o); o += 2;
    }
    fs.writeFileSync(filename, buffer);
}

// ============================================
// SPU data tables
// ============================================
// From the psx-spx (nocash) PSX documentation; the same interoperability data
// ships with open-source PS1 emulators (DuckStation, Mednafen, ...).

// the SPU's 4-point gaussian sample interpolation table
const GAUSS = [
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3,
    3, 4, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 25, 27, 28, 30, 32, 33, 35,
    37, 39, 41, 44, 46, 48, 51, 53, 56, 58, 61, 64, 67, 70, 73, 77, 80, 84, 87, 91, 95, 99, 103, 107, 111, 116, 120,
    125, 130, 135, 140, 145, 150, 156, 161, 167, 173, 179, 186, 192, 199, 205, 212, 219, 227, 234, 242, 250, 257,
    266, 274, 283, 291, 300, 309, 319, 328, 338, 348, 358, 369, 379, 390, 401, 412, 424, 436, 448, 460, 473, 485,
    498, 512, 525, 539, 553, 567, 582, 597, 612, 627, 643, 659, 675, 692, 708, 726, 743, 761, 779, 797, 816, 835,
    854, 874, 894, 914, 935, 956, 977, 999, 1020, 1043, 1066, 1089, 1112, 1136, 1160, 1184, 1209, 1234, 1260, 1286,
    1312, 1339, 1366, 1394, 1422, 1450, 1479, 1508, 1537, 1567, 1598, 1628, 1660, 1691, 1723, 1756, 1789, 1822, 1856,
    1890, 1924, 1959, 1995, 2031, 2067, 2104, 2141, 2179, 2217, 2256, 2295, 2334, 2374, 2415, 2456, 2497, 2539, 2582,
    2624, 2668, 2712, 2756, 2801, 2846, 2892, 2938, 2985, 3032, 3079, 3128, 3176, 3225, 3275, 3325, 3376, 3427, 3479,
    3531, 3584, 3637, 3691, 3745, 3799, 3855, 3910, 3967, 4023, 4081, 4138, 4197, 4255, 4315, 4374, 4435, 4495, 4557,
    4619, 4681, 4744, 4807, 4871, 4935, 5000, 5065, 5131, 5197, 5264, 5332, 5399, 5468, 5536, 5606, 5676, 5746, 5817,
    5888, 5959, 6032, 6104, 6177, 6251, 6325, 6400, 6475, 6550, 6626, 6702, 6779, 6856, 6934, 7012, 7091, 7170, 7249,
    7329, 7409, 7490, 7571, 7653, 7735, 7817, 7900, 7983, 8066, 8150, 8234, 8319, 8404, 8489, 8575, 8661, 8748, 8834,
    8922, 9009, 9097, 9185, 9273, 9362, 9451, 9541, 9630, 9720, 9811, 9901, 9992, 10083, 10174, 10266, 10358, 10450,
    10542, 10635, 10727, 10820, 10913, 11007, 11100, 11194, 11288, 11382, 11476, 11571, 11665, 11760, 11855, 11950,
    12045, 12140, 12236, 12331, 12427, 12522, 12618, 12714, 12809, 12905, 13001, 13097, 13193, 13289, 13385, 13481,
    13577, 13673, 13769, 13865, 13961, 14056, 14152, 14248, 14343, 14439, 14534, 14630, 14725, 14820, 14915, 15010,
    15104, 15199, 15293, 15387, 15481, 15575, 15669, 15762, 15855, 15948, 16041, 16133, 16226, 16317, 16409, 16500,
    16592, 16682, 16773, 16863, 16953, 17042, 17131, 17220, 17308, 17396, 17484, 17571, 17658, 17744, 17830, 17916,
    18001, 18086, 18170, 18254, 18337, 18420, 18502, 18584, 18665, 18746, 18826, 18905, 18985, 19063, 19141, 19219,
    19295, 19372, 19447, 19522, 19597, 19671, 19744, 19816, 19888, 19959, 20030, 20100, 20169, 20238, 20306, 20373,
    20439, 20505, 20570, 20634, 20698, 20760, 20822, 20884, 20944, 21004, 21063, 21121, 21178, 21235, 21290, 21345,
    21399, 21452, 21505, 21556, 21607, 21657, 21706, 21754, 21801, 21848, 21893, 21938, 21982, 22025, 22066, 22107,
    22148, 22187, 22225, 22262, 22299, 22334, 22369, 22402, 22435, 22467, 22498, 22527, 22556, 22584, 22611, 22637,
    22662, 22686, 22709, 22731, 22752, 22772, 22791, 22809, 22826, 22842, 22857, 22872, 22885, 22897, 22908, 22918,
    22927, 22935, 22942, 22948, 22953, 22957, 22960, 22962, 22963
];

// half-band FIR the SPU uses to resample in/out of the 22050 Hz reverb unit
const REVERB_FIR = [-1, 0, 2, 0, -10, 0, 35, 0, -103, 0, 266, 0, -616, 0, 1332, 0, -2960, 0, 10246, 16384, 10246, 0, -2960, 0, 1332, 0, -616, 0, 266, 0, -103, 0, 35, 0, -10, 0, 2, 0, -1];

// standard libspu reverb preset register blocks
const REVERB_PRESETS = {
    "Room": { size: 9920, regs: [125, 91, 28032, 21688, 48848, 0, 0, 47744, 22528, 21248, 1238, 819, 1008, 551, 884, 495, 820, 437, 0, 0, 0, 0, 0, 0, 0, 0, 436, 310, 184, 92, 32768, 32768] },
    "Studio Small": { size: 8000, regs: [51, 37, 28912, 20392, 48352, 17424, 49392, 39936, 21120, 20160, 996, 795, 932, 687, 882, 614, 796, 605, 604, 398, 559, 309, 466, 183, 399, 181, 180, 128, 76, 38, 32768, 32768] },
    "Studio Medium": { size: 18496, regs: [177, 127, 28912, 20392, 48352, 17680, 48880, 46272, 21120, 20160, 2308, 1899, 2084, 1631, 1954, 1558, 1900, 1517, 1516, 1070, 1295, 773, 1122, 695, 1071, 613, 612, 434, 256, 128, 32768, 32768] },
    "Studio Large": { size: 28640, regs: [227, 169, 28512, 20392, 48352, 17680, 48880, 42624, 22144, 21184, 3579, 2904, 3337, 2620, 3033, 2419, 2905, 2266, 2265, 1513, 2028, 1200, 1775, 978, 1514, 797, 796, 568, 340, 170, 32768, 32768] },
    "Hall": { size: 44512, regs: [421, 313, 24576, 20480, 19456, 47104, 48128, 49152, 24576, 23552, 5562, 4539, 5314, 4285, 4540, 3521, 4544, 3523, 3520, 2497, 3012, 1985, 2560, 1741, 2498, 1473, 1472, 1050, 628, 314, 32768, 32768] },
    "Half Echo": { size: 15360, regs: [23, 19, 28912, 20392, 48352, 17680, 48880, 34048, 24448, 21696, 881, 687, 741, 479, 688, 471, 856, 618, 470, 286, 301, 177, 287, 89, 416, 227, 88, 64, 40, 20, 32768, 32768] },
    "Space Echo": { size: 63168, regs: [829, 561, 32256, 20480, 46080, 45056, 19456, 45056, 24576, 21504, 7894, 6705, 7444, 6203, 7106, 5810, 6706, 5615, 5614, 4181, 4916, 3885, 4598, 3165, 4182, 2785, 2784, 1954, 1124, 562, 32768, 32768] },
    "Chaos Echo": { size: 98368, regs: [1, 1, 32767, 32767, 0, 0, 0, 33024, 0, 0, 8191, 4095, 4101, 5, 0, 0, 4101, 5, 0, 0, 0, 0, 0, 0, 0, 0, 4100, 4098, 4, 2, 32768, 32768] },
    "Delay": { size: 98368, regs: [1, 1, 32767, 32767, 0, 0, 0, 0, 0, 0, 8191, 4095, 4101, 5, 0, 0, 4101, 5, 0, 0, 0, 0, 0, 0, 0, 0, 4100, 4098, 4, 2, 32768, 32768] },
    "Reverb off": { size: 16, regs: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0] },
};
