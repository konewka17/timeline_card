// Replaces src/ha-frontend with a home-assistant/frontend release tag, adding files that new imports need.
// Usage: node scripts/sync-ha-frontend.mjs <tag>. What to do next: docs/syncing-ha-frontend.md.
import fs from "node:fs";
import path from "node:path";

const REPO = "home-assistant/frontend";
const ROOT = "src/ha-frontend";
// Elements the running HA provides; rollup.config.js drops these imports
const PROVIDED_BY_HA = ["src/components/ha-tooltip.ts", "src/components/ha-state-icon.ts"];

const tag = process.argv[2];
if (!tag) {
    console.error("Usage: node scripts/sync-ha-frontend.mjs <tag>");
    process.exit(1);
}

const fetchFile = async (file) => {
    const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${tag}/${file}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    return response.text();
};

const listFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
    });

// Relative imports that stay in the bundle; esbuild drops `import type`
const runtimeImports = (source, file) =>
    [...source.matchAll(/^(import|export)\s+(?!type\b)[^;]*?from\s+"(\.{1,2}\/[^"]+)"|^import\s+"(\.{1,2}\/[^"]+)"/gms)]
        .map((match) => path.posix.join(path.posix.dirname(file), match[2] ?? match[3]))
        .map((target) => (target.endsWith(".ts") ? target : `${target}.ts`))
        .filter((target) => !PROVIDED_BY_HA.includes(target));

const files = listFiles(`${ROOT}/src`).map((file) => file.slice(ROOT.length + 1).replaceAll("\\", "/"));
const queue = [...files];
const gone = [];
const added = [];

while (queue.length) {
    const file = queue.shift();
    const local = `${ROOT}/${file}`;
    const theirs = await fetchFile(file);
    if (theirs === undefined) {
        gone.push(file);
        continue;
    }
    if (!fs.existsSync(local)) added.push(file);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, theirs);
    for (const target of runtimeImports(theirs, file)) {
        if (!files.includes(target)) {
            queue.push(target);
            files.push(target);
        }
    }
}

const response = await fetch(`https://api.github.com/repos/${REPO}/commits/${tag}`);
fs.writeFileSync(`${ROOT}/UPSTREAM`, `tag: ${tag}\ncommit: ${(await response.json()).sha}\n`);
console.log(`Gone upstream:\n${gone.join("\n") || "none"}\n\nAdded for new imports:\n${added.join("\n") || "none"}`);
