import packageJson from "./package.json";
import gltf from "vite-plugin-gltf";
import glsl from "vite-plugin-glsl";
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import base from "./vite-plugins/base";
import nxjsConfig from "./vite-plugins/nxjs-config";


const rootPath = `sdmc:/switch/${packageJson.name}`
// uncomment this to make a self contained package
// const rootPath = "romfs:";
const assetsDirName = "assets";

export default {
        define: {
                // to deal with gltf loader issues
                "location.href": "undefined",
                "__ROOT_PATH__": `"${rootPath}"`,
        },
        plugins: [
                gltf({
                        publicPath: `${rootPath}/${assetsDirName}`,
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
                base({ base: rootPath }),
                nxjsConfig(),
        ],
        build: {
                target: "ES2022",
                rollupOptions: {
                        input: {
                                main: resolve(__dirname, 'src', "main.ts"),
                        },
                        output: {
                                assetFileNames: `${assetsDirName}/[name][extname]`,
                                chunkFileNames: '[name].js',
                                entryFileNames: "[name].js"
                        }
                },
                sourcemap: true,
        }
};