import { getDesktop } from '../shared/desktop'
import { getLocale } from './locale'

/** The desktop app's menus, tray and native dialogs follow the game's language. */
export function reportLocaleToDesktop() {
  void getDesktop()
    ?.app.setLocale?.(getLocale())
    .catch(() => undefined)
}
