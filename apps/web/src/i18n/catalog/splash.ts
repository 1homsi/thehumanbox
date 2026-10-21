import { defineMessages } from '../define'

/** The loading screen in index.html (its Russian text is written there too, so it shows before any script runs). */
export const splash = defineMessages(
  {
    'splash.label': 'Loading The Human Box',
    'splash.waking': 'waking the world…',
    'splash.slow': 'still going. big worlds can take a little while to wake up.',
    'splash.downloading': 'downloading · {loaded} kb',
    'splash.downloadingOf': 'downloading · {loaded} / {total} kb',
  },
  {
    'splash.label': 'Загрузка The Human Box',
    'splash.waking': 'мир просыпается…',
    'splash.slow': 'ещё загружается. большим мирам нужно чуть больше времени, чтобы проснуться.',
    'splash.downloading': 'загрузка · {loaded} КБ',
    'splash.downloadingOf': 'загрузка · {loaded} / {total} КБ',
  },
)
