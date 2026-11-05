# HA frontend map code

The map draws on Home Assistant's own map engines, taken from
[home-assistant/frontend](https://github.com/home-assistant/frontend). This folder
holds those files, with the same paths as upstream (`src/common/map/...`), so
relative imports work unchanged and every file can be diffed against upstream 1:1.

The upstream release tag and commit are pinned in `UPSTREAM`. That tag also sets the
minimum Home Assistant version in `hacs.json`.

## Rules

- Change files here only as part of the patch below. Everything else stays
  byte-for-byte equal to upstream.
- New map behaviour: take it from HA first. Write our own code only for what HA's
  map does not do, and add it to the deviations below.
- `ha-map.ts`, `ha-entity-marker.ts` and `hui-map-card.ts` are not here: they hang off
  HA's Lit contexts, and HA defines `ha-entity-marker` itself. Ports of them live
  outside this folder (below).

## Files

Taken over unchanged: the files under `src/` here with runtime code reachable from
the two engines, `map-styles`, `build-map-style`, `map-theme-colors`, `zone-marker`,
`entity-map-colors`, `data/map_tiles` and `data/entity/entity_registry` (for the
zone colours) and `common/entity/get_entity_location`. esbuild strips the types without
type-checking, so HA's type-only imports (`types.ts`, the registries) are not needed.

Ported, outside this folder:
- `src/ha-map-styles.ts`: the static styles of `ha-map.ts`, minus its `:host` rule, with
  `timeline-entity-marker` for the marker tag.
- `src/timeline-map.ts`: engine lifecycle, fallback, fitting, entity markers, cluster
  bubbles and zones from `ha-map.ts`.
- `src/ha-entity-marker.ts`: `ha-entity-marker.ts` as `<timeline-entity-marker>`;
  the map sets `stateObj` (HA reads it from a context) and handles the tap.
  `tsconfig.json` has HA's decorator settings for it.

Build globals (`rollup.config.js`):
- `__STATIC_PATH__` is `/static/`, `__DEMO__` is `false`.
- `__VERSION__`: the running instance's version. HA uses it as cache buster for
  `urls.json`, whose sprite path changes per HA build.
- `__MAPLIBRE_WORKER_URL__`: a blob URL of our own maplibre worker, so it always
  matches the bundled maplibre.

## Patch

Paths: line width, a border, an animated dash, and a click callback. Kept in the
shape of an upstream PR; if HA accepts it, it disappears at the next sync.

- `map-engine.ts`: the optional `MapPath` fields, and `MapPathDash` and
  `animatePathDash` at the end.
- `engines/maplibre-map-engine.ts` `addPath`: a `-border` line layer, the dash
  stepped through `line-dasharray` with butt caps, round caps and joins otherwise, click
  and pointer on the line layer.
- `engines/leaflet-map-engine.ts` `addPath` / `_drawPath`: a border polyline, the
  dash moved through `dashOffset` with butt caps, click on the line.

## Deliberate deviations from HA's map

| Feature | Origin | Where |
|---|---|---|
| Border around the active path | 159f404, cd2dca2 | patch |
| Marching ants on the highlighted segment, `animate_highlighted_path` | b98290d | patch |
| Clicking a path switches entity | #16 | patch |
| Clicking an entity marker switches entity, instead of more-info | v2 | `timeline-map.ts` |
| In a bubble only the active entity's frame takes its colour (HA: every frame, when paths show); a loose inactive marker is dimmed | v2 | `timeline-map.ts`, `ha-entity-marker.ts` |
| Fit modes: full path / current location / segment | #43, #46 | `timeline-map.ts` |
| Fits keep room at the top for the floating entity markers | v2 | `timeline-map.ts` |
| Several entities with their own colours, inactive at 0.8 opacity | #16 | `timeline-map.ts` |
| `hide_unselected_on_map` | ba869e3 | `timeline-map.ts` |
| Stay markers with zone icon on the path | cd2dca2 | `timeline-map.ts` |
| Single entity's current location as a blue dot, `current_location_marker` | #46 | `timeline-map.ts` |
| `show_zones`: all non-passive zones (HA: zones listed as entities, or `show_all`) | v2 | `timeline-map.ts` |
| `map_height_px` | #28, #36 | card layout |

## Syncing

Against release tags, not `dev`: the code has to match the core of a released HA.
The steps are in `docs/syncing-ha-frontend.md`.
