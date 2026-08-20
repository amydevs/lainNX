import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { extract_snd_bin, load_bank, render_seq, write_wav_stereo, SAMPLE_RATE } from "./psx_sound.mjs";
import { try_spawn_process } from "./util.mjs";
import { OUTPUT_SFX_FOLDER } from "./extract_sfx.mjs";

// SND.BIN contains two SEQ tracks alongside the sound bank:
//   seq 0 -> lain_theme  (main site music, 2:08 + 10s fade)
//   seq 1 -> about_theme (about screen music, 1:15 + 10s fade)
// Track lengths match the PSF rip's tags.
//
// The render settings below are ground truth captured by running the PSF
// driver in a MIPS interpreter and logging its SPU register writes:
//   - reverb: Studio Medium preset, vLOUT = 0xB770, vROUT = 0xE5DE
//   - SPU main volume 0x3FFF; gain 1.0 here matches the level of the
//     originally shipped renders
//   - the schedules below replay the driver's exact voice allocation

// Which of the 24 SPU voices the driver assigns each note decides which
// still-ringing release tail gets cut when a voice is reused, which is
// audible. The driver picks voices by reading live envelope levels off the
// SPU, so the choice isn't reproducible from the sequence data alone; these
// arrays replay the slot chosen for every keyon, captured from the driver
// running in the interpreter (null = fall back to the renderer's heuristic).
const SCHEDULE_SEQ00 = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 3, 10, 11, 12, 8, 4, 5, 6, 9, 10, 13, 11, 14, 12, 15, 4, 16, 5, 10, 17, 9, 14, 15,
    4, 18, 5, 16, 10, 17, 19, 9, 14, 15, 16, 18, 20, 21, 19, 22, 23, 9, 17, 14, 15, 17, 18, 20, 21, 22, 2, 14, 7, 3,
    8, 15, 2, 3, 7, 15, 17, 8, 18, 21, 3, 22, 6, 11, 18, 7, 15, 17, 21, 22, 12, 6, 11, 7, 4, 15, 22, 21, 11, 5, 4,
    10, 15, 22, 21, 5, 11, 16, 4, 15, 21, 10, 11, 19, 23, 9, 15, 4, 21, 20, 10, 23, 9, 11, 15, 21, 23, 14, 9, 11, 21,
    2, 8, 14, 3, 3, 8, 9, 14, 21, 18, 17, 6, 7, 22, 8, 9, 5, 6, 21, 14, 7, 22, 16, 8, 5, 9, 14, 19, 4, 16, 20, 22, 9,
    10, 19, 16, 15, 23, 20, 22, 10, 9, 16, 15, 20, 10, 23, 16, 11, 2, 10, 16, 20, 3, 17, 21, 7, 2, 16, 20, 3, 5, 7,
    21, 2, 3, 7, 20, 5, 14, 22, 9, 3, 7, 9, 5, 20, 15, 3, 7, 9, 20, 5, 23, 7, 11, 5, 10, 17, 20, 11, 10, 16, 20, 11,
    10, 20, 16, 2, 22, 20, 10, 2, 20, 16, 3, 9, 2, 3, 16, 9, 3, 7, 5, 9, 22, 10, 22, 7, 9, 10, 7, 7, 20, 2, 2, 16,
    16, 3, 5, 22, 9, 5, 3, 9, 3, 22, 9, 10, 9, 22, 10, 22, 7, 20, 2, 10, 20, 7, 20, 20, 16, 20, 5, 3, 16, 20, 3, 5,
    16, 3, 20, 16, 9, 22, 20, 22, 9, 20, 10, 22, 7, 9, 22, 10, 7, 22, 22, 5, 22, 3, 5, 22, 16, 20, 3, 16, 22, 9, 10,
    10, 16, 20, 22, 9, 7, 20, 16, 9, 20, 22, 16, 22, 20, 16, 5, 20, 3, 10, 16, 3, 20, 3, 3, 7, 3, 9, 22, 13, 7, 9,
    22, 13, 5, 16, 12, 13, 16, 22, 5, 16, 5, 20, 3, 18, 6, 18, 5, 3, 18, 5, 9, 9, 13, 22, 5, 9, 13, 22, 20, 18, 5,
    20, 22, 5, 22, 18, 5, 8, 5, 18, 8, null, null, null, null, 20, 13, 13, 22, 22, 5, 22, 5, 18, 22, 18, 5, 22, 5,
    null, null, 20, 5, 13, 13, 5, 13, 5, 22, 13, 4, 13, 22, 18, 4, 22, 22, 20, 22, 5, 20, 22, 13, 18, 5, 13, 22, 4,
    19, null, null, 19, 22, 4, 19, 18, 4, 18, 22, 4, 20, 4, null, null, 22, 5, 13, 19, 20, 13, 5, 13, 13, 18, 13, 4,
    18, 13, 18, 4, null, null, 18, 22, 4, 20, 22, 22, 20, 22, 20, 5, 13, 21, 22, 13, 5, null, 13, 13, 18, 13, 4, 18,
    4, 20, 4, 20, null, null, 21, 14, 5, 14, null, null, 13, 18, null, null, 14, 13, 4, 21, 22, 14, 13, 4, null,
    null, null, null, 4, 20, 21, 20, 15, 20, 23, 20, 13, 23, 20, 23, 13, 22, 17, 13, 17, null, null, 17, 4, 22, 22,
    21, 4, 21, 11, 13, 2, 21, 2, 13, 23, 21, 23, 13, 21, 17, 22, 10, 13, 21, 22, 17, 4, 11, 22, 21, 4, 17, 21, 4, 2,
    23, 17, 21, null, null, null, null, 21, 22, 4, 22, 7, 22, 17, 22, 17, 12, 22, 12, 17, 2, 21, 17, 21, null, null,
    21, 2, 4, 16, 4, 2, 16, 2, 2, 17, 6, 3, 12, 8, null, null, null, 8, 17, 17, 21, 4, 4, 16, 16, 2, 6, 12, 3, 6, 2,
    3, null, null, null, null, 3, 12, 8, 12, 17, 21, 4, 8, 21, 17, 21, 21, 16, 21, 6, 2, 16, 21, 2, 6, 16, 2, 21, 16,
    3, 12, 21, 12, 3, 21, 8, 12, 17, null, null, null, 17, 12, 12, 6, null, null, 6, 12, 16, 21, 2, 16, 12, 3, 8, 8,
    12, 16, 21, null, 17, 16, null, 3, 16, 21, 12, 21, 16, 12, 6, 16, 2, 8, 12, 2, 16, 2, 2, 17, null, null, null,
    null, null, 3, 21, 17, 6, 12, 16, 17, 12, 21, 6, 12, 6, 2, 18, 14, 5, 14, 6, 18, null, null, 3, 3, 17, 21, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null
];

