// Brings src/ha-frontend to a newer home-assistant/frontend release tag and writes
// sync-report.md for the steps in docs/syncing-ha-frontend.md.
// Usage: node scripts/sync-ha-frontend.mjs <tag>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = "home-assistant/frontend";
const ROOT = "src/ha-frontend";
const REPORT = "sync-report.md";
// Not taken over; their changes may need porting by hand into these files
const PORTED = {
    "src/components/map/ha-map.ts": ["src/timeline-map.ts", "src/ha-map-styles.ts"],
    "src/components/map/ha-entity-marker.ts": ["src/ha-entity-marker.ts"],
    "src/panels/lovelace/cards/hui-map-card.ts": ["src/card.js", "src/card.css", "src/config-flow.js"],
};

const tag = process.argv[2];
if (!tag) {
    console.error("Usage: node scripts/sync-ha-frontend.mjs <tag>");
    process.exit(1);
}

const github = async (endpoint) => {
    const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
    const response = await fetch(`https://api.github.com/repos/${REPO}/${endpoint}`, { headers });
    if (!response.ok) throw new Error(`${endpoint}: ${response.status}`);
    return response.json();
};

const fetchFile = async (sha, file) => {
    const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${file}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${file}@${sha}: ${response.status}`);
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
        .map((target) => (target.endsWith(".ts") ? target : `${target}.ts`));

const upstream = Object.fromEntries(
    fs
        .readFileSync(`${ROOT}/UPSTREAM`, "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(": ")),
);
const newSha = (await github(`commits/${tag}`)).sha;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ha-sync-"));

const files = listFiles(`${ROOT}/src`).map((file) => file.slice(ROOT.length + 1).replaceAll("\\", "/"));
const queue = [...files];
const conflicts = [];
const updated = [];
const removed = [];
const added = [];

while (queue.length) {
    const file = queue.shift();
    const local = `${ROOT}/${file}`;
    const theirs = await fetchFile(newSha, file);
    if (theirs === undefined) {
        removed.push(file);
        continue;
    }
    if (!fs.existsSync(local)) {
        fs.mkdirSync(path.dirname(local), { recursive: true });
        fs.writeFileSync(local, theirs);
        added.push(file);
    } else {
        const base = (await fetchFile(upstream.commit, file)) ?? "";
        const ours = fs.readFileSync(local, "utf8").replace(/\r\n/g, "\n");
        const [baseFile, theirsFile] = ["base", "theirs"].map((name) => path.join(tmp, name));
        fs.writeFileSync(baseFile, base);
        fs.writeFileSync(theirsFile, theirs);
        fs.writeFileSync(local, ours);
        const merge = spawnSync("git", [
            "merge-file",
            "-L", "ours",
            "-L", upstream.tag,
            "-L", tag,
            local,
            baseFile,
            theirsFile,
        ]);
        if (merge.status !== 0) conflicts.push(file);
        if (fs.readFileSync(local, "utf8") !== ours) updated.push(file);
    }
    for (const target of runtimeImports(theirs, file)) {
        if (!files.includes(target) && !queue.includes(target) && !added.includes(target)) {
            queue.push(target);
            files.push(target);
        }
    }
}

const upstreamDiff = (before, after) => {
    const [beforeFile, afterFile] = ["before", "after"].map((name) => path.join(tmp, name));
    fs.writeFileSync(beforeFile, before);
    fs.writeFileSync(afterFile, after);
    const diff = spawnSync("git", ["diff", "--no-index", "--no-color", beforeFile, afterFile], { encoding: "utf8" });
    return diff.stdout.split("\n").slice(4).join("\n");
};
const list = (items) => (items.length ? items.map((item) => `- \`${item}\``).join("\n") : "None.");

const report = [
    `# Sync ${upstream.tag} -> ${tag}`,
    "",
    `Commits: \`${upstream.commit}\` -> \`${newSha}\``,
    "",
    "## Conflicts",
    "",
    "Conflict markers in these files: `ours` is this repo (with the patch), the new tag is upstream.",
    "",
    list(conflicts),
    "",
    "## Gone upstream",
    "",
    list(removed),
    "",
    "## Added for new imports",
    "",
    list(added),
    "",
    "## Merged without conflicts",
    "",
    list(updated.filter((file) => !conflicts.includes(file))),
    "",
    "## Hand-ported files changed upstream",
];
let portedChanged = false;
for (const [file, ports] of Object.entries(PORTED)) {
    const before = await fetchFile(upstream.commit, file);
    const after = await fetchFile(newSha, file);
    if (before === after) continue;
    portedChanged = true;
    report.push(
        "",
        `### \`${file}\``,
        "",
        `Ported in: ${ports.map((port) => `\`${port}\``).join(", ")}`,
        "",
        "```diff",
        after === undefined ? "(removed upstream)" : upstreamDiff(before ?? "", after),
        "```",
    );
}
if (!portedChanged) report.push("", "None.");

fs.writeFileSync(REPORT, report.join("\n") + "\n");
fs.writeFileSync(`${ROOT}/UPSTREAM`, `tag: ${tag}\ncommit: ${newSha}\n`);
fs.rmSync(tmp, { recursive: true });
console.log(
    `${upstream.tag} -> ${tag}: ${conflicts.length} conflicts, ${updated.length} merged, ${added.length} added, ${removed.length} gone. See ${REPORT}.`,
);
