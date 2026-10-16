import * as path from "node:path";

/**
 * Window and tray icon. Packaged builds copy it next to app.asar
 * (electron-builder.yml extraResources): build/ is not inside the asar, so a
 * path there resolves to nothing and nativeImage returns an empty image.
 */
export function appIconPath(isPackaged: boolean, resourcesPath: string, mainDir: string): string {
  return isPackaged
    ? path.join(resourcesPath, "icon.png")
    : path.join(mainDir, "..", "..", "build", "icon.png");
}
