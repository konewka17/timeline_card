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

## `src/ha-extensions/`

Our code on top of HA's classes:

- `maplibre-map-engine.ts`, `leaflet-map-engine.ts`: extend HA's engines with line width,
  a border, an animated dash and a click callback on paths (`path-style.ts`).
- `timeline-map.ts`: extends `HaMap`. HA keeps the engine lifecycle, theme, zones, entity
  markers and clustering; this adds the day's paths, the highlight, fit modes and stays.

Subclasses reach into private members of HA's classes, so an upstream change there gives
no merge conflict but can change behaviour. `docs/syncing-ha-frontend.md` says how to
check them.

## Deliberate deviations from HA's map

| Feature | Origin | Where |
|---|---|---|
| Border around the active path | 159f404, cd2dca2 | engines |
| Marching ants on the highlighted segment, `animate_highlighted_path` | b98290d | engines |
| Clicking a path switches entity | #16 | engines |
| Clicking an entity marker switches entity, instead of more-info | v2 | `timeline-map.ts` |
| In a bubble only the active entity's frame takes its colour (HA: every frame, when paths show); a loose inactive marker is dimmed | v2 | `timeline-map.ts` |
| Fit modes: full path / current location / segment | #43, #46 | `timeline-map.ts` |
| Fits keep room at the top for the floating entity markers | v2 | `timeline-map.ts` |
| Several entities with their own colours, inactive at 0.8 opacity | #16 | `timeline-map.ts` |
| `hide_unselected_on_map` | ba869e3 | `timeline-map.ts` |
| Stay markers with zone icon on the path | cd2dca2 | `timeline-map.ts` |
| Single entity's current location as a blue dot, `current_location_marker` | #46 | `timeline-map.ts` |
| `show_zones`: all non-passive zones (HA: zones listed as entities, or `show_all`) | v2 | `timeline-map.ts` |
| `map_height_px` | #28, #36 | card layout |

## Options

Where an option means the same as in HA's map card, it gets the same name and the same
values. HA options that mean nothing for a day timeline are not taken over.

- Per entity, as HA's `MapEntityConfig`: `entity`, `name`, `color`, `label_mode`,
  `attribute`, `unit`.
- Map level, as HA's `MapCardConfig`: `theme_mode`, `map_style`, `default_zoom`,
  `cluster`, `scale_ruler`.
- Not taken over: `hours_to_show`, `show_all`, `geo_location_sources` (the map shows
  one day of the chosen entities); `auto_fit`, `focus` (our own fit modes);
  `aspect_ratio` (`map_height_px` instead, until the panel layout, #114); `dark_mode`
  (deprecated in HA); `title`, `conditions` (generic card options).

## Syncing

Against release tags, not `dev`: the code has to match the core of a released HA.
The steps are in `docs/syncing-ha-frontend.md`.
