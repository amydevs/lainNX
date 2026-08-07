import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { extract_snd_bin, load_bank, write_wav_mono } from "./psx_sound.mjs";
import { try_spawn_process } from "./util.mjs";

export const OUTPUT_SFX_FOLDER = join("..", "public", "sfx");

// The game's sound effects are the 34 VAG samples inside SND.BIN's VAB sound
// bank, played back at 22050 Hz. snd_N corresponds to VAG N+1 (the VAB's VAG
// table is 1-based); this mapping and the sample rate were verified by
// cross-correlating decodes against the original rip.
//
// snd_34 (the site rotation whoosh) is not a 35th sample: the original rip is
// snd_11's sample concatenated four times back-to-back (verified against the
// original asset at 0.99 per-frame spectral similarity, matching unit length
// and level - the rotation animation plays the whoosh once per site segment).
const SFX_SAMPLE_RATE = 22050;
const SND_34_SOURCE_VAG = 12; // snd_11
const SND_34_REPEATS = 4;

// VAG 28 (snd_27) is the bank's only looping sample - on the console it
// sustains until keyed off. The original rip captured it playing through ~2.4
// loop passes with a release fade; these constants reproduce that capture
// (envelope correlation 0.97 against the original).
const LOOP_TOTAL_SECONDS = 1.74;
const LOOP_RELEASE_SECONDS = 0.9;
const LOOP_RELEASE_DB = 20;

function render_looped(vag) {
    const total = Math.round(LOOP_TOTAL_SECONDS * SFX_SAMPLE_RATE);
    const release = Math.round(LOOP_RELEASE_SECONDS * SFX_SAMPLE_RATE);
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

export function extract_sfx(tempdir, jpsxdec_jar, no_delete) {
    const snd_bin = extract_snd_bin(tempdir, jpsxdec_jar);
    const bank = load_bank(snd_bin);

    mkdirSync(OUTPUT_SFX_FOLDER, { recursive: true });

    const wav_dir = join(tempdir, "sfx_wav");
    mkdirSync(wav_dir, { recursive: true });

    for (let i = 1; i <= bank.vab.num_vags; i++) {
        const vag = bank.vab.vags[i];
        if (vag.pcm.length === 0) {
            console.log(`skipping empty VAG ${i}`);
            continue;
        }

        const name = `snd_${i - 1}`;
        const wav = join(wav_dir, `${name}.wav`);
        const pcm = vag.loop_start >= 0 ? render_looped(vag) : vag.pcm;
        write_wav_mono(wav, pcm, SFX_SAMPLE_RATE);

        try_spawn_process("ffmpeg", ["-i", wav, join(OUTPUT_SFX_FOLDER, `${name}.mp4`)]);
    }

    const whoosh = bank.vab.vags[SND_34_SOURCE_VAG].pcm;
    const quad = new Float32Array(whoosh.length * SND_34_REPEATS);
    for (let i = 0; i < SND_34_REPEATS; i++) {
        quad.set(whoosh, i * whoosh.length);
    }
    const wav = join(wav_dir, "snd_34.wav");
    write_wav_mono(wav, quad, SFX_SAMPLE_RATE);
    try_spawn_process("ffmpeg", ["-i", wav, join(OUTPUT_SFX_FOLDER, "snd_34.mp4")]);

    if (!no_delete) {
        rmSync(wav_dir, { recursive: true });
    }
}
