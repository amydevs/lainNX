import * as zip from "@zip.js/zip.js";
// nx setup stuff
export async function init() {
    console.log("initializing...");

    // polyfill for threejs gltfloader
    Object.defineProperty(globalThis, "self", {
        value: window,
        writable: false,
        configurable: false,
        enumerable: true,
    });
    // polyfill for three.js audio and video stuff
    Object.defineProperty(window, "HTMLVideoElement", {
        value: Video,
        writable: false,
        configurable: false,
        enumerable: true,
    });
    Object.defineProperty(window, "HTMLAudioElement", {
        value: Audio,
        writable: false,
        configurable: false,
        enumerable: true,
    });

    // profile selection
    let profile = Switch.Profile.current;
    while (profile == null) {
        profile = Switch.Profile.select();
    }
    Switch.Profile.current = profile;

    const compressed_files_path = `${__ROOT_PATH__}/laingame.com`;
    if ((await Switch.statSync(compressed_files_path)) != null) {
        console.log(
            `found compressed files at ${compressed_files_path}, extracting (this might take a while)...`,
        );
        let compressed_files = Switch.file(compressed_files_path);
        const compressed_files_stream = compressed_files.stream();
        const reader = new zip.ZipReader(compressed_files.stream(), {
            useCompressionStream: true,
        });
        const file_name_filter_regex = /^(assets|emote-wheel|images|json|media|media-background-images|sfx|voice|webvtt)/;
        const file_name_asset_regex = /^assets\/(.*)-.*\.(.*)$/;
        for await (const entry of reader.getEntriesGenerator()) {
            if (!entry.filename.match(file_name_filter_regex)) {
                continue;
            }

            let new_file_path: string;
            const filename_match = entry.filename.match(file_name_asset_regex);
            if (filename_match != null) {
                new_file_path = `${__ROOT_PATH__}/assets/${filename_match[1]}.${filename_match[2]}`;
            } else {
                new_file_path = `${__ROOT_PATH__}/${entry.filename}`;
            }

            if ((await Switch.stat(new_file_path)) != null) {
                console.log(`skipping ${entry.filename}, already exists`);
                continue;
            }

            if (entry.directory) {
                await Switch.mkdir(new_file_path);
                continue;
            }
            const new_file = Switch.file(new_file_path);
            await entry.getData(new_file.writable);
            await new_file.writable.close().catch(() => {});
            console.log(`extracted ${new_file_path}`);
        }
        await compressed_files_stream.cancel().catch(() => {});
        console.log(`extracted all files, removing compressed files at ${compressed_files_path}...`);
        await Switch.remove(compressed_files_path);
    }

    // control handling

    // window.addEventListener("beforeunload", (event) => {
    //     event.preventDefault();
    // });

    // polyfill for console methods
    for (const k of ["log", "warn", "info", "error", "debug"]) {
        Object.defineProperty(console, k, {
            value: console.debug.bind(console),
            writable: false,
            configurable: false,
            enumerable: true,
        });
    }
}
