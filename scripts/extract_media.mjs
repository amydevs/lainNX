import { mkdirSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { try_spawn_process } from "./util.mjs";

export const OUTPUT_MOVIE_FOLDER = join("..", "public", "media", "movie");
export const OUTPUT_AUDIO_FOLDER = join("..", "public", "media", "audio");

export function extract_video(tempdir, jpsxdec_jar, no_delete) {
    // extract all video
    for (const disc_index of ["disc1.idx", "disc2.idx"]) {
        try_spawn_process("java", [
            "-jar",
            jpsxdec_jar,
            "-x",
            join(tempdir, disc_index),
            "-a",
            "video",
            "-dir",
            tempdir,
            "-quality",
            "high",
            "-vf",
            "avi:rgb",
            "-up",
            "Lanczos3",
        ]);
    }

    // create destination folder
    mkdirSync(OUTPUT_MOVIE_FOLDER, { recursive: true });

    // convert all movies to mp4
    for (const movieDir of ["MOVIE", "MOVIE2"]) {
        for (let file of readdirSync(`${join(tempdir, movieDir)}`)) {
            if (file.endsWith(".wav")) continue;
            try_spawn_process("ffmpeg", [
                "-i",
                join(tempdir, movieDir, file),
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "veryslow",
                "-level",
                "31",
                "-ar",
                "44100",
                join(OUTPUT_MOVIE_FOLDER, file.replace("avi", "mp4")),
            ]);
        }
    }

    if (!no_delete) {
        // cleanup source folders
        rmSync(join(tempdir, "MOVIE"), { recursive: true });
        rmSync(join(tempdir, "MOVIE2"), { recursive: true });
    }
}

export function extract_audio(tempdir, jpsxdec_jar, no_delete) {
    // extract all audio
    for (const disc_index of ["disc1.idx", "disc2.idx"]) {
        try_spawn_process("java", [
            "-jar",
            jpsxdec_jar,
            "-x",
            join(tempdir, disc_index),
            "-a",
            "audio",
            "-dir",
            tempdir,
        ]);
    }

    // create destination folder
    mkdirSync(OUTPUT_AUDIO_FOLDER, { recursive: true });

    // convert all audio to mp4
    for (let file of readdirSync(`${join(tempdir, "XA")}`)) {
        try_spawn_process("ffmpeg", [
            "-i",
            join(tempdir, "XA", file),
            "-ar",
            "44100",
            join(OUTPUT_AUDIO_FOLDER, file.replace("wav", "mp4")),
        ]);
    }

    if (!no_delete) {
        // cleanup source folder
        rmSync(join(tempdir, "XA"), { recursive: true });
    }
}
