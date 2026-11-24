export interface SteamClient {
  achievement: {
    activate(name: string): boolean;
    isActivated(name: string): boolean;
  };
}

export interface SteamLibrary {
  restartAppIfNecessary(appId: number): boolean;
  init(appId?: number): SteamClient;
  electronEnableSteamOverlay(disableEachFrameInvalidation?: boolean): void;
}

export type SteamStart =
  | { status: "ready"; client: SteamClient }
  | { status: "relaunching" }
  | { status: "unavailable"; reason: string };

export const ACHIEVEMENT_NAME = /^[A-Za-z0-9_]{1,64}$/;

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function startSteam(appId: number | null, load: () => SteamLibrary): SteamStart {
  if (appId === null) return { status: "unavailable", reason: "no Steam app id in this build" };
  let library: SteamLibrary;
  try {
    library = load();
  } catch (error) {
    return { status: "unavailable", reason: `Steamworks could not be loaded: ${reasonOf(error)}` };
  }
  try {
    if (library.restartAppIfNecessary(appId)) return { status: "relaunching" };
    const client = library.init(appId);
    library.electronEnableSteamOverlay();
    return { status: "ready", client };
  } catch (error) {
    return { status: "unavailable", reason: `Steam did not start: ${reasonOf(error)}` };
  }
}

let active: SteamClient | null = null;

export function setSteamClient(client: SteamClient | null): void {
  active = client;
}

export function steamReady(): boolean {
  return active !== null;
}

export function unlockSteamAchievement(name: unknown): { unlocked: boolean; reason?: string } {
  if (typeof name !== "string" || !ACHIEVEMENT_NAME.test(name)) {
    return { unlocked: false, reason: "not an achievement name" };
  }
  if (!active) return { unlocked: false, reason: "Steam is not running" };
  try {
    if (active.achievement.isActivated(name)) return { unlocked: true };
    return active.achievement.activate(name) ? { unlocked: true } : { unlocked: false, reason: "Steam refused it" };
  } catch (error) {
    return { unlocked: false, reason: reasonOf(error) };
  }
}
