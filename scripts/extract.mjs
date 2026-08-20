import { tmpdir } from "os";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { extract_video, extract_audio } from "./extract_media.mjs";
import { extract_voice } from "./extract_voice.mjs";
import { extract_lapks } from "./extract_lapks.mjs";
import { extract_sfx } from "./extract_sfx.mjs";
import { extract_music } from "./extract_music.mjs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { extract_site_images } from "./extract_site_images.mjs";
import { try_spawn_process } from "./util.mjs";
import { extract_sprites } from "./extract_sprites.mjs";
import { existsSync } from "fs";
import commandExists from 'command-exists';
import { validate_extraction } from "./validate.mjs";

for (const program of ["magick", "ffmpeg", "java"]) {
    if (!commandExists.sync(program)) {
        console.error(`${program} is not available, exiting.`);
        process.exit();
    }
}

const argv = yargs(hideBin(process.argv))
    .option("no_delete", {
        type: "boolean",
        description:
            "Don't delete any temporary files or directories, useful when using --tempdir (WARNING: uses 6+ GB of space)",
    })
    .option("tempdir", {
        type: "string",
        description: "Path to a temporary directory",
        default: mkdtempSync(join(tmpdir(), "extractor-")),
    })
    .option("no_index", {
        type: "boolean",
        description: "Don't generate an index file for each disc, the index files MUST exist already",
    })
    .option("no_video", {
        type: "boolean",
        description: "Don't extract video",
    })
    .option("no_audio", {
        type: "boolean",
        description: "Don't extract audio",
    })
    .option("no_voice", {
        type: "boolean",
        description: "Don't extract voice.bin",
    })
    .option("no_lapks", {
        type: "boolean",
        description: "Don't extract lapks.bin",
    })
    .option("no_sprites", {
        type: "boolean",
        description: "Don't extract sprites",
    })
    .option("no_site_images", {
        type: "boolean",
        description: "Don't extract sitea.bin or siteb.bin",
    })
    .option("no_sfx", {
        type: "boolean",
        description: "Don't extract sound effects from SND.BIN",
    })
    .option("no_music", {
        type: "boolean",
        description: "Don't render music (lain_theme/about_theme) from SND.BIN",
    }).argv;

mkdirSync(argv.tempdir, { recursive: true });

const jpsxdec_jar = resolve(join("jpsxdec", "jpsxdec.jar"));

// generate disc indexes
if (!argv.no_index) {
    for (const disc of ["disc1", "disc2"]) {
        const path = join("discs", disc + ".bin");

        if (!existsSync(path)) {
            console.log(disc + " not found, exiting");
            process.exit();
        }

        try_spawn_process("java", ["-jar", jpsxdec_jar, "-f", path, "-x", join(argv.tempdir, disc + ".idx")]);
    }
}

if (!argv.no_video) {
    extract_video(argv.tempdir, jpsxdec_jar, argv.no_delete);
}

if (!argv.no_audio) {
    extract_audio(argv.tempdir, jpsxdec_jar, argv.no_delete);
}

if (!argv.no_voice) {
    extract_voice(argv.tempdir, jpsxdec_jar);
}

if (!argv.no_lapks) {
    extract_lapks(argv.tempdir, jpsxdec_jar);
}

if (!argv.no_sprites) {
    await extract_sprites(argv.tempdir, jpsxdec_jar);
}

if (!argv.no_site_images) {
    extract_site_images(argv.tempdir, jpsxdec_jar);
}

if (!argv.no_sfx) {
    extract_sfx(argv.tempdir, jpsxdec_jar, argv.no_delete);
}

if (!argv.no_music) {
    extract_music(argv.tempdir, jpsxdec_jar, argv.no_delete);
}

if (!argv.no_delete) {
    rmSync(argv.tempdir, { recursive: true });
}

validate_extraction()