export type Distribution = "direct" | "steam";

export interface DistributionInfo {
  distribution: Distribution;
  steamAppId: number | null;
}

export const DISTRIBUTION_ARG_PREFIX = "--thb-distribution=";

export function parseDistribution(value: unknown): Distribution {
  return value === "steam" ? "steam" : "direct";
}

export function parseSteamAppId(value: unknown): number | null {
  const id = typeof value === "string" && /^\d{1,10}$/.test(value.trim()) ? Number(value.trim()) : value;
  return typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 0xffffffff ? id : null;
}

export function readDistribution(
  manifest: unknown,
  env: Record<string, string | undefined>,
  packaged: boolean,
): DistributionInfo {
  const fields = (manifest ?? {}) as { distribution?: unknown; steamAppId?: unknown };
  const fromEnv = !packaged && env.THB_DISTRIBUTION !== undefined;
  const distribution = parseDistribution(fromEnv ? env.THB_DISTRIBUTION : fields.distribution);
  if (distribution !== "steam") return { distribution, steamAppId: null };
  const steamAppId = parseSteamAppId(!packaged && env.THB_STEAM_APP_ID ? env.THB_STEAM_APP_ID : fields.steamAppId);
  return { distribution, steamAppId };
}

export function distributionArgument(distribution: Distribution): string {
  return `${DISTRIBUTION_ARG_PREFIX}${distribution}`;
}

export function parseDistributionArgument(argv: readonly string[]): Distribution {
  const arg = argv.find((a) => a.startsWith(DISTRIBUTION_ARG_PREFIX));
  return parseDistribution(arg ? arg.slice(DISTRIBUTION_ARG_PREFIX.length) : "");
}
