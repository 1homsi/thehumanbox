import * as path from "node:path";
import { fileURLToPath } from "node:url";

export function isRendererNavigation(url: string, rendererFile: string): boolean {
  try {
    const target = new URL(url);
    if (target.protocol !== "file:") return false;
    return path.resolve(fileURLToPath(target)) === path.resolve(rendererFile);
  } catch {
    return false;
  }
}

export function externalHttpUrl(value: string): string | null {
  try {
    const target = new URL(value);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target.toString();
  } catch {
    return null;
  }
}

export function isAllowedRendererPermission(
  permission: string,
  requestingUrl: string | undefined,
  isMainFrame: boolean,
  rendererFile: string,
): boolean {
  return (
    isMainFrame &&
    (permission === "fullscreen" || permission === "clipboard-sanitized-write") &&
    requestingUrl !== undefined &&
    isRendererNavigation(requestingUrl, rendererFile)
  );
}

const ERR_ABORTED = -3;

// A failed load only deserves the boot-error page when it is the main frame's
// own document. ERR_ABORTED just means a newer navigation superseded it (e.g.
// a reload racing `loadFile` after a migration/restart), and the error page
// itself must never be replaced by another error page.
export function shouldShowLoadError(
  errorCode: number,
  url: string,
  isMainFrame: boolean,
): boolean {
  if (!isMainFrame || errorCode === ERR_ABORTED) return false;
  return !url.startsWith("data:");
}
