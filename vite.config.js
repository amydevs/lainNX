import packageJson from "./package.json";
import gltf from "vite-plugin-gltf";
import glsl from "vite-plugin-glsl";
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import basePlugin from "./vite-plugins/base";

const rootPath = `sdmc:/switch/${packageJson.name}`

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
                sourcemap: true,
        }
};