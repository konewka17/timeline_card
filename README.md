# Location Timeline Card (Home Assistant)

Location Timeline Card is a custom Lovelace card that builds a **Google Maps Timeline–style day view** from your Home Assistant location history. It turns raw GPS points into an easy-to-read daily story of where a person/device stayed and when they moved.

## What this card does
- Reads location history from a `device_tracker` or `person` entity
- Groups points into **stays** and **moves** using configurable thresholds
- Shows zone names when points are inside Home Assistant `zone.*` entities
- Supports optional enrichment from the Places integration
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

### Minimal YAML
```yaml
type: custom:location-timeline-card
entity: device_tracker.my_phone
```

### Example with tuning
```yaml
type: custom:location-timeline-card
entity: device_tracker.my_phone
stay_radius_m: 75
min_stay_minutes: 10
```

## Places integration (optional)
If you use the [Places integration](https://github.com/custom-components/places), Location Timeline Card can use it as extra location context for stays that are not clearly inside a Home Assistant zone.

1. Set up the Places integration in Home Assistant.
2. Add the Places sensor to this card with `places_entity`.

Example:
```yaml
type: custom:location-timeline-card
entity: device_tracker.my_phone
places_entity: sensor.places_my_phone
```

When available, Places data is used to provide an additional human-friendly location label.

## Configuration options
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `entity` | string | **required** | `device_tracker` or `person` entity to pull GPS history from. |
| `places_entity` | string | `null` | Optional `sensor` from the Places integration to label unknown stays. |
| `stay_radius_m` | number | `75` | Radius (meters) used to detect a stay. |
| `min_stay_minutes` | number | `10` | Minimum duration (minutes) required to qualify as a stay. |

## Lovelace UI editor
The card includes a visual editor with:
- Tracked entity selector
- Optional Places entity selector
- Stay radius (meters)
- Minimum stay duration (minutes)

## Notes
- The card reads raw GPS history from the tracked entity’s latitude/longitude attributes.
- Zone labels are resolved from `zone.*` entities.
- All timeline processing happens in the browser.
