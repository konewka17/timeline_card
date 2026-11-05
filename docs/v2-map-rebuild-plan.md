# v2: rebuild the map on HA's map engines

## Goal

The map works as much as possible like HA's own map (`type: map`, since 2026.10):
the same engines (native MapLibre, Leaflet as fallback), styles, controls, markers,
clustering and tile proxy. Whatever HA's map can do, this map can offer too. What
HA's map doesn't have goes, unless it is a deliberate deviation.

New major version with a minimum HA version; older installs stay on v1.

## Principles

- HA code is taken over, not rebuilt. Where HA already does something, we use HA's
  code rather than our own variant.
- Our own code (everything outside `src/ha-frontend/`) is reviewed again in every
  phase: can it be shorter, can something go now that HA does it? Especially
  `card.js` and the orchestrator.
- CLAUDE.md applies in full: no abstractions for a single call site, no fallbacks
  for cases that can't occur, no comments explaining *what*.
- Deliberate deviations from HA stay and are rebuilt on the new engine. They are
  listed in `src/ha-frontend/README.md`.

## Deviations: what was checked

The deviation table in `src/ha-frontend/README.md` comes from the git and issue
history. Beyond that table:

- The marker icon rule (894c17b, icon when there is no picture) goes. HA shows the
  entity picture, otherwise initials, and an icon with `label_mode: icon`.
