import * as fs from "node:fs";
import * as path from "node:path";
import package_json from "../package.json";
import syllable_map from "../src/static/json/voice.json";

const REVERSE_TRANSLATION_TABLE = Object.fromEntries(
    Object
        .entries(syllable_map.translation_table)
        .map(([k, v]) => [v, k])
)

const base = ({ base }) => {
    const tempBase = "/DO_NOT_USE_BASE_PATH";
    const isExternalAssets = base.startsWith("sdmc:")
    const outDir = !isExternalAssets ? "romfs" : package_json.name;
    return {
        name: 'base-plugin',
        config() {
            return {
                base: tempBase,
                build: {
                    outDir,
                }
            }
        },
        generateBundle(options, bundle) {
            for (const file of Object.values(bundle)) {
                if (file.type === 'chunk') {
                    file.code = file.code.replaceAll(tempBase, base);
                }
                else if (file.type === 'asset' && typeof file.source === 'string') {
                    file.source = file.source.replaceAll(tempBase, base);
                }
            }
        },
        closeBundle() {
            if (isExternalAssets) {
                if (fs.existsSync("romfs")) {
                    fs.rmSync("romfs", { recursive: true, force: true });
                }
                fs.mkdirSync("romfs");
                for (const file of fs.readdirSync(outDir)) {
                    if (file.match(/^main\.js\.?/)) {
                        fs.cpSync(path.join(outDir, file), path.join("romfs", file));
                        fs.rmSync(path.join(outDir, file))
                    }
                }
            }
            const romfsVoiceDir = path.join("romfs", "voice");
            if (fs.existsSync(romfsVoiceDir)) {
                fs.rmSync(romfsVoiceDir, { recursive: true, force: true });
            }
            fs.mkdirSync(romfsVoiceDir);
            for (const filename of fs.readdirSync(path.join(outDir, "voice"))) {
                const matches = filename.match(/(.*)(\.(\w|\d)*)$/);
                let newFileName = matches[1]
                    .replace(/\.(\w|\d)*$/, "")
                    .split("_")
                    .map((filenameChunk) => REVERSE_TRANSLATION_TABLE[filenameChunk] ?? filenameChunk)
                    .join("_") + matches[2];

                fs.renameSync(
                    path.join(outDir, "voice", filename),
                    path.join(romfsVoiceDir, newFileName)
                );
            }
        }
    }
}

export default base;