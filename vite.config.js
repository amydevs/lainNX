import gltf from "vite-plugin-gltf";
import glsl from "vite-plugin-glsl";
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default {
        define: {
                "location.href": "undefined"
        },
        plugins: [
                gltf({
                        publicPath: 'romfs:',
                        transforms: [
                                (s) => {

                                }
                        ]
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
                })
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