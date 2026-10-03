import * as fs from "node:fs";
import * as path from "node:path";

function canonicalPath(input: string): string {
  let existing = path.resolve(input);
  const missing: string[] = [];

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }

  let canonicalExisting = existing;
  try {
    canonicalExisting = fs.realpathSync.native(existing);
  } catch {
    // The resolved absolute path is still useful if an unusual filesystem
    // does not expose a realpath for its root.
  }
  const canonical = path.resolve(canonicalExisting, ...missing);
  return process.platform === "win32"
    ? canonical.toLocaleLowerCase("en-US")
    : canonical;
}

export function rootsOverlap(a: string, b: string): boolean {
  const normalize = (input: string): string => {
    const resolved = path.resolve(input);
    return process.platform === "win32"
      ? resolved.toLocaleLowerCase("en-US")
      : resolved;
  };
  const isSameOrDescendant = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  };
  const overlaps = (first: string, second: string): boolean =>
    isSameOrDescendant(first, second) || isSameOrDescendant(second, first);

  // Check both names as entered and their existing realpath prefixes. The
  // lexical check prevents a leaf symlink inside a data root from escaping
  // containment checks; the canonical check catches an outside alias that
  // resolves back into the managed root.
  return (
    overlaps(normalize(a), normalize(b)) ||
    overlaps(canonicalPath(a), canonicalPath(b))
  );
}

export function pathsReferToSameLocation(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

export function assertExportOutsideDataRoot(
  dataRoot: string,
  destination: string,
): void {
  if (rootsOverlap(dataRoot, destination)) {
    throw new Error(
      "world exports must be saved outside The Human Box data folder",
    );
  }
}
