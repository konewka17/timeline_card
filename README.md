# Timeline Card (Home Assistant)

Custom Lovelace card that renders a Google Maps Timeline–style day view from GPS history.

## Features
- Frontend-only custom card (no integration, no automations)
- Uses Home Assistant WebSocket API (`history_during_period`)
- Segments stays and moves with configurable thresholds
- Optional zone labeling when inside HA zones
- Sticky date header with day navigation
- Per-day cache in memory for fast back/forward

## Installation
1. Build the card:
   ```bash
   npm install
   npm run build
   ```
2. Add `dist/card.js` to Lovelace resources.

## Usage
Add a manual card or use the Lovelace UI editor.

### Example YAML
```yaml
type: custom:timeline-card
entity: device_tracker.my_phone
stay_radius_m: 75
min_stay_minutes: 10
```

## Configuration options
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `entity` | string | **required** | `device_tracker` or `person` entity to pull GPS history from. |
| `places_entity` | string | `null` | Optional `sensor` from the Places integration to label unknown stays. |
| `stay_radius_m` | number | `75` | Radius (meters) used to detect a stay. |
| `min_stay_minutes` | number | `10` | Minimum duration (minutes) required to qualify as a stay. |
| `show_debug` | boolean | `false` | Show debug info (points/zones/first/last timestamps). |

## Lovelace UI editor
The card exposes a visual editor with:
- Tracked entity selector
- Places entity (optional)
- Stay radius (meters)
- Minimum stay duration (minutes)
- Debug toggle

## Notes
- The card reads raw GPS history from the entity’s latitude/longitude attributes.
- Zone labels are resolved from `zone.*` entities.
- All processing happens in the browser; no backend storage.
