# HA frontend map code

The map draws on Home Assistant's own map engines, taken from
[home-assistant/frontend](https://github.com/home-assistant/frontend). This folder
holds those files, with the same paths as upstream (`src/common/map/...`), so
relative imports work unchanged and every file can be diffed against upstream 1:1.

The upstream release tag and commit are pinned in `UPSTREAM`. That tag also sets the
minimum Home Assistant version in `hacs.json`.

## Rules

- Everything here stays byte-for-byte equal to upstream.
- New map behaviour: take it from HA first.

## Files

Taken over unchanged: the files under `src/` here with runtime code reachable from
the two engines, `map-styles`, `build-map-style`, `map-theme-colors`, `zone-marker`,
`entity-map-colors`, `data/map_tiles` and `data/entity/entity_registry` (for the
zone colours) and `common/entity/get_entity_location`. esbuild strips the types without
type-checking, so HA's type-only imports (`types.ts`, the registries) are not needed.

Build globals (`rollup.config.js`):
- `__STATIC_PATH__` is `/static/`, `__DEMO__` is `false`.
- `__VERSION__`: the running instance's version. HA uses it as cache buster for
  `urls.json`, whose sprite path changes per HA build.
- `__MAPLIBRE_WORKER_URL__`: a blob URL of our own maplibre worker, so it always
  matches the bundled maplibre.

## Syncing

Against release tags, not `dev`: the code has to match the core of a released HA.
The steps are in `docs/syncing-ha-frontend.md`.
