import css from "rollup-plugin-import-css";
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from "@rollup/plugin-commonjs";

export default [{
    input: "src/card.js",
    plugins: [nodeResolve({}), commonjs(), css()],
    output: {
        format: "es",
        file: "./dist/timeline_card.js",
        sourcemap: false
    }
}];
