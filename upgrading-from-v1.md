# Upgrading from v1 to v2

Home Assistant has recently made a lot of changes to its
[native map card](https://www.home-assistant.io/dashboards/map/), most notably the switch to a different mapping
engine. v2 of the Location Timeline Card aligns its code to these changes, making it much easier to bring new features
of the HA map to this card. As part of this major release, a few configuration options have moved or have been removed.

v2 requires Home Assistant **2026.10** or newer. On 2026.10 the current location markers don't have rounded corners
yet, this is fixed by updating to 2026.11.

Everything that belongs to an entity is now set on that entity, in the `entities` list. There is no separate advanced
mode any more. In the visual editor, use the pencil next to an entity. Options that have to be removed can only be
changed in YAML: open the card and choose **Show code editor**.

## If the card shows an error

Two old configurations stop the card from loading until you change them:

| Error                                                | Cause                             | Fix                                     |
|------------------------------------------------------|-----------------------------------|-----------------------------------------|
| `places_entity is now set per entity`                | `places_entity` at the top level  | See [the first example](#example)       |
| `entities must be a list with at least one entity`   | `entity: person.alice`            | See [a single entity](#a-single-entity) |

All other old options are ignored without an error. If your colors or map theme look different after updating, your
config probably still uses `colors` or `map_appearance`.

## What to change

| Replace                           | with                             | Remarks                                                                              |
|-----------------------------------|----------------------------------|--------------------------------------------------------------------------------------|
| `entity`                          | `entities`                       | The `entity` option is deprecated: it still works for now, but will be removed later |
| `entity: person.alice`            | `entities:`<br/>`- person.alice` | Always a list, also with a single entity                                             |
| top-level `places_entity`         | `places_entity` on each entity   |
| `colors`                          | `color` on each entity           | Without it, the card's default colors are used.                                      |
| `icon` on an entity               | `label_mode: icon`               | Shows the entity's own icon on the map                                               |
| `map_appearance`                  | `theme_mode`                     | Values stay the same: `auto`, `light` or `dark`                                      |
| `map_tile_url`, `map_attribution` | Remove                           | The map uses HA's own map styles and tile proxy; see `map_style`.                    |
| `update_interval`                 | Remove                           | Today's timeline and map now update live                                             |

## Example

v1:

```yaml
type: custom:location-timeline-card
entity:
  - person.alice
  - person.bob
places_entity:
  - sensor.places_alice
  - sensor.places_bob
colors:
  - "#e91e63"
  - "#2196f3"
map_appearance: dark
```

v2:

```yaml
type: custom:location-timeline-card
entities:
  - entity: person.alice
    places_entity: sensor.places_alice
    color: "#e91e63"
  - entity: person.bob
    places_entity: sensor.places_bob
    color: "#2196f3"
theme_mode: dark
```

List the sensors in the same order as the entities they belong to: the first sensor goes on the first entity, and so
on. The same goes for `colors`. With Places v2, v1 matched sensors by their tracker, so check that each sensor ends
up on the right entity.

## A single entity

The list is also required with one entity. Change:

```yaml
type: custom:location-timeline-card
entity: person.alice
```

to:

```yaml
type: custom:location-timeline-card
entities:
  - entity: person.alice
```
