import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  atomicReplaceFile,
  initializeDataRootIdentity,
  requireOrUpgradeDataRootIdentity,
} from "./world-safety";

export type SimMode = "local";

export interface Settings {
  mode: SimMode;
  tickMs: number;
  populationCap: number;
  saveLocationOverride: string | null;
  autoUpdate: boolean;
  autoLaunch: boolean;
  startMinimized: boolean;
  pauseWhenHidden: boolean;
  // The language the game showed last, reported by the renderer (see
  // app:setLocale). Null until it has reported; the shell then uses the OS.
  locale: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "local",
  tickMs: 100,
  populationCap: 500,
  saveLocationOverride: null,
  autoUpdate: true,
  autoLaunch: false,
  startMinimized: false,
  pauseWhenHidden: true,
  locale: null,
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): Settings {
  const p = settingsPath();
  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_SETTINGS);
    }
    // Any other read failure (EACCES, EBUSY, EIO) is not "no settings
    // yet". Swallowing it returned the defaults, which reset
    // `saveLocationOverride`, made the app open a *different* data root,
    // and then — because `settings:set` compares against this same failed
    // read — wrote those defaults back over the real file on the next save.
    throw new Error(
      `settings.json at ${p} is unreadable (${(err as Error).message}). ` +
        `Refusing to fall back to defaults, which would reset the save ` +
        `location and could orphan existing worlds. Restore or remove the ` +
        `file, then relaunch.`,
    );
  }
  let parsed: unknown;
  try {
    // Notepad and PowerShell can save UTF-8 with a byte order mark, which
    // JSON.parse rejects.
    parsed = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (err) {
    throw new Error(
      `settings.json at ${p} is corrupt (${(err as Error).message}). ` +
        `Refusing to fall back to defaults, which would reset the save ` +
        `location and could orphan existing worlds. Repair or remove the ` +
        `file, then relaunch.`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `settings.json at ${p} is corrupt (it does not hold a JSON object). ` +
        `Refusing to fall back to defaults, which would reset the save ` +
        `location and could orphan existing worlds. Repair or remove the ` +
        `file, then relaunch.`,
    );
  }
  return normalizeSettings(parsed);
}

export function saveSettings(s: Settings): void {
  const p = settingsPath();
  atomicReplaceFile(p, JSON.stringify(normalizeSettings(s), null, 2));
}

// A plain object is one whose prototype is null or the Object.prototype of its
// realm. Checking the prototype's own prototype works across realms (the vm
// tests build objects in their own context), and rejects Date, Map, arrays,
// typed arrays and class instances, which would otherwise be filled with
// defaults and saved.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/**
 * Turn a settings object from disk or from the renderer into a valid Settings.
 * Missing or mistyped fields take their defaults. A save folder that is not an
 * absolute path is refused rather than resolved against the working directory,
 * since falling back to the default folder would strand a world kept in the
 * custom one.
 */
export function normalizeSettings(input: unknown): Settings {
  if (!isPlainObject(input)) throw new Error("settings must be an object");
  return {
    // Older releases supported a hosted "remote" mode. Always migrate those
    // settings back to the bundled local simulation.
    mode: "local",
    tickMs: clampInt(numberOr(input.tickMs, DEFAULT_SETTINGS.tickMs), 30, 5000),
    populationCap: clampInt(
      numberOr(input.populationCap, DEFAULT_SETTINGS.populationCap),
      120,
      5000,
    ),
    saveLocationOverride: saveLocationOverride(input.saveLocationOverride),
    autoUpdate: booleanOr(input.autoUpdate, DEFAULT_SETTINGS.autoUpdate),
    autoLaunch: booleanOr(input.autoLaunch, DEFAULT_SETTINGS.autoLaunch),
    startMinimized: booleanOr(input.startMinimized, DEFAULT_SETTINGS.startMinimized),
    pauseWhenHidden: booleanOr(input.pauseWhenHidden, DEFAULT_SETTINGS.pauseWhenHidden),
    locale: typeof input.locale === "string" ? input.locale : null,
  };
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// A hand-edited number may be stored as text ("250"). Number.isFinite does not
// coerce, so that text used to clamp to the minimum.
function numberOr(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  return fallback;
}

function saveLocationOverride(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "" || !path.isAbsolute(value)) {
    throw new Error(
      `the save folder in settings must be an absolute folder path or empty ` +
        `(found ${JSON.stringify(value)}). Refusing to fall back to the default ` +
        `folder, which could orphan existing worlds. Fix or remove settings.json, then relaunch.`,
    );
  }
  return value;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(Math.max(Math.round(v), lo), hi);
}

export function defaultDataRoot(): string {
  return app.getPath("userData");
}

export function effectiveDataRoot(s: Settings): string {
  return s.saveLocationOverride ?? defaultDataRoot();
}

/**
 * Resolve a configured data root without silently manufacturing a missing
 * custom override. The default app-data root remains app-owned and creatable.
 */
export function prepareDataRoot(s: Settings): string {
  const root = effectiveDataRoot(s);
  if (s.saveLocationOverride === null) {
    fs.mkdirSync(root, { recursive: true });
    initializeDataRootIdentity(root);
  } else {
    requireOrUpgradeDataRootIdentity(root);
  }
  return root;
}

export function worldsRoot(s: Settings): string {
  return path.join(effectiveDataRoot(s), "worlds");
}
