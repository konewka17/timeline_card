# Syncing the HA map code

Brings `src/ha-frontend` to a newer Home Assistant release, and our code with it. For
Claude to work through with Tom, on a new branch. Background: `src/ha-frontend/README.md`.

1. **Pick the tag.** Sync to the frontend that a released HA pins:

   ```bash
   gh api "repos/home-assistant/core/contents/homeassistant/components/frontend/manifest.json?ref=<HA version>" --jq .content | base64 -d
   ```

2. **Run the script.** It replaces every file in `src/ha-frontend` with upstream's, adds
   files that new imports need, updates `UPSTREAM`, and lists what is gone or added:

   ```bash
   node scripts/sync-ha-frontend.mjs <frontend tag>
   ```

3. **Fix what the list shows.**
   - Gone upstream: find where it moved, and fix the imports.
   - Added: if the file has `@customElement`, HA registers that tag too. Add it to the
     renames or the dropped imports in `rollup.config.js`.
   - New npm imports: add them to `package.json`, at the version in HA's `package.json`.

4. **Check our subclasses against `git diff src/ha-frontend`.** Everything upstream changed
   is in that diff, and the classes in `src/ha-extensions/` reach into its private members.
   For each extension, look at every member it overrides or uses (`super.x`, `this._x`) and
   compare with the diff:
   - changed: adapt the extension;
   - now does what our override did: remove the override;
   - renamed or gone: find the replacement. There is no merge conflict for this, so
     nothing else will flag it. Also check the strings the extensions and
     `rollup.config.js` rely on: `ha-map-path-` as path id, and the tags.

5. **Look at `hui-map-card.ts`**, which is not vendored: diff it between the old and the new
   commit in `UPSTREAM`. Port what touches behaviour this card has (`src/card.js`,
   `src/card.css`, `src/config-flow.js`). New options follow the options rule in the README.

6. **Check the deviations** in the README: whatever HA now does itself, remove from our
   code and from the table.

7. **Finish**: set `homeassistant` in `hacs.json` to the HA version from step 1,
   `npm run build`, have Tom test in HA on MapLibre and on the Leaflet fallback (WebGL off),
   and commit as `build: sync HA map code to <frontend tag>`.
