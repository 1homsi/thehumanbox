// The sandboxed preload cannot read `app.getVersion()` (main process only) and
// `process.env.npm_package_version` only exists when launched through a
// package-manager script, so a packaged app had no version. The main process
// passes it as a renderer argument instead (no IPC: a synchronous call with no
// handler would block the renderer). `preload/index.ts` carries a copy of the
// prefix and the parse because a sandboxed preload cannot import this file;
// app-version-arg.test.ts keeps the two in step.
export const APP_VERSION_ARG_PREFIX = "--thb-app-version=";

export function appVersionArgument(version: string): string {
  return `${APP_VERSION_ARG_PREFIX}${version}`;
}

export function parseAppVersionArgument(argv: readonly string[]): string {
  const arg = argv.find((a) => a.startsWith(APP_VERSION_ARG_PREFIX));
  return arg ? arg.slice(APP_VERSION_ARG_PREFIX.length) : "";
}
