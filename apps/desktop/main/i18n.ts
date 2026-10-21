import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Menus, tray, notifications and native dialogs of the desktop app, in the
 * language the player chose in the game (apps/web/src/i18n). The renderer
 * reports its language over IPC (`app:setLocale`); it is kept in
 * `<userData>/ui-locale` so the menus are right before the window loads.
 */

export type UiLocale = "ru" | "en";

const EN = {
  appName: "The Human Box",
  menuSettings: "Settings…",
  menuAbout: "About The Human Box RU",
  menuServices: "Services",
  menuHide: "Hide The Human Box RU",
  menuHideOthers: "Hide Others",
  menuShowAll: "Show All",
  menuQuit: "Quit The Human Box RU",
  menuFile: "File",
  menuReload: "Reload",
  menuRestartSim: "Restart simulation",
  menuCloseWindow: "Close Window",
  menuEdit: "Edit",
  menuUndo: "Undo",
  menuRedo: "Redo",
  menuCut: "Cut",
  menuCopy: "Copy",
  menuPaste: "Paste",
  menuSelectAll: "Select All",
  menuView: "View",
  menuDevTools: "Toggle DevTools",
  menuActualSize: "Actual Size",
  menuZoomIn: "Zoom In",
  menuZoomOut: "Zoom Out",
  menuFullScreen: "Toggle Full Screen",
  menuAlwaysOnTop: "Always on top",
  menuScreenshot: "Screenshot",
  menuWindow: "Window",
  menuMinimize: "Minimize",
  menuZoom: "Zoom",
  menuFront: "Bring All to Front",
  menuHelp: "Help",
  menuOpenGitHub: "Open GitHub",
  menuOriginal: "Original project (1homsi/thehumanbox)",
  trayHide: "Hide window",
  trayShow: "Show window",
  trayScreenshot: "Take screenshot",
  trayWorlds: "Open worlds folder",
  trayLogs: "Open logs folder",
  trayAbout: "About The Human Box",
  trayAboutBody:
    "v{version}\nA persistent artificial-life simulation.\nBased on The Human Box by Mohamad Homsi.",
  trayQuit: "Quit The Human Box",
  screenshotSaved: "Screenshot saved",
  worldsUnavailable: "Worlds folder unavailable",
  logsUnavailable: "Logs folder unavailable",
  pickSaveDirTitle: "Choose where The Human Box stores worlds",
  windowOpenFailed: "The Human Box couldn't open its window",
  startFailed: "The Human Box couldn't start",
  restartFailed: "Could not restart the simulation",
  simStopped: "The simulation stopped unexpectedly",
  simStoppedDetail:
    "Exit {exit}. Your world was last saved at its most recent checkpoint (about a minute of play at most is lost). Restart the simulation to continue.",
  exitCode: "code {code}",
  restartSim: "Restart simulation",
  notNow: "Not now",
  restartHungDetail:
    "{detail}\n\nThe simulation may be hung. Restarting without a checkpoint loses up to about a minute of play.",
  cancel: "Cancel",
  ok: "OK",
  noCheckpoint: "Restart without checkpoint",
  bootTitle: "The Human Box — startup error",
  bootSimHeading: "The Human Box couldn't start the local simulation",
  bootSimHint: "Check the logs for details, then restart the local simulation from Settings.",
  bootSettingsHeading: "The Human Box couldn't read its settings",
  bootSettingsHint:
    "Repair or remove the file named above, then relaunch. Your existing worlds are untouched.",
  bootDevTools:
    "Open DevTools with <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> (macOS) or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> (Win/Linux) for more.",
  updateReadyTitle: "Update ready",
  updateReady: "Version {version} is ready to install.",
  updateReadyDetail: "The app will restart and apply the update.",
  updateRestart: "Restart and update",
  updateLater: "Later",
  updateFailedTitle: "Update failed",
  updateFailed: "The update could not be installed.",
  updateFileMissing: "The downloaded update file is missing. Check for updates again.",
  saveFilterName: "The Human Box world save",
  exportTitle: "Export a restorable world save",
  resetTitle: "Start a new local world?",
  resetDetail:
    "Your current world will remain archived on this computer. Exporting a separate save first gives you an additional portable backup.",
  resetExportAndNew: "Export & start new",
  resetNewWithoutExport: "Start new without export",
  resetExportTitle: "Export current world before reset",
} as const;

export type UiKey = keyof typeof EN;

