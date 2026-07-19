import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  assertSameLoadedWorld,
  assertNoLegacyWorldAtMigrationTarget,
  atomicReplaceFile,
  beginSaveFolderMigration,
  chooseAvailableWorldHash,
  copyWorldsToStaging,
  downloadAndValidateWorldSave,
  finishCommittedMigrationForActiveRoot,
  finishSaveFolderMigration,
  hasRecoverableSaveFolderMigration,
  inspectSaveFolderMigrationSource,
  initializeDataRootIdentity,
  markSaveFolderMigrationVerified,
  requireOrUpgradeDataRootIdentity,
  requireExistingDataRootIdentity,
  recoverInterruptedFileReplacement,
  recoverInterruptedSaveFolderMigration,
  recoverInterruptedWorldReset,
  restoreParkedLiveWorld,
  rootsOverlap,
  validateWorldSaveBytes,
  verifySaveFolderMigrationCopy,
} from "./world-safety";

function validSave(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      version: 4,
      tick_count: 123,
      world_seed: 99,
      organisms: [],
      animals: [],
      grid: { tiles: new Array(600 * 300).fill(0) },
      ...overrides,
    }),
  );
}

function writeActiveWorld(root: string, hash: string, save: Buffer): void {
  mkdirSync(path.join(root, "worlds", hash), { recursive: true });
  writeFileSync(path.join(root, "worlds", "_live"), hash);
  writeFileSync(path.join(root, "worlds", hash, "world.save"), save);
}

function commitTestMigration(
  source: string,
  target: string,
  token: string,
): void {
  const expected = inspectSaveFolderMigrationSource(source);
  beginSaveFolderMigration(source, target, token);
  const staging = copyWorldsToStaging(source, target, token);
  renameSync(path.join(staging, "worlds"), path.join(target, "worlds"));
  rmSync(staging, { recursive: true, force: true });
  verifySaveFolderMigrationCopy(target, expected);
  markSaveFolderMigrationVerified(target, token);
  assert.equal(finishSaveFolderMigration(target, token), true);
}

test("validates the required native world-save shape", () => {
  const result = validateWorldSaveBytes(
    validSave({ world_seed: 18_000_000_000_000_000_000 }),
  );
  assert.equal(result.version, 4);
  assert.equal(result.tick, 123);
  assert.equal(result.seed, 18_000_000_000_000_000_000);
  assert.equal(result.seedText, "18000000000000000000");
  assert.equal(result.tickText, "123");
});

test("startup handshake rejects a silently minted replacement world", () => {
  const imported = validateWorldSaveBytes(
    validSave({ world_seed: 999, tick_count: 500 }),
  );
  const loaded = validateWorldSaveBytes(
    validSave({ world_seed: 1000, tick_count: 2 }),
  );
  assert.throws(
    () => assertSameLoadedWorld(imported, loaded),
    /expected imported seed/,
  );
  assert.doesNotThrow(() =>
    assertSameLoadedWorld(
      imported,
      validateWorldSaveBytes(validSave({ world_seed: 999, tick_count: 503 })),
    ),
  );
});

test("rejects incompatible or incomplete saves before import", () => {
  assert.throws(
    () => validateWorldSaveBytes(validSave({ version: 5 })),
    /newer/,
  );
  assert.throws(
    () => validateWorldSaveBytes(validSave({ grid: { tiles: [0] } })),
    /expected 180000/,
  );
  assert.throws(
    () => validateWorldSaveBytes(Buffer.from("{bad json")),
    /not valid JSON/,
  );
});

test("bounds streamed downloads even without a content-length header", async () => {
  const fetchImpl = async () =>
    new Response(new Uint8Array(32), { status: 200 });
  await assert.rejects(
    downloadAndValidateWorldSave("https://example.test/world.save", {
      fetchImpl,
      maxBytes: 16,
    }),
    /safety limit/,
  );
});