- HA's engine already does these, so they are no longer our own code: tile token and
  recovery from refused tiles (#115/#116), WebGL context loss and falling back to
  raster (#35), dark mode (#11, #29), `default_zoom` (#112), referer problems (#83).
- RTL labels (#110): our fix came from HA (#53856). HA removed it in #54706 because
  maplibre-gl 6 shapes RTL text itself, so it goes in v2.
- `map_tile_url` / `map_attribution` (176f847) did not come from a user request. They
  were a way out for the raster fallback in case its tiles needed an API key (#107).
  HA's fallback now uses core's raster proxy, so both go. No satellite request was
  found in issues, PRs or discussions.

## Architecture

```
card.js                    timeline logic (unchanged apart from map calls)
  └─ src/timeline-map.ts   our orchestrator, replaces leaflet-map.js
       └─ MapEngine        HA's interface (src/common/map/map-engine.ts)
            ├─ MapLibreMapEngine   (HA, + small path patch)
            └─ LeafletMapEngine    (HA, + small path patch)
```

`ha-map.ts` itself is **not** taken over: through Lit contexts, `types.ts`,
formatters and the entity registry it pulls in half the frontend. Embedding it is no
option either: v0 did that (`hui-map-card` + private `_mapPaths`/`leafletMap`) and
moved away from it on purpose in #6.

## What we take over

Mirrored under `src/ha-frontend/` with HA's own folder structure, so no relative
import path needs changing:

- `src/common/map/**` (engines, base-layer, map-styles, build-map-style,
  map-style-transforms, map-theme-colors, palettes, zone-marker, decorated_marker,
  marker-accessibility, editable-circle, entity-map-colors)
- `src/data/map_tiles.ts`
- small utils the engines import: `common/util/deep-equal`, `common/util/wait`,
  `util/is_touch`, `common/dom/setup-leaflet-map`
- the exact list follows from the build: anything missing is a compile error

Not taken over, but ported (markup and CSS copied literally):
- `ha-entity-marker.ts` (depends on the `consumeEntityState` context)
- cluster bubble rendering and zone placement from `ha-map.ts`

Dependencies pinned to HA's versions: `maplibre-gl` 6.16.0 (now 5.24), `leaflet`
1.9.4, `@maplibre/maplibre-gl-leaflet` 0.1.4, `leaflet.markercluster` 1.5.3,
`@versatiles/style` 7.1.0, `culori` 4.0.2, `memoize-one` 6.0.0.

## The patch on HA code

One contained change, shaped as an upstream PR.

**Paths.** `MapPath` gets optional fields: line width, border (colour + width), an
animated dash, and a click callback. `addPath` in both engines draws them:
- MapLibre: an extra `line` layer under the path for the border, round caps and
  joins; the dash animation steps `line-dasharray` per frame, with butt caps (MapLibre
  has no dash offset, and round caps turn a zero-length dash into a dot);
  click via `map.on("click", layerId)`.
- Leaflet: a second polyline for the border, the animation by moving `dashOffset`,
  `interactive: true` + click.

We pass `markers: []`, so HA's tooltip dots don't appear. Without the patch it can't
be done: drawing lives in private helpers (`_addCustomLayer`, `_map`), so a subclass
would have to reach private fields through casts, and a rename of those would then
break silently.

## Orchestrator `src/timeline-map.ts`

Keeps the public API of `TimelineLeafletMap`, so `card.js` barely changes:
`setDaySegments`, `highlightSegment`, `clearHighlight`, `fitMap`, `setDarkMode`,
`destroy`, current locations.

Its tasks, each taken from `ha-map.ts` where it exists there:
- choosing the engine + fallback (`_loadMap` / `_setUpEngine` / `_handleEngineFatal`)
- getting the token (`ensureMapTilesToken`)
- resolving the style (`resolveMapStyle`) and reading theme colours (`_readThemeColors`)
- entity markers (floating footprint, selected = active entity) and clustering
- drawing zones (as HA does, behind a config option)
- this card's stay markers and paths via `addMarker` / `addPath`
- fit modes via `engine.fitBounds` / `setView`

## Recording the dependency on HA

- `src/ha-frontend/README.md`: which files come from HA and from which tag, the
  patch, the deliberate deviations, how to sync.
- CLAUDE.md, section "Home Assistant map code": the rules for working on map code.

Both are set up in phase 1 and kept up to date from then on.

## Build

- TypeScript in rollup (`@rollup/plugin-typescript` or esbuild); the existing JS can
  stay.
- `output.inlineDynamicImports: true`: the engines load `maplibre-gl` / `leaflet`
  dynamically, and HACS ships one file.
- Build globals via `@rollup/plugin-replace`:
  - `__STATIC_PATH__` → `"/static/"`
  - `__DEMO__` → `false`
  - `__VERSION__`: HA uses this as cache buster for `/static/map/urls.json`, whose
    sprite path differs per HA build. So what matters is the HA version, not this
    card's. Replace it with the version from `hass.config.version`, passed in by the
    card at runtime. Worked out in phase 2.
  - `__MAPLIBRE_WORKER_URL__`: HA serves the worker of its own maplibre version. We
    can't use it, because a newer HA has a different worker than our bundle. So we
    bundle the worker of our own maplibre and pass it as a blob URL. Checked in
    phase 2.

## Following upstream

Sync against **release tags** of home-assistant/frontend, not `dev`: the engine code
has to match the core APIs (tile proxy, `/static/map/urls.json`) of a released HA
version. The minimum version in `hacs.json` follows the pinned tag. The first tag is
`20261028.4`.

- `src/ha-frontend/UPSTREAM`: pinned tag + commit SHA.
- `scripts/sync-ha-frontend.sh <new-tag>`:
  1. for every file taken over: fetch the upstream version at the old SHA (base) and
     at the new tag (theirs);
  2. `git merge-file` with our version (ours): changes without conflicts come along
     automatically, clashes with the patch get conflict markers;
  3. find new imports in the updated files (a missing file gets added to the list);
  4. report: upstream commits between both tags for `src/common/map`,
     `src/data/map_tiles.ts` and, for information only, `ha-map.ts`,
     `ha-entity-marker.ts` and `hui-map-card.ts`. That last part shows which card
     features or orchestrator changes to port by hand;
  5. update `UPSTREAM`.
- If the patch is accepted upstream, it disappears at the next sync.

## Config

Rule: where an option means the same as in HA, it gets the same name and the same
values. HA options that mean nothing for a day timeline are not taken over.

**Per entity** (the entries under `entity`), as HA's `MapEntityConfig`: `entity`,
`name`, `color`, `label_mode` (`state` / `attribute` / `icon`), `attribute`, `unit`.
Marker content as in HA: the picture if there is one, otherwise initials, unless
`label_mode` picks something else. `focus` only if it fits the "current location"
fit mode easily.

**Map level**, taken from HA's `MapCardConfig`: `theme_mode`, `map_style`,
`default_zoom`, `cluster`, `scale_ruler`. Plus our own `show_zones`: the entity list
holds the tracked entities, so zones cannot be listed there as in HA. Zones always
show their radius, as in HA's card outside the panel layout.

Not taken over:
- `hours_to_show`, `show_all`, `geo_location_sources`: the map shows one day of the
  chosen entities.
- `auto_fit`: replaced by our own fit modes.
- `aspect_ratio`: we keep `map_height_px`. Comes back with the panel layout (#114).
- `dark_mode`: deprecated in HA in favour of `theme_mode`.
- `title`, `conditions`: generic card options, outside the map.

| v1 | v2 |
|---|---|
| `map_appearance` | `theme_mode` (as HA) |
| `map_tile_url`, `map_attribution` | removed |
| — | `map_style` (HA's styles + custom colours) |
| — | `cluster`, `scale_ruler` (as HA), `show_zones` |
| `default_zoom`, `map_height_px` | stay |
| — | `current_location_marker`: `default` (blue dot) or `entity` (HA's entity marker); single entity only |

Migrating old configs: separate plan, later.

## Phases

Each step can be checked in HA on its own. After every phase: review our own code
for what can get simpler.

1. Branch `v2/ha-map-engine` from master. Set up `src/ha-frontend/README.md` and the
   CLAUDE.md section.
2. Build: TS + replace + deps; the files taken over compile; a bare map via
   `MapLibreMapEngine` with HA's style, controls and attribution. Work out
   `__VERSION__` and the worker.
3. Orchestrator with paths/markers/fit without the patch (HA's width, no border).
   Switch `card.js` over; remove `leaflet-map.js`.
4. Path patch in both engines: border, marching ants, click.
5. Test the Leaflet fallback (WebGL disabled in the browser).
6. Entity markers + clustering + zones as HA.
7. Config options; update the editor.
8. Sync script + `UPSTREAM`; one trial sync to a newer tag.
9. Release v2.0.0, minimum version in `hacs.json`, README.