const RU: Record<UiKey, string> = {
  appName: "The Human Box",
  menuSettings: "Настройки…",
  menuAbout: "О программе The Human Box RU",
  menuServices: "Службы",
  menuHide: "Скрыть The Human Box RU",
  menuHideOthers: "Скрыть остальные",
  menuShowAll: "Показать все",
  menuQuit: "Завершить The Human Box RU",
  menuFile: "Файл",
  menuReload: "Перезагрузить",
  menuRestartSim: "Перезапустить симуляцию",
  menuCloseWindow: "Закрыть окно",
  menuEdit: "Правка",
  menuUndo: "Отменить",
  menuRedo: "Повторить",
  menuCut: "Вырезать",
  menuCopy: "Копировать",
  menuPaste: "Вставить",
  menuSelectAll: "Выбрать всё",
  menuView: "Вид",
  menuDevTools: "Инструменты разработчика",
  menuActualSize: "Фактический размер",
  menuZoomIn: "Увеличить",
  menuZoomOut: "Уменьшить",
  menuFullScreen: "Полноэкранный режим",
  menuAlwaysOnTop: "Поверх всех окон",
  menuScreenshot: "Снимок экрана",
  menuWindow: "Окно",
  menuMinimize: "Свернуть",
  menuZoom: "Изменить масштаб",
  menuFront: "Все окна — на передний план",
  menuHelp: "Справка",
  menuOpenGitHub: "Открыть страницу на GitHub",
  menuOriginal: "Оригинальный проект (1homsi/thehumanbox)",
  trayHide: "Скрыть окно",
  trayShow: "Показать окно",
  trayScreenshot: "Сделать снимок экрана",
  trayWorlds: "Открыть папку миров",
  trayLogs: "Открыть папку журналов",
  trayAbout: "О программе The Human Box",
  trayAboutBody:
    "v{version}\nНепрерывная симуляция искусственной жизни.\nОснована на The Human Box Мохамада Хомси.",
  trayQuit: "Завершить The Human Box",
  screenshotSaved: "Снимок экрана сохранён",
  worldsUnavailable: "Папка миров недоступна",
  logsUnavailable: "Папка журналов недоступна",
  pickSaveDirTitle: "Где The Human Box будет хранить миры",
  windowOpenFailed: "The Human Box не удалось открыть окно",
  startFailed: "The Human Box не удалось запустить",
  restartFailed: "Не удалось перезапустить симуляцию",
  simStopped: "Симуляция неожиданно остановилась",
  simStoppedDetail:
    "Выход: {exit}. Мир сохранён на последней контрольной точке (потеряно не больше минуты игры). Перезапустите симуляцию, чтобы продолжить.",
  exitCode: "код {code}",
  restartSim: "Перезапустить симуляцию",
  notNow: "Не сейчас",
  restartHungDetail:
    "{detail}\n\nСимуляция, похоже, зависла. Перезапуск без контрольной точки потеряет до минуты игры.",
  cancel: "Отмена",
  ok: "ОК",
  noCheckpoint: "Перезапустить без контрольной точки",
  bootTitle: "The Human Box — ошибка запуска",
  bootSimHeading: "The Human Box не удалось запустить симуляцию",
  bootSimHint: "Подробности — в журналах. Затем перезапустите симуляцию из настроек.",
  bootSettingsHeading: "The Human Box не удалось прочитать настройки",
  bootSettingsHint:
    "Исправьте или удалите указанный выше файл и запустите приложение снова. Ваши миры не пострадали.",
  bootDevTools:
    "Подробнее — в инструментах разработчика: <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> (macOS) или <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> (Win/Linux).",
  updateReadyTitle: "Обновление готово",
  updateReady: "Версия {version} готова к установке.",
  updateReadyDetail: "Приложение перезапустится и установит обновление.",
  updateRestart: "Перезапустить и обновить",
  updateLater: "Позже",
  updateFailedTitle: "Не удалось обновить",
  updateFailed: "Обновление не удалось установить.",
  updateFileMissing: "Скачанный файл обновления пропал. Проверьте обновления ещё раз.",
  saveFilterName: "Сохранение мира The Human Box",
  exportTitle: "Экспорт сохранения мира",
  resetTitle: "Начать новый мир?",
  resetDetail:
    "Текущий мир останется в архиве на этом компьютере. Если сначала экспортировать его в отдельный файл, у вас будет ещё и переносимая копия.",
  resetExportAndNew: "Экспортировать и начать",
  resetNewWithoutExport: "Начать без экспорта",
  resetExportTitle: "Экспорт текущего мира перед сбросом",
};

const CATALOGS: Record<UiLocale, Record<UiKey, string>> = { en: EN, ru: RU };

/** This fork is the Russian edition. The test runner sets NODE_TEST_CONTEXT; tests assert on English. */
const DEFAULT_LOCALE: UiLocale = process.env.NODE_TEST_CONTEXT ? "en" : "ru";

let current: UiLocale = DEFAULT_LOCALE;
let storePath: string | null = null;

export function isUiLocale(value: unknown): value is UiLocale {
  return value === "ru" || value === "en";
}

/** Reads the language last reported by the game, kept in the app's userData folder. */
export function loadUiLocale(userDataDir: string): UiLocale {
  storePath = path.join(userDataDir, "ui-locale");
  try {
    const value = fs.readFileSync(storePath, "utf8").trim();
    if (isUiLocale(value)) current = value;
  } catch {
    /* first launch: the default */
  }
  return current;
}

/** The game reported its language. Returns true when it changed (menus need rebuilding). */
export function setUiLocale(locale: UiLocale): boolean {
  if (locale === current) return false;
  current = locale;
  if (storePath) {
    try {
      fs.writeFileSync(storePath, locale);
    } catch (e) {
      console.warn("[main] could not remember the interface language:", e);
    }
  }
  return true;
}

export function uiLocale(): UiLocale {
  return current;
}

/** The text for a key, with {name} placeholders filled from params. */
export function tr(key: UiKey, params?: Record<string, string | number>): string {
  const text = CATALOGS[current][key] ?? EN[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] === undefined ? m : String(params[name]),
  );
}