const SCHEDULE_SEQ01 = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 6, 1, 12, 13, 14, 15,
    16, 16, 18, 17, 21, 19, 20, 4, 7, 3, 9, 2, 8, 10, 11, 11, 4, 7, 3, 8, 2, 10, 11, 7, 3, 7, 7, 17, 21, 16, 18, 20,
    4, 20, 19, 9, 22, 0, 22, 16, 18, 4, 20, 9, 19, 22, 22, 0, 6, 6, 1, 23, 12, 13, 14, 10, 3, 2, 7, 8, 17, 21, 10,
    21, 2, 3, 5, 17, 8, null, 17, 10, null, null, 3, 5, 23, 12, 6, 1, null, null, 2, 13, null, 16, null, null, 9, 1,
    14, 1, 2, null, null, 16, 7, 9, 4, null, 20, 18, 19, 22, 10, 3, 17, 23, 15, null, 12, null, 6, 3, 23, null, 17,
    12, null, null, 3, 17, 17, 18, 19, 4, null, 20, 10, 23, null, 23, 15, 1, 2, 8, null, 20, 10, 22, null, 1, 15,
    null, 2, 8, 14, 14, 13, 16, 7, null, 6, 17, 5, 19, 18, 12, 4, 17, null, null, 5, 21, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null
];

const TRACKS = [
    { name: "lain_theme", length: 128, fade: 10, schedule: SCHEDULE_SEQ00 },
    { name: "about_theme", length: 75, fade: 10, schedule: SCHEDULE_SEQ01 },
];

const REVERB = {
    preset: "Studio Medium",
    depth_l: -18576 / 32768,
    depth_r: -6690 / 32768,
};

export function extract_music(tempdir, jpsxdec_jar, no_delete) {
    const snd_bin = extract_snd_bin(tempdir, jpsxdec_jar);
    const bank = load_bank(snd_bin);

    mkdirSync(OUTPUT_SFX_FOLDER, { recursive: true });

    const wav_dir = join(tempdir, "music_wav");
    mkdirSync(wav_dir, { recursive: true });

    TRACKS.forEach((track, i) => {
        const seq = bank.seqs[i];
        if (!seq) {
            console.log(`SEQ ${i} not found in SND.BIN, skipping ${track.name}`);
            return;
        }

        const opts = {
            length: track.length,
            fade: track.fade,
            gain: 1.0,
            slot_schedule: track.schedule,
            ...REVERB,
        };

        console.log(`rendering ${track.name} (${track.length}s + ${track.fade}s fade)...`);
        const { left, right } = render_seq(seq, bank.vab, opts);

        const wav = join(wav_dir, `${track.name}.wav`);
        write_wav_stereo(wav, left, right, SAMPLE_RATE);

        try_spawn_process("ffmpeg", ["-i", wav, join(OUTPUT_SFX_FOLDER, `${track.name}.mp4`)]);
    });

    if (!no_delete) {
        rmSync(wav_dir, { recursive: true });
    }
}
