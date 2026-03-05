import css from "rollup-plugin-import-css";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default [
    {
        input: "src/card.js",
        plugins: [nodeResolve({}), commonjs(), json(), css()],
        output: {
            format: "es",
            file: "./dist/timeline_card.js",
            sourcemap: false,
        },
    },
];