test("keeps existing local hashes instead of replacing them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-hash-test-"));
  try {
    mkdirSync(path.join(root, "shared-hash"));
    assert.equal(
      chooseAvailableWorldHash(root, "shared-hash", 1234),
      "shared-hash-local-ya",
    );
    assert.equal(chooseAvailableWorldHash(root, "unused", 1234), "unused");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stages a save-folder copy without changing the source", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-migration-test-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  try {
    mkdirSync(path.join(source, "worlds", "abc"), { recursive: true });
    writeFileSync(path.join(source, "worlds", "_live"), "abc");
    writeFileSync(path.join(source, "worlds", "abc", "world.save"), "safe");
    const staging = copyWorldsToStaging(source, target, "token");
    assert.equal(
      readFileSync(path.join(staging, "worlds", "_live"), "utf8"),
      "abc",
    );
    assert.equal(
      readFileSync(path.join(source, "worlds", "abc", "world.save"), "utf8"),
      "safe",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to strand a root-level legacy save during folder migration", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-legacy-migration-test-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const legacy = Buffer.from("legacy-world-bytes");
  try {
    mkdirSync(source);
    writeFileSync(path.join(source, "world.save"), legacy);

    assert.throws(
      () => inspectSaveFolderMigrationSource(source),
      /legacy world\.save.*upgrade.*before moving/,
    );
    assert.throws(
      () => copyWorldsToStaging(source, target, "token"),
      /legacy world\.save/,
    );
    assert.deepEqual(readFileSync(path.join(source, "world.save")), legacy);
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses and preserves a destination root-level legacy save before migration mutation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-legacy-target-test-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const legacy = validSave({ world_seed: 444 });
  try {
    mkdirSync(path.join(source, "worlds"), { recursive: true });
    mkdirSync(target);
    writeFileSync(path.join(target, "world.save"), legacy);

    assert.throws(
      () => assertNoLegacyWorldAtMigrationTarget(target),
      /destination contains a legacy world\.save/,
    );
    assert.throws(
      () => copyWorldsToStaging(source, target, "token"),
      /legacy world\.save/,
    );
    assert.deepEqual(readFileSync(path.join(target, "world.save")), legacy);
    assert.deepEqual(readdirSync(target), ["world.save"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("custom data roots are identified, upgraded only from real worlds, and never recreated", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-data-root-identity-test-"));
  const missing = path.join(root, "missing");
  const empty = path.join(root, "empty");
  const existing = path.join(root, "existing");
  const selected = path.join(root, "selected");
  try {
    mkdirSync(empty);
    mkdirSync(path.join(existing, "worlds", "abc"), { recursive: true });
    writeFileSync(path.join(existing, "worlds", "_live"), "abc");
    writeFileSync(
      path.join(existing, "worlds", "abc", "world.save"),
      validSave(),
    );
    mkdirSync(selected);

    assert.throws(
      () => requireOrUpgradeDataRootIdentity(missing),
      /unavailable/,
    );
    assert.equal(existsSync(missing), false);
    assert.throws(
      () => requireOrUpgradeDataRootIdentity(empty),
      /empty or is not recognized/,
    );
    assert.deepEqual(readdirSync(empty), []);

    const upgraded = requireOrUpgradeDataRootIdentity(existing);
    assert.equal(upgraded.kind, "thehumanbox-data-root");
    assert.equal(requireOrUpgradeDataRootIdentity(existing).id, upgraded.id);

    const initialized = initializeDataRootIdentity(selected);
    assert.equal(requireOrUpgradeDataRootIdentity(selected).id, initialized.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("never parks or replaces worlds in an unidentified destination", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "thb-unidentified-migration-target-"),
  );
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const oldTargetSave = validSave({ world_seed: 700, tick_count: 70 });
  try {
    mkdirSync(path.join(source, "worlds", "source-world"), { recursive: true });
    writeFileSync(path.join(source, "worlds", "_live"), "source-world");
    writeFileSync(
      path.join(source, "worlds", "source-world", "world.save"),
      validSave(),
    );
    mkdirSync(path.join(target, "worlds", "target-world"), { recursive: true });
    writeFileSync(path.join(target, "worlds", "_live"), "target-world");
    writeFileSync(
      path.join(target, "worlds", "target-world", "world.save"),
      oldTargetSave,
    );

    assert.throws(
      () => requireExistingDataRootIdentity(target),
      /data-root identity/,
    );
    assert.throws(
      () => beginSaveFolderMigration(source, target, "unidentified-token"),
      /data-root identity/,
    );
    assert.deepEqual(
      readFileSync(path.join(target, "worlds", "target-world", "world.save")),
      oldTargetSave,
    );
    assert.equal(
      existsSync(path.join(target, ".thehumanbox-migration-journal.json")),
      false,
    );
    assert.deepEqual(readdirSync(target), ["worlds"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects nested and symlink-aliased save roots", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-overlap-migration-test-"));
  const source = path.join(root, "source");
  const nested = path.join(source, "nested-target");
  const alias = path.join(root, "source-alias");
  try {
    mkdirSync(source);
    symlinkSync(
      source,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );

    assert.equal(rootsOverlap(source, nested), true);
    assert.equal(rootsOverlap(nested, source), true);
    assert.equal(rootsOverlap(source, alias), true);
    assert.throws(
      () => beginSaveFolderMigration(source, nested, "nested-token"),
      /save folder cannot overlap/,
    );
    assert.throws(
      () => beginSaveFolderMigration(source, alias, "alias-token"),
      /save folder cannot overlap/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proves the copied active world is byte-identical before migration commits", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-copy-proof-test-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  try {
    mkdirSync(path.join(source, "worlds", "abc"), { recursive: true });
    writeFileSync(path.join(source, "worlds", "_live"), "abc");
    writeFileSync(
      path.join(source, "worlds", "abc", "world.save"),
      validSave(),
    );
    const expected = inspectSaveFolderMigrationSource(source);
    assert.ok(expected);

    const staging = copyWorldsToStaging(source, target, "copy-token");
    renameSync(path.join(staging, "worlds"), path.join(target, "worlds"));
    verifySaveFolderMigrationCopy(target, expected);

    writeFileSync(
      path.join(target, "worlds", "abc", "world.save"),
      Buffer.concat([expected.bytes, Buffer.from("\n")]),
    );
    assert.throws(
      () => verifySaveFolderMigrationCopy(target, expected),
      /does not byte-match/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("round-trips current worlds into a retained app-owned destination", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-migration-round-trip-"));
  const defaultRoot = path.join(root, "default");
  const customRoot = path.join(root, "custom");
  const original = validSave({ world_seed: 810, tick_count: 100 });
  const advanced = validSave({ world_seed: 810, tick_count: 450 });
  try {
    mkdirSync(defaultRoot);
    mkdirSync(customRoot);
    initializeDataRootIdentity(defaultRoot);
    initializeDataRootIdentity(customRoot);
    writeActiveWorld(defaultRoot, "round-trip-world", original);

    commitTestMigration(defaultRoot, customRoot, "round-trip-out");
    writeFileSync(
      path.join(customRoot, "worlds", "round-trip-world", "world.save"),
      advanced,
    );

    commitTestMigration(customRoot, defaultRoot, "round-trip-back");

    assert.deepEqual(
      readFileSync(
        path.join(defaultRoot, "worlds", "round-trip-world", "world.save"),
      ),
      advanced,
    );
    assert.deepEqual(
      readFileSync(
        path.join(customRoot, "worlds", "round-trip-world", "world.save"),
      ),
      advanced,
    );
    const backup = readdirSync(defaultRoot).find((entry) =>
      entry.startsWith(".thehumanbox-worlds-backup-round-trip-back"),
    );
    assert.ok(backup);
    assert.deepEqual(
      readFileSync(
        path.join(defaultRoot, backup!, "round-trip-world", "world.save"),
      ),
      original,
    );
    assert.equal(
      hasRecoverableSaveFolderMigration(customRoot, defaultRoot),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("interrupted replacement restores parked destination worlds and preserves the failed copy", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "thb-migration-parked-recovery-"),
  );
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const oldTargetSave = validSave({ world_seed: 901, tick_count: 90 });
  const incomingSave = validSave({ world_seed: 902, tick_count: 200 });
  const token = "parked-recovery";
  try {
    mkdirSync(source);
    mkdirSync(target);
    initializeDataRootIdentity(source);
    initializeDataRootIdentity(target);
    writeActiveWorld(source, "incoming-world", incomingSave);
    writeActiveWorld(target, "old-target-world", oldTargetSave);

    beginSaveFolderMigration(source, target, token);
    const staging = copyWorldsToStaging(source, target, token);
    renameSync(path.join(staging, "worlds"), path.join(target, "worlds"));
    rmSync(staging, { recursive: true, force: true });
    markSaveFolderMigrationVerified(target, token);

    // Model a crash after the rollback slot was archived but before the
    // verified journal could be removed.
    renameSync(
      path.join(target, `.thehumanbox-migration-parked-worlds-${token}`),
      path.join(target, `.thehumanbox-worlds-backup-${token}`),
    );
    const recovery = recoverInterruptedSaveFolderMigration(source, target);

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.quarantinePath);
    assert.equal(
      readFileSync(path.join(target, "worlds", "_live"), "utf8"),
      "old-target-world",
    );
    assert.deepEqual(
      readFileSync(
        path.join(target, "worlds", "old-target-world", "world.save"),
      ),
      oldTargetSave,
    );
    assert.deepEqual(
      readFileSync(
        path.join(
          recovery.quarantinePath!,
          "worlds",
          "incoming-world",
          "world.save",
        ),
      ),
      incomingSave,
    );
    assert.equal(hasRecoverableSaveFolderMigration(source, target), false);
    assert.equal(
      existsSync(path.join(target, `.thehumanbox-worlds-backup-${token}`)),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("startup finishes a verified round-trip while retaining the parked worlds as a backup", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "thb-migration-startup-commit-"),
  );
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const oldTargetSave = validSave({ world_seed: 910, tick_count: 90 });
  const incomingSave = validSave({ world_seed: 911, tick_count: 210 });
  const token = "startup-round-trip";
  try {
    mkdirSync(source);
    mkdirSync(target);
    initializeDataRootIdentity(source);
    initializeDataRootIdentity(target);
    writeActiveWorld(source, "incoming-world", incomingSave);
    writeActiveWorld(target, "old-target-world", oldTargetSave);

    beginSaveFolderMigration(source, target, token);
    const staging = copyWorldsToStaging(source, target, token);
    renameSync(path.join(staging, "worlds"), path.join(target, "worlds"));
    rmSync(staging, { recursive: true, force: true });
    markSaveFolderMigrationVerified(target, token);

    assert.equal(finishCommittedMigrationForActiveRoot(target), true);
    assert.equal(
      readFileSync(path.join(target, "worlds", "_live"), "utf8"),
      "incoming-world",
    );
    assert.deepEqual(
      readFileSync(path.join(target, "worlds", "incoming-world", "world.save")),
      incomingSave,
    );
    assert.deepEqual(
      readFileSync(
        path.join(
          target,
          `.thehumanbox-worlds-backup-${token}`,
          "old-target-world",
          "world.save",
        ),
      ),
      oldTargetSave,
    );
    assert.equal(hasRecoverableSaveFolderMigration(source, target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an invalid active source before a migration can be committed", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "thb-invalid-source-migration-test-"),
  );
  const source = path.join(root, "source");
  try {
    mkdirSync(path.join(source, "worlds", "abc"), { recursive: true });
    writeFileSync(path.join(source, "worlds", "_live"), "abc");
    writeFileSync(path.join(source, "worlds", "abc", "world.save"), "{broken");

    assert.throws(
      () => inspectSaveFolderMigrationSource(source),
      /not valid JSON/,
    );
    assert.equal(
      readFileSync(path.join(source, "worlds", "_live"), "utf8"),
      "abc",
    );
    assert.equal(
      readFileSync(path.join(source, "worlds", "abc", "world.save"), "utf8"),
      "{broken",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("durably replaces control-plane files without leaving a prepared file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-atomic-replace-test-"));
  const settings = path.join(root, "settings.json");
  try {
    writeFileSync(settings, "old");
    atomicReplaceFile(settings, "new");
    assert.equal(readFileSync(settings, "utf8"), "new");
    assert.deepEqual(readdirSync(root), ["settings.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("quarantines an interrupted destination commit so migration can retry safely", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-migration-retry-test-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  try {
    mkdirSync(path.join(source, "worlds", "source-world"), { recursive: true });
    writeFileSync(path.join(source, "worlds", "_live"), "source-world");
    writeFileSync(
      path.join(source, "worlds", "source-world", "world.save"),
      "source-save",
    );

    beginSaveFolderMigration(source, target, "crashed-token");
    mkdirSync(path.join(target, "worlds", "copied-world"), { recursive: true });
    writeFileSync(path.join(target, "worlds", "_live"), "copied-world");
    writeFileSync(
      path.join(target, "worlds", "copied-world", "world.save"),
      "copied-save",
    );

    assert.equal(hasRecoverableSaveFolderMigration(source, target), true);
    const recovery = recoverInterruptedSaveFolderMigration(source, target);

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.quarantinePath);
    assert.equal(existsSync(path.join(target, "worlds")), false);
    assert.equal(
      readFileSync(
        path.join(
          recovery.quarantinePath!,
          "worlds",
          "copied-world",
          "world.save",
        ),
        "utf8",
      ),
      "copied-save",
    );
    assert.equal(hasRecoverableSaveFolderMigration(source, target), false);

    const retryStaging = copyWorldsToStaging(source, target, "retry-token");
    assert.equal(
      readFileSync(
        path.join(retryStaging, "worlds", "source-world", "world.save"),
        "utf8",
      ),
      "source-save",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not reclaim a migration journal created for a different source", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-migration-owner-test-"));
  const source = path.join(root, "source");
  const otherSource = path.join(root, "other-source");
  const target = path.join(root, "target");
  try {
    beginSaveFolderMigration(source, target, "owner-token");
    mkdirSync(path.join(target, "worlds"), { recursive: true });

    assert.equal(hasRecoverableSaveFolderMigration(otherSource, target), false);
    assert.throws(
      () => recoverInterruptedSaveFolderMigration(otherSource, target),
      /different source folder/,
    );
    assert.equal(existsSync(path.join(target, "worlds")), true);
    assert.equal(finishSaveFolderMigration(target, "not-the-owner"), false);
    assert.equal(hasRecoverableSaveFolderMigration(source, target), true);
    assert.equal(finishSaveFolderMigration(target, "owner-token"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only a runtime-verified migration journal is eligible for startup commit", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "thb-migration-committed-test-"),
  );
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  try {
    beginSaveFolderMigration(source, target, "committed-token");
    mkdirSync(path.join(target, "worlds"));

    assert.throws(
      () => finishCommittedMigrationForActiveRoot(target),
      /unverified migration/,
    );
    assert.equal(hasRecoverableSaveFolderMigration(source, target), true);

    markSaveFolderMigrationVerified(target, "committed-token");
    assert.equal(finishCommittedMigrationForActiveRoot(target), true);
    assert.equal(hasRecoverableSaveFolderMigration(source, target), false);
    assert.equal(existsSync(path.join(target, "worlds")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recovers the old marker after a crash between replacement renames", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-marker-test-"));
  const marker = path.join(root, "_live");
  try {
    writeFileSync(`${marker}.rollback-token`, "old-world");
    writeFileSync(`${marker}.next-token`, "new-world");
    recoverInterruptedFileReplacement(marker);
    assert.equal(readFileSync(marker, "utf8"), "old-world");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recovers the old marker after the unverified replacement became live", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-marker-live-test-"));
  const marker = path.join(root, "_live");
  try {
    writeFileSync(marker, "unverified-world");
    writeFileSync(`${marker}.rollback-token`, "old-world");
    recoverInterruptedFileReplacement(marker);
    assert.equal(readFileSync(marker, "utf8"), "old-world");
    assert.equal(existsSync(`${marker}.rollback-token`), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reset rollback restores the parked marker and quarantines a newly started world", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-reset-rollback-test-"));
  const worldsDir = path.join(root, "worlds");
  const marker = path.join(worldsDir, "_live");
  const parked = `${marker}.reset-token`;
  try {
    mkdirSync(path.join(worldsDir, "old-world"), { recursive: true });
    mkdirSync(path.join(worldsDir, "new-world"), { recursive: true });
    writeFileSync(path.join(worldsDir, "new-world", "world.save"), "new");
    writeFileSync(marker, "new-world");
    writeFileSync(parked, "old-world");

    const result = restoreParkedLiveWorld(
      worldsDir,
      parked,
      "old-world",
      "token",
    );

    assert.equal(readFileSync(marker, "utf8"), "old-world");
    assert.equal(result.failedHash, "new-world");
    assert.ok(result.quarantinePath);
    assert.equal(
      readFileSync(path.join(result.quarantinePath!, "world.save"), "utf8"),
      "new",
    );
    assert.equal(
      readFileSync(path.join(result.quarantinePath!, "_failed_live"), "utf8"),
      "new-world",
    );
    assert.equal(existsSync(path.join(worldsDir, "new-world")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("startup recovery rolls back a reset that crashed after selecting a new world", () => {
  const root = mkdtempSync(path.join(tmpdir(), "thb-reset-startup-test-"));
  const worldsDir = path.join(root, "worlds");
  const marker = path.join(worldsDir, "_live");
  const parked = `${marker}.reset-startup-token`;
  try {
    mkdirSync(path.join(worldsDir, "old-world"), { recursive: true });
    mkdirSync(path.join(worldsDir, "new-world"), { recursive: true });
    writeFileSync(path.join(worldsDir, "new-world", "world.save"), "new");
    writeFileSync(marker, "new-world");
    writeFileSync(parked, "old-world");

    recoverInterruptedWorldReset(marker);

    assert.equal(readFileSync(marker, "utf8"), "old-world");
    assert.equal(existsSync(parked), false);
    const quarantined = readdirSync(worldsDir).find((name) =>
      name.startsWith(".failed-reset-startup-token-new-world"),
    );
    assert.ok(quarantined);
    assert.equal(
      readFileSync(path.join(worldsDir, quarantined!, "world.save"), "utf8"),
      "new",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
