import fs from "node:fs";
import css from "rollup-plugin-import-css";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";

const maplibreWorker = fs.readFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "utf8");

export default [
    {
        input: "src/card.js",
        plugins: [
            replace({
                include: "src/ha-frontend/**",
                preventAssignment: true,
                values: {
                    __STATIC_PATH__: JSON.stringify("/static/"),
                    __DEMO__: "false",
                    // HA's build sets these at build time; ours takes them from the running instance and this bundle.
                    __VERSION__: 'document.querySelector("home-assistant").hass.config.version',
                    __MAPLIBRE_WORKER_URL__: `URL.createObjectURL(new Blob([${JSON.stringify(maplibreWorker)}], {type: "text/javascript"}))`,
                },
            }),
            nodeResolve({extensions: [".js", ".ts"]}),
            esbuild({include: /\.ts$/, target: "es2022"}),
            commonjs(),
            json(),
            css(),
        ],
        output: {
            format: "es",
            file: "./dist/timeline_card.js",
            inlineDynamicImports: true,
            sourcemap: false,
        },
    },
];
