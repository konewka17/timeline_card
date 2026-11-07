# Advanced Configuration

This document covers advanced configuration of the Location Timeline Card.

## Places sensors

See [Per-entity options](README.md#per-entity-options) for the options each entity can have.

### How `places_entity` resolution works

1. **Per-entity override** — If a `places_entity` is specified in the entity object, it is used directly for that entity.
2. **Top-level fallback** — If not specified per-entity, the card checks the top-level `places_entity` list and auto-matches by the `devicetracker_entityid` attribute on the Places sensor (Places v2).
3. **Positional fallback** — Places v3 removed the `devicetracker_entityid` attribute. Sensors that cannot be matched by attribute are matched by list position, so the top-level `places_entity` list must have the same length and order as `entity`.

On Places v3, the card additionally detects the `..._place_name` child sensor belonging to the configured Places sensor (via the entity registry) and uses its history for place names.

This means you can mix both approaches:

```yaml
type: custom:location-timeline-card
entity:
    - entity: person.alice
      places_entity: sensor.places_alice
    - person.bob
places_entity:
    - sensor.places_bob
```

## Activity Icons

When an `activity_entity` is provided, the card displays the current activity for "move" segments. You can customize the icons used for these activities using the `activity_icon_map` option.

### `activity_icon_map`

This is an object where keys are activity names (as reported by your activity sensor) and values are MDI icons.

| Property            | Type   | Description                                                                                               |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `activity_icon_map` | object | A map of activity names to icon strings (e.g., `walking: mdi:walk`). Falls back to zone icons or default. |

**Example:**

```yaml
type: custom:location-timeline-card
entity:
    - entity: person.alice
      activity_entity: sensor.alice_activity
activity_icon_map:
    Walking: mdi:walk
    Running: mdi:run
    Cycling: mdi:bike
    "In car": mdi:car
```
