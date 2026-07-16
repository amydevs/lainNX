import * as fs from "node:fs";
import * as path from "node:path";
import packageJson from "../package.json";
import syllable_map from "../src/static/json/voice.json";

const REVERSE_TRANSLATION_TABLE = Object.fromEntries(
    Object
        .entries(syllable_map.translation_table)
        .map(([k, v]) => [v, k])
)
const PROJECT_ROOT = path.join(__dirname, "..");

const fsResolve = () => {
    let externalWorkingOutDir = null;
    let outDir = path.join(PROJECT_ROOT, "romfs");
    return {
        name: 'fs-resolve-plugin',
        config(config) {
            if (config.base.startsWith("sdmc:")) {
                externalWorkingOutDir = path.join(PROJECT_ROOT, packageJson.name);
            }
            if (config.build.outDir != null) {
                outDir = path.join(PROJECT_ROOT, config.build.outDir);
            }
            return {
                build: {
                    outDir: externalWorkingOutDir ?? outDir,
                }
            }
        },
        closeBundle() {
            if (externalWorkingOutDir != null) {
                fs.mkdirSync(outDir, { recursive: true });
                for (const file of fs.readdirSync(externalWorkingOutDir)) {
                    if (file.match(/^.*?\.js(\..*)?$/)) {
                        fs.renameSync(path.join(externalWorkingOutDir, file), path.join(outDir, file));
                    }
                }
            }
            const srcVoiceDir = path.join(externalWorkingOutDir ?? outDir, "voice");
            const outVoiceDir = path.join(outDir, "voice");
            fs.mkdirSync(outVoiceDir, { recursive: true });
            for (const filename of fs.readdirSync(srcVoiceDir)) {
                const matches = filename.match(/(.*)(\.(\w|\d)*)$/);
                let newFileName = matches[1]
                    .replace(/\.(\w|\d)*$/, "")
                    .split("_")
                    .map((filenameChunk) => REVERSE_TRANSLATION_TABLE[filenameChunk] ?? filenameChunk)
                    .join("_") + matches[2];

                fs.renameSync(
                    path.join(srcVoiceDir, filename),
                    path.join(outVoiceDir, newFileName),
                );
            }
        }
    }
}

export default fsResolve;