# Syncing the HA map code

Brings `src/ha-frontend` and the ports of HA code up to a newer Home Assistant
release. Background: `src/ha-frontend/README.md`.

1. **Pick the tag.** Sync to the frontend that a released HA pins:

   ```bash
   gh api "repos/home-assistant/core/contents/homeassistant/components/frontend/manifest.json?ref=<HA version>" --jq .content | base64 -d
   ```

2. **Run the script** on a new branch:

   ```bash
   GITHUB_TOKEN=$(gh auth token) node scripts/sync-ha-frontend.mjs <frontend tag>
   ```

   It merges every file in `src/ha-frontend`, adds files that new imports need,
   updates `UPSTREAM` and writes `sync-report.md` (git-ignored).

3. **Work through `sync-report.md`**, section by section:
   - *Conflicts*: they touch the patch (README, "Patch"). Keep upstream's change and
     re-apply the patch on top. If upstream now does what part of the patch did,
     drop that part and update the README.
   - *Gone upstream*: find where upstream moved it, and fix our imports.
   - *Added for new imports*: nothing to do unless the build fails.
   - *Hand-ported files changed upstream*: each diff lists the files it was ported
     into. Port what touches behaviour this card has; skip features it does not
     have (editing, the panel overview, history options). Changes to the static
     styles of `ha-map.ts` go into `src/ha-map-styles.ts` verbatim. New options in
     `hui-map-card.ts` follow the options rule in the README.

4. **Check the deviations** in the README: whatever HA now does itself, remove
   from our code and from the table.

5. **Finish**: set `homeassistant` in `hacs.json` to the HA version from step 1,
   `npm run build`, test in HA on MapLibre and on the Leaflet fallback (WebGL off),
   and commit as `build: sync HA map code to <frontend tag>`.
