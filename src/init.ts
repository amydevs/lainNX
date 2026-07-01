import * as zip from "@zip.js/zip.js";

const FILE_NAME_FILTER_REGEX =
        /^(assets|emote-wheel|images|json|media|media-background-images|sfx|webvtt)/;

async function is_directory(path: string): Promise<boolean> {
    const stat = await Switch.stat(path);
    if (stat == null) {
        return false;
    }
    const S_IFDIR = 0x4000;
    return (stat.mode & S_IFDIR) === S_IFDIR;
}

async function extract(compressed_files_path: string) {
    const compressed_files = Switch.file(compressed_files_path, { bigFile: true });
    const compressed_files_stream = compressed_files.stream();
    const reader = new zip.ZipReader(compressed_files.stream(), {
        useCompressionStream: true,
        useWebWorkers: false,
    });
    let total = 0;
    const entries_stream = reader.getEntriesGenerator({
        onprogress: (_p, t) => {
            total = t;
        },
    });
    let i = 0;
    for await (const entry of entries_stream) {
        i++;
        if (!entry.filename.match(FILE_NAME_FILTER_REGEX)) {
            continue;
        }

        let new_file_path = `${__ROOT_PATH__}/${entry.filename}`;

        if ((await Switch.stat(new_file_path)) != null) {
            console.log(`${i}/${total} skipping ${entry.filename}, already exists (${i}/${total})`);
            continue;
        }

        if (entry.directory) {
            await Switch.mkdir(new_file_path);
            continue;
        }
        console.log(`extracting ${new_file_path} (${i}/${total})`);
        const new_file = Switch.file(new_file_path);
        await entry.getData(new_file.writable);
        await new_file.writable.close().catch(() => {});
    }
    await compressed_files_stream.cancel().catch(() => {});
    const new_compressed_files_path = `${compressed_files_path}.old`;
    console.debug(`finished extraction at ${new Date().toISOString()}`);
    console.log(
        `extracted all files, renaming compressed files from ${compressed_files_path} to ${new_compressed_files_path}...`,
    );
    await Switch.rename(compressed_files_path, new_compressed_files_path);
    console.log(`rename complete, you may delete ${new_compressed_files_path} if you wish to free up space`);
}

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
    // polyfill for console methods
    for (const k of ["log", "warn", "info", "error"] as const) {
        const original = console[k].bind(console);
        Object.defineProperty(console, k, {
            value: (...args: any[]) => {
                console.debug(...args);
                original(...args);
            },
            writable: false,
            configurable: false,
            enumerable: true,
        });
    }

    // profile selection
    let profile = Switch.Profile.current;
    while (profile == null) {
        profile = Switch.Profile.select();
    }
    Switch.Profile.current = profile;

    let found_assets_path: string | null = null;
    for (const filename of ["laingame.com", "laingame.zip", "laingame"]) {
        const path = `${__ROOT_PATH__}/${filename}`;
        if ((await Switch.stat(path)) != null) {
            found_assets_path = path;
            break;
        }
    }
    if (found_assets_path != null) {
        if (await is_directory(found_assets_path)) {
            console.log(
                `found uncompressed assets at ${found_assets_path}, copying over files (this might take a while)...`,
            );
            Switch.setMediaPlaybackState(true);
            console.log("disabled sleep whilst extracting files");
            for await (const file of await Switch.readDir(found_assets_path)) {
                if (!file.name.match(FILE_NAME_FILTER_REGEX)) {
                    continue;
                }
                const new_file_path = `${__ROOT_PATH__}/${file.name}`;
                if ((await Switch.stat(new_file_path)) != null) {
                    console.log(`skipping ${file.name}, already exists`);
                    continue;
                }
                console.log(`moving ${file.name} to ${new_file_path}`);
                await Switch.rename(`${found_assets_path}/${file.name}`, new_file_path);
            }
            Switch.setMediaPlaybackState(false);
            console.log(`reenabled sleep after extracting files`);
        }
        else {
            console.log(
                `found compressed assets at ${found_assets_path}, extracting (this might take a while)...`,
            );
            console.log(
                `if you find this process too slow,\nyou may also extract the files in "laingame.com" manually to ${__ROOT_PATH__}`,
            );
            console.debug(`started extraction at ${new Date().toISOString()}`);
            Switch.setMediaPlaybackState(true);
            console.log("disabled sleep whilst extracting files");
            console.log(
                "docking is recommended whilst this happens, ESPECIALLY IF YOU HAVE AN OLED SWITCH IN CASE OF BURN-IN",
            );
            console.log(
                "if you need to dock your switch,\nplease restart LainNX after doing so as a bug will cause the extraction to fail if you dock mid-extraction",
            );
            await extract(found_assets_path);
            Switch.setMediaPlaybackState(false);
            console.log(`reenabled sleep after extracting files`);
        }
    }

    console.log(`renaming potentially misnamed files in ${__ROOT_PATH__}/assets...`);
    const file_name_asset_regex = /^(.*)-.*\.(.*)$/;
    for await (const file of await Switch.readDir(`${__ROOT_PATH__}/assets`)) {
        const filename_match = file.name.match(file_name_asset_regex);
        if (filename_match != null) {
            const new_file_path = `${__ROOT_PATH__}/assets/${filename_match[1]}.${filename_match[2]}`;
            if ((await Switch.stat(new_file_path)) == null) {
                await Switch.rename(`${__ROOT_PATH__}/assets/${file.name}`, new_file_path);
                console.log(`renamed ${file.name} to ${new_file_path}`);
            } else {
                await Switch.remove(`${__ROOT_PATH__}/assets/${file.name}`);
                console.log(`deleted ${file.name} as ${new_file_path} already exists`);
            }
        }
    }

    window.addEventListener("beforeunload", (event) => {
        event.preventDefault();
    });
}
