import packageJson from "./package.json";
import gltf from "vite-plugin-gltf";
import glsl from "vite-plugin-glsl";
import { resolve } from 'path'
import { viteStaticCopy } from "vite-plugin-static-copy";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import baseRename from "./vite-plugins/base-rename";
import fsResolve from "./vite-plugins/fs-resolve";


const base = process.env.ROOT_PATH || `sdmc:/switch/${packageJson.name}`
const assetsDirName = "assets";

/** @type {import('vite').UserConfig} */
export default {
        base,
        define: {
                // to deal with gltf loader issues
                "location.href": "undefined",
                "__ROOT_PATH__": `"${base}"`,
        },
        plugins: [
                gltf({
                        publicPath: `${base}/${assetsDirName}`,
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
                nodePolyfills({
                        include: ["stream"],
                }),
                baseRename(),
                fsResolve(),
        ],
        build: {
                target: "ES2022",
                rolldownOptions: {
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