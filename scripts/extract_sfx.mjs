import { mkdirSync } from "fs";
import { join } from "path";
import { extract_snd_bin, load_bank, write_wav_mono } from "./psx_sound.mjs";

export const OUTPUT_SFX_FOLDER = join("..", "public", "sfx");

// The game's sound effects are the 34 VAG samples inside SND.BIN's VAB sound
// bank (snd_N = VAG N+1). The game keys every SFX on at note 60, so each
// sample's playback rate follows from its tone's center/fine tuning.
const NOTE = 60;
const rate_for_tone = (t) => Math.round(44100 * Math.pow(2, (NOTE + t.fine / 128 - t.center) / 12));
const DEFAULT_RATE = rate_for_tone({ center: 66, fine: 57 });

function vag_rates(vab) {
    const rates = new Array(vab.num_vags + 1).fill(0);
    for (const tone_zero_pass of [true, false]) {
        for (const prog of vab.programs) {
            if (!prog) continue;
            prog.tones.forEach((tone, i) => {
                if ((i === 0) !== tone_zero_pass) return;
                if (!rates[tone.vag]) rates[tone.vag] = rate_for_tone(tone);
            });
        }
    }
    return rates.map((r) => r || DEFAULT_RATE);
}

// snd_34 (the site rotation whoosh) is not a 35th sample: the original rip is
// snd_11's sample concatenated four times back-to-back.
const SND_34_SOURCE_VAG = 12; // snd_11
const SND_34_REPEATS = 4;

// VAG 28 (snd_27) is the bank's only looping sample - on the console it
// sustains until keyed off. These constants reproduce the original rip's
// capture of it.
const LOOP_TOTAL_SECONDS = 1.74;
const LOOP_RELEASE_SECONDS = 0.9;
const LOOP_RELEASE_DB = 20;

function render_looped(vag, sample_rate) {
    const total = Math.round(LOOP_TOTAL_SECONDS * sample_rate);
    const release = Math.round(LOOP_RELEASE_SECONDS * sample_rate);
    const out = new Float32Array(total);
    let src = 0;
    for (let i = 0; i < total; i++) {
        out[i] = vag.pcm[src];
        src++;
        if (src >= vag.pcm.length) {
            src = vag.loop_start;
        }
    }
    for (let i = 0; i < release; i++) {
        out[total - release + i] *= Math.pow(10, (-LOOP_RELEASE_DB / 20) * ((i + 1) / release));
    }
    return out;
}

export function extract_sfx(tempdir, jpsxdec_jar) {
    const snd_bin = extract_snd_bin(tempdir, jpsxdec_jar);
    const bank = load_bank(snd_bin);
    const rates = vag_rates(bank.vab);

    mkdirSync(OUTPUT_SFX_FOLDER, { recursive: true });

    for (let i = 1; i <= bank.vab.num_vags; i++) {
        const vag = bank.vab.vags[i];
        if (vag.pcm.length === 0) {
            console.log(`skipping empty VAG ${i}`);
            continue;
        }

        const name = `snd_${i - 1}`;
        const pcm = vag.loop_start >= 0 ? render_looped(vag, rates[i]) : vag.pcm;
        write_wav_mono(join(OUTPUT_SFX_FOLDER, `${name}.wav`), pcm, rates[i]);
    }

    const whoosh = bank.vab.vags[SND_34_SOURCE_VAG].pcm;
    const quad = new Float32Array(whoosh.length * SND_34_REPEATS);
    for (let i = 0; i < SND_34_REPEATS; i++) {
        quad.set(whoosh, i * whoosh.length);
    }
    write_wav_mono(join(OUTPUT_SFX_FOLDER, "snd_34.wav"), quad, rates[SND_34_SOURCE_VAG]);
}
