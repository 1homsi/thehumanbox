import { defineMessages } from '../define'

export const settings = defineMessages(
  {
    'settings.language.title': 'Language',
    'settings.language.desc':
      'The language of the interface. Switching reloads the game (your world is saved first).',
    'settings.language.failed':
      'could not checkpoint the current world; the language change was cancelled safely',
  },
  {
    'settings.language.title': 'Язык',
    'settings.language.desc': 'Язык интерфейса. При смене игра перезагрузится (мир сначала сохранится).',
    'settings.language.failed': 'не удалось сохранить текущий мир; смена языка безопасно отменена',
  },
)
