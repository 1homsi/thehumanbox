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
