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

Menus, buttons, tooltips, settings and dialogs. Names, the people's invented
languages and everything the simulation writes (thoughts, chronicles, event
text) stay as they are.

## In code

```ts
import { t } from '../../i18n'

t('settings.title')
t('header.tick', { tick: formatNumber(world.tick) })
```

Call `t()` while rendering, not at module scope. Changing the language saves
the world and reloads the page, so every render sees the chosen language.
