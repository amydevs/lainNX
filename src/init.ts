import JSONC from "tiny-jsonc";
import { ZipReader } from "@zip.js/zip.js";
import {
    get_user_language,
    Key,
    KEYBINDINGS_KEY,
    LANG_KEY,
    read_key_mappings,
    SUPPORTED_LANGUAGES,
} from "./engine";
import { Button } from "@nx.js/constants";

const CONFIG_FILE_PATH = `${__ROOT_PATH__}/config.json`;
const ASSET_FILE_NAME_FILTER_REGEX =
    /^(assets|emote-wheel|images|json|media|media-background-images|sfx|webvtt)/;

async function is_directory(path: string): Promise<boolean> {
    const stat = await Switch.stat(path);
    if (stat == null) {
        return false;
    }
    const S_IFDIR = 0x4000;
    return (stat.mode & S_IFDIR) === S_IFDIR;
}

async function extract(compressed_files_path: string): Promise<void> {
    const compressed_files = Switch.file(compressed_files_path, { bigFile: true });
    const compressed_files_stream = compressed_files.stream();
    const reader = new ZipReader(compressed_files.stream(), {
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
        if (!entry.filename.match(ASSET_FILE_NAME_FILTER_REGEX)) {
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
    console.debug(`finished extraction at ${new Date().toISOString()}`);
}

function to_readable_key_mappings(keymap: Record<string, Key>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(keymap).map(([action, key]) => [Button[parseInt(action.toString())], Key[key]]),
    );
}

function from_readable_key_mappings(readable_keymap: Record<string, string>): Record<string, Key> {
    return Object.fromEntries(
        Object.entries(readable_keymap).map(([action, key]) => [
            Button[action as keyof typeof Button],
            Key[key as keyof typeof Key],
        ]),
    );
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

    // config file creation
    if ((await Switch.stat(CONFIG_FILE_PATH)) == null) {
        console.log(`config file not found at ${CONFIG_FILE_PATH}, creating...`);
        localStorage!.removeItem(LANG_KEY);
        localStorage!.removeItem(KEYBINDINGS_KEY);
        const config = {
            COMMENT_RESERVE_KEY: "",
            [LANG_KEY]: get_user_language().code,
            [KEYBINDINGS_KEY]: to_readable_key_mappings(read_key_mappings()),
        };
        const config_json = JSON.stringify(config, null, 4);
        const config_jsonc = config_json.replace(
            /"COMMENT_RESERVE_KEY":.*/,
            `// supported languages: ${SUPPORTED_LANGUAGES.map((lang) => lang.code).join(", ")}`,
        );
        await Switch.writeFile(CONFIG_FILE_PATH, config_jsonc);
    } else {
        try {
            console.log(`config file found at ${CONFIG_FILE_PATH}, loading...`);
            const config_file = JSONC.parse(await Switch.file(CONFIG_FILE_PATH).text());
            if (config_file == null) {
                throw new Error("could not parse config file");
            }
            localStorage!.setItem(LANG_KEY, config_file[LANG_KEY as unknown as keyof typeof config_file]);
            localStorage!.setItem(
                KEYBINDINGS_KEY,
                JSON.stringify(
                    from_readable_key_mappings(
                        config_file[KEYBINDINGS_KEY as unknown as keyof typeof config_file],
                    ),
                ),
            );
        } catch (_e) {
            console.error(`failed to load config file at ${CONFIG_FILE_PATH}, returning to defaults...`);
        }
    }

    // asset extraction
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
                if (!file.name.match(ASSET_FILE_NAME_FILTER_REGEX)) {
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
        } else {
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
        const new_found_assets_path = `${found_assets_path}.old`;
        console.log(
            `asset extraction complete, renaming compressed files from ${found_assets_path} to ${new_found_assets_path}...`,
        );
        await Switch.rename(found_assets_path, new_found_assets_path);
        console.log(`rename complete, you may delete ${new_found_assets_path} if you wish to free up space`);
    }

    // asset renaming
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

    // allow for + button to work
    window.addEventListener("beforeunload", (event) => {
        event.preventDefault();
    });

    console.log("finished initializing");
}
