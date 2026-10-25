# Translations

The interface text lives in `locales/`, one folder per language named by its
language code (`es`, `pt-BR`, `zh-CN`). Each folder holds one JSON file per area
of the interface: `settings.json`, `dock.json`, `panels.json` and so on.

## Adding a language

1. Copy `locales/en` to `locales/<code>` (leave out `index.ts`).
2. Translate the values. Keep every key, and keep each `{placeholder}` exactly as it is.
3. Run `pnpm test src/i18n`. It checks that the folder has every file and key,
   no extra ones, the same placeholders, and no empty strings.

That is all: the new folder shows up in Settings → Language on its own.

## Changing English text

`locales/en` is the source. When you add or rename a key there, add it to every
other language too; the test fails until they match. A new area file also needs
one import line in `locales/en/index.ts`.

## What is translated

- Menus, buttons, tooltips, settings, dialogs, the save line and the world
  notices.
- Text the game writes for the screens it draws: the room titles, subtitles
  and activity lines of the home, tavern, temple, village and workshop
  interiors, and the roles on their chips; the sandbox tool messages.
- Words for ids the simulation sends, which the game shows as words: discovery
  names, building kinds, eras, forms of government, trade goods, treaty kinds,
  relation statuses, life stages and callings. The tables live next to the
  code that uses them (`ui/sim-words.ts`, `shared/era-words.ts`,
  `shared/government-words.ts`, `game/scenes/shared/occupant-words.ts`).

These stay as they are: names of people, tribes, places and faiths; the
invented languages; and the simulation's own free text (thoughts, chronicles,
event log lines).

## Simulation ids

When the simulation sends an id with no translation yet, the game shows the id
with its underscores turned into spaces, so nothing breaks. To translate a new
id, add its locale key to `locales/en` and every other language. If the screen
reads the id through a lookup table, also add the id to that table. Discovery
ids are looked up directly by `discoveryWord`, so they need only the locale key.

## In code

```ts
import { t } from '../../i18n'

t('settings.title')
t('header.tick', { tick: formatNumber(world.tick) })
```

Call `t()` while rendering, not at module scope. Changing the language saves
the world and reloads the page, so every render sees the chosen language.
