# HA frontend map code

The map is Home Assistant's own map, taken from
[home-assistant/frontend](https://github.com/home-assistant/frontend). This folder
holds those files, with the same paths as upstream (`src/common/map/...`), so
relative imports work unchanged and every file can be diffed against upstream 1:1.

The upstream release tag and commit are pinned in `UPSTREAM`. That tag also sets the
minimum Home Assistant version in `hacs.json`.

## Rules

- Nothing here is edited: every file stays byte-for-byte equal to upstream.
- Changes to what HA's code does go in `src/ha-extensions/`, as subclasses of HA's classes.
- New map behaviour: take it from HA first. Write our own code only for what HA's
  map does not do, and add it to the deviations below.

## Files

`src/components/map/ha-map.ts`, `ha-entity-marker.ts`, and every file with runtime code
they reach, plus what the card imports directly. esbuild strips the types without
type-checking, so HA's type-only imports (`types.ts`, the registries) are not needed.

## Build (`rollup.config.js`)

- HA registers `ha-map` and `ha-entity-marker` itself, so our copies get their own tags:
  `timeline-ha-map-base` and `timeline-ha-entity-marker`.
- Imports that only register an element the running HA has (`ha-tooltip`,
  `ha-state-icon`) are dropped.
- `lit/...` imports resolve with `.js`, as HA's bundler does without it.
- `__STATIC_PATH__` is `/static/`, `__DEMO__` is `false`.
- `__VERSION__`: the running instance's version. HA uses it as cache buster for
  `urls.json`, whose sprite path changes per HA build.
- `__MAPLIBRE_WORKER_URL__`: a blob URL of our own maplibre worker, so it always
  matches the bundled maplibre.

Our copies read `hass` from HA's own Lit context providers: the contexts have string
keys, and the card sits inside HA's element tree.

## Syncing

Against release tags, not `dev`: the code has to match the core of a released HA.
The steps are in `docs/syncing-ha-frontend.md`.
