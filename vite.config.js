import * as path from "node:path";
import gltf from "vite-plugin-gltf";
import glsl from "vite-plugin-glsl";
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const rootPath = "romfs:"
const basePlugin = ({ base }) => {
        const tempBase = "/DO_NOT_USE_BASE_PATH";
        return {
                name: 'base-plugin',
                config(config) {
                        return {
                                base: tempBase,
                        }
                },
                generateBundle(options, bundle) {
                        for (const file of Object.values(bundle)) {
                                console.log(file.type)
                                if (file.type === 'chunk') {
                                        file.code = file.code.replaceAll(tempBase, base);
                                }
                                else if (file.type === 'asset' && typeof file.source === 'string') {
                                        file.source = file.source.replaceAll(tempBase, base);
                                }
                        }
                }
        }
}

export default {
        define: {
                // to deal with gltf loader issues
                "location.href": "undefined",
                "__ROOT_PATH__": `"${rootPath}"`,
        },
        plugins: [
                gltf({
                        publicPath: rootPath,
                }),
                glsl(),
                viteStaticCopy({
                        targets: [
                                {
                                        src: 'src/static/json/site_a.json',
                                        dest: 'json'
                                },
                                {
                                        src: 'src/static/json/site_b.json',
                                        dest: 'json'
                                }
                        ]
                }),
                basePlugin({ base: rootPath }),
        ],
        build: {
                rollupOptions: {
                        input: {
                                main: resolve(__dirname, 'src', "main.ts"),
                        },
                        output: {
                                entryFileNames: "main.js"
                        }
                },
                outDir: "romfs",
                sourcemap: true,
        }
};