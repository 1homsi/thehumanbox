# Translations

The interface text lives in `locales/`, one JSON file per language, named by its
language code (`es.json`, `pt-BR.json`, `zh-CN.json`).

## Adding a language

1. Copy `locales/en.json` to `locales/<code>.json`.
2. Translate the values. Keep every key, and keep each `{placeholder}` exactly as it is.
3. Run `pnpm test src/i18n`. It checks that the file has every key, no extra
   ones, the same placeholders, and no empty strings.

That is all: the new file shows up in Settings → Language on its own.

## Changing English text

`en.json` is the source. When you add or rename a key there, add it to every
other file too; the test fails until they match.

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
