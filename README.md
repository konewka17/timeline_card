# Location Timeline Card (Home Assistant)
Location Timeline Card is a custom Lovelace card that builds a **timeline–style day view** from your Home Assistant location history. It turns raw GPS points into an easy-to-read daily story of where a person/device stayed and when they moved.

## What this card does
![Example](img/card_example.png)
- Reads location history from a `device_tracker` or `person` entity
- Groups points into **stays** and **moves** using configurable thresholds
- Shows zone names when points are inside Home Assistant `zone.*` entities
- Supports reverse geocoding for stays outside zones
- Keeps a per-day in-memory cache for snappy day-to-day navigation
- Runs fully in the frontend (no extra backend integration required)

## Installation (HACS)
1. Open **HACS → Frontend → ⋮ → Custom repositories**.
2. Add this repository URL.
3. Set category to **Dashboard**.
4. Click **Add**.
5. Find **Location Timeline Card** in HACS Frontend and click **Download**.
6. Restart Home Assistant (or reload frontend resources if prompted).

After installation, ensure the card resource is available in Lovelace (HACS normally registers this automatically).

## Usage
Add the card in the Lovelace UI editor or with manual YAML.

### Minimal setup
```yaml
type: custom:location-timeline-card
entity: device_tracker.my_phone
```
The entity must expose latitude/longitude attributes.

### Multiple tracked entities
```yaml
type: custom:location-timeline-card
entity:
  - person.alice
  - person.bob
places_entity:
  - sensor.places_alice
  - sensor.places_bob
```
When multiple entities are configured, the card renders all tracks on the map and adds a selector bar above the date controls. The configured `places_entity` list must either be empty or match the same length/order as `entity`.

## Configuration options
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `entity` | string[] | **required** | One or more `device_tracker`/`person` entities to pull GPS history from. | 
| **Reverse geocoding** |  |  | see [Reverse Geocoding](#reverse-geocoding) below|
| `places_entity` | string[] | `[]` | Optional `sensor` entity (or list) from Places integration used first for reverse geocoding. Lists must match `entity` order/count when provided. |
| `osm_api_key` | string | `null` | Optional OSM Nominatim email address (used as API key) for reverse geocoding fallback. |
| **Detection parameters** |  |  |  |
| `stay_radius_m` | number | `75` | Radius (meters) used to detect a stay. |
| `min_stay_minutes` | number | `10` | Minimum duration (minutes) required to qualify as a stay. |
| **Map display** |  |  |  |
| `distance_unit` | string | `"metric"` | Distance unit for moving segments: `metric` (m, km) or `imperial` (ft, mi). |
| `map_appearance` | string | `"auto"` | Map appearance: `auto` (align with HA theme), `light`, or `dark`. |
| `map_height_px` | number | `200` | Height of the map area in pixels. |
| `hide_current_location` | boolean | `false` | Hide the current location when viewing today. |
| `hide_moving` | boolean | `false` | Hide moving rows and keep only stays. |
| `colors` | string[] | `[]` | Optional list of per-entity track colors. When set, these colors are used in order (cycled if needed) instead of HA `--primary-color`/`--color-x` variables. |

## Reverse Geocoding
For stays that are not clearly inside a Home Assistant zone, the card can resolve a human-friendly location name. This process is called **reverse geocoding**: converting latitude/longitude coordinates into an address or place label.

By default, Home Assistant only stores raw GPS coordinates in history. If you want meaningful labels like "Starbucks" or "Main Street 12" instead of just coordinates, you need to configure one of the following options.

1. **Preferred:** configure the [Places integration](https://github.com/custom-components/places) and set `places_entity`.
   - Install the Places integration (via HACS) and configure it for your tracked entity.
   - This integration creates a `sensor.places_*` entity that stores resolved place names.
   - Set the card’s `places_entity` option to that sensor.
   - This is recommended because Places writes location labels into Home Assistant history. That means:
     - Labels are stored persistently.
     - Historic days load instantly without repeated API calls.
     - You get consistent naming over time.
   - Under the hood, Places uses the OpenStreetMap API to resolve coordinates into readable addresses or place names.

2. **Fallback:** configure `osm_api_key` with your **email address**.
   - Set `osm_api_key` to your email address (required by OpenStreetMap Nominatim usage policy).
   - The card will call OSM Nominatim directly from the frontend when no Places label is available.
   - Requests are rate-limited to at most one request per second to stay within OSM guidelines.
   - Responses are cached by the card (including "unknown" results) to avoid repeated lookups.
   - This is especially useful for resolving older historic stays if you have set up the Places entity later.
   - Note: Unlike Places, these labels are not written back into Home Assistant history.

Example:
```yaml
type: custom:location-timeline-card
entity: 
  - device_tracker.my_phone
places_entity: 
  - sensor.places_my_phone
osm_api_key: me@example.com
```

If `osm_api_key` is not set, unresolved stays remain **Unknown location**.

## Notes
- The card reads raw GPS history from the tracked entity’s latitude/longitude attributes.
- Zone labels are resolved from `zone.*` entities.
- All timeline processing happens in the browser.
- [Discussion post](https://community.home-assistant.io/t/location-timeline-card-to-easily-show-location-history/989513) on the Community

### Fix GUI form not displaying `entity` or `places_entity` when card was set up prior to `v1.6.0`
If your configuration form does not display `entity` or `places_entity` and you first set up your card prior to `v1.6.0`, this is due to a breaking change where the card now supports multiple users. 
You can fix this by manually changing the YAML from
```
entity: person.my_person
``` 
to 
```
entity: 
- person.my_person
```

You can replace `entity: null` or `places_entity: null` with `entity: []`
