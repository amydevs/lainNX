import * as fs from "node:fs";
import * as path from "node:path";

const base = ({ base }) => {
    const tempBase = "/DO_NOT_USE_BASE_PATH";
    const isExternalAssets = base.startsWith("sdmc:")
    const outDir = !isExternalAssets ? "romfs" : base.split("/").at(-1);
    return {
        name: 'base-plugin',
        config(config) {
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
        }
    }
}

export default base;