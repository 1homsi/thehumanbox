import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  atomicReplaceFile,
  initializeDataRootIdentity,
  requireOrUpgradeDataRootIdentity,
} from "./world-safety";

export type SimMode = "local";
export type ModelProvider = "ollama" | "llama-cpp" | "custom" | "none";

export interface Settings {
  mode: SimMode;
  tickMs: number;
  populationCap: number;
  model: {
    provider: ModelProvider;
    apiUrl: string;
    apiKey: string;
    modelName: string;
  };
  saveLocationOverride: string | null;
  autoUpdate: boolean;
  autoLaunch: boolean;
  startMinimized: boolean;
  pauseWhenHidden: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "local",
  tickMs: 100,
  populationCap: 500,
  model: {
    provider: "none",
    apiUrl: "",
    apiKey: "",
    modelName: "",
  },
  saveLocationOverride: null,
  autoUpdate: true,
  autoLaunch: false,
  startMinimized: false,
  pauseWhenHidden: true,
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
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    throw new Error(
      `settings.json at ${p} is corrupt (${(err as Error).message}). ` +
        `Refusing to fall back to defaults, which would reset the save ` +
        `location and could orphan existing worlds. Repair or remove the ` +
        `file, then relaunch.`,
    );
  }
}

export function saveSettings(s: Settings): void {
  const p = settingsPath();
  atomicReplaceFile(p, JSON.stringify(mergeWithDefaults(s), null, 2));
}

function mergeWithDefaults(partial: Partial<Settings>): Settings {
  const provider = partial.model?.provider;
  return {
    // Older releases supported a hosted "remote" mode. Always migrate those
    // settings back to the bundled local simulation.
    mode: "local",
    tickMs: clampInt(partial.tickMs ?? DEFAULT_SETTINGS.tickMs, 30, 5000),
    populationCap: clampInt(
      partial.populationCap ?? DEFAULT_SETTINGS.populationCap,
      120,
      5000,
    ),
    model: {
      provider: isModelProvider(provider)
        ? provider
        : DEFAULT_SETTINGS.model.provider,
      apiUrl: partial.model?.apiUrl ?? DEFAULT_SETTINGS.model.apiUrl,
      apiKey: partial.model?.apiKey ?? DEFAULT_SETTINGS.model.apiKey,
      modelName: partial.model?.modelName ?? DEFAULT_SETTINGS.model.modelName,
    },
    saveLocationOverride:
      partial.saveLocationOverride ?? DEFAULT_SETTINGS.saveLocationOverride,
    autoUpdate: partial.autoUpdate ?? DEFAULT_SETTINGS.autoUpdate,
    autoLaunch: partial.autoLaunch ?? DEFAULT_SETTINGS.autoLaunch,
    startMinimized: partial.startMinimized ?? DEFAULT_SETTINGS.startMinimized,
    pauseWhenHidden:
      partial.pauseWhenHidden ?? DEFAULT_SETTINGS.pauseWhenHidden,
  };
}

function isModelProvider(value: unknown): value is ModelProvider {
  return (
    value === "ollama" ||
    value === "llama-cpp" ||
    value === "custom" ||
    value === "none"
  );
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
