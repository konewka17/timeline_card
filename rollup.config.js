import fs from "node:fs";
import css from "rollup-plugin-import-css";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";

const maplibreWorker = fs.readFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "utf8");

// HA registers these elements itself. Our copies of ha-map and ha-entity-marker get their own tag;
// imports that only register an element HA already has are dropped.
const haOwnElements = {
    name: "ha-own-elements",
    resolveId(source, importer, options) {
        if (!importer?.includes("ha-frontend")) return;
        if (/\/ha-(tooltip|state-icon)$/.test(source)) return "\0ha-own-element";
        // HA's bundler resolves lit's subpaths without an extension.
        if (source.startsWith("lit/") && !source.endsWith(".js")) {
            return this.resolve(source + ".js", importer, {...options, skipSelf: true});
        }
    },
    load(id) {
        if (id === "\0ha-own-element") return "";
    },
    transform(code, id) {
        if (!/ha-frontend[\\/]src[\\/]components[\\/]map[\\/]/.test(id)) return;
        return code
            .replace('customElement("ha-map")', 'customElement("timeline-ha-map-base")')
            .replace(/(?<![.\/])ha-entity-marker/g, "timeline-ha-entity-marker");
    },
};

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
            haOwnElements,
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
