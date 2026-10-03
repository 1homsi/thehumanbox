import * as fs from "node:fs";
import * as path from "node:path";
import { atomicReplaceFile, atomicWriteNewFile, pathEntryExists, syncDirectoryBestEffort, syncFile } from "./atomic-files";
import { requireExistingDataRootIdentity, resolveActiveWorldFiles } from "./data-root";
import { rootsOverlap } from "./paths";
import { validateWorldSaveBytes, type MigrationWorldExpectation } from "./save-validation";

const PARKED_WORLDS_PREFIX = ".thehumanbox-migration-parked-worlds-";

const WORLDS_BACKUP_PREFIX = ".thehumanbox-worlds-backup-";

export function assertNoUnmigratedLegacyWorld(sourceRoot: string): void {
  const resolvedSource = path.resolve(sourceRoot);
  if (
    fs.existsSync(path.join(resolvedSource, "world.save")) &&
    !fs.existsSync(path.join(resolvedSource, "worlds", "_live"))
  ) {
    throw new Error(
      "this save folder still contains a legacy world.save; start the local game once to upgrade it before moving the save folder",
    );
  }
}

export function assertNoLegacyWorldAtMigrationTarget(targetRoot: string): void {
  const resolvedTarget = path.resolve(targetRoot);
  const legacySave = path.join(resolvedTarget, "world.save");
  if (fs.existsSync(legacySave)) {
    throw new Error(
      "the selected destination contains a legacy world.save; open that folder as its own save location and upgrade it before using it as a migration destination",
    );
  }
}

/**
 * Capture the stopped source world's exact bytes before any destination tree
 * is created. A data root without a local world is valid, but a legacy
 * root-level save must be upgraded in place first so migration cannot silently
 * strand it and mint an empty world at the destination.
 */
export function inspectSaveFolderMigrationSource(
  sourceRoot: string,
): MigrationWorldExpectation | null {
  const resolvedSource = path.resolve(sourceRoot);
  const markerPath = path.join(resolvedSource, "worlds", "_live");
  assertNoUnmigratedLegacyWorld(resolvedSource);

  if (!pathEntryExists(markerPath)) {
    return null;
  }

  const activeWorld = resolveActiveWorldFiles(resolvedSource);
  const hash = activeWorld.hash;
  const bytes = fs.readFileSync(activeWorld.savePath);
  const validated = validateWorldSaveBytes(bytes);
  if (validated.seedText === "0") {
    throw new Error(
      "the active world has no stable seed and cannot be migrated safely",
    );
  }
  return { hash, bytes, validated };
}

/** Verify the committed destination still contains the exact stopped source. */
export function verifySaveFolderMigrationCopy(
  targetRoot: string,
  expected: MigrationWorldExpectation | null,
): void {
  const markerPath = path.join(path.resolve(targetRoot), "worlds", "_live");
  if (!expected) {
    if (fs.existsSync(markerPath)) {
      throw new Error(
        "the copied save folder unexpectedly selected a live world",
      );
    }
    return;
  }

  const copiedHash = fs.readFileSync(markerPath, "utf8").trim();
  if (copiedHash !== expected.hash) {
    throw new Error(
      `copied live-world marker changed from ${expected.hash} to ${copiedHash}`,
    );
  }
  const copiedBytes = fs.readFileSync(
    path.join(path.resolve(targetRoot), "worlds", expected.hash, "world.save"),
  );
  validateWorldSaveBytes(copiedBytes);
  if (!copiedBytes.equals(expected.bytes)) {
    throw new Error(
      "copied active world does not byte-match the checkpointed source",
    );
  }
}

const MIGRATION_JOURNAL_NAME = ".thehumanbox-migration-journal.json";

interface SaveFolderMigrationJournal {
  version: 2;
  sourceRoot: string;
  targetRoot: string;
  token: string;
  startedAt: number;
  state: "copying" | "verified";
  targetHadWorlds: boolean;
  targetIdentityId: string | null;
}

export interface InterruptedMigrationRecovery {
  recovered: boolean;
  quarantinePath: string | null;
}

function migrationJournalPath(targetRoot: string): string {
  return path.join(path.resolve(targetRoot), MIGRATION_JOURNAL_NAME);
}

function parkedWorldsPath(targetRoot: string, token: string): string {
  return path.join(path.resolve(targetRoot), `${PARKED_WORLDS_PREFIX}${token}`);
}

function completedWorldsBackupPath(targetRoot: string, token: string): string {
  return path.join(path.resolve(targetRoot), `${WORLDS_BACKUP_PREFIX}${token}`);
}

function readSaveFolderMigrationJournal(
  targetRoot: string,
): SaveFolderMigrationJournal | null {
  try {
    const journalStat = fs.lstatSync(migrationJournalPath(targetRoot));
    if (journalStat.isSymbolicLink() || !journalStat.isFile()) return null;
    const parsed = JSON.parse(
      fs.readFileSync(migrationJournalPath(targetRoot), "utf8"),
    ) as Omit<Partial<SaveFolderMigrationJournal>, "version"> & {
      version?: number;
    };
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      typeof parsed.sourceRoot !== "string" ||
      typeof parsed.targetRoot !== "string" ||
      typeof parsed.token !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.token) ||
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      (parsed.state !== undefined &&
        parsed.state !== "copying" &&
        parsed.state !== "verified")
    ) {
      return null;
    }
    if (
      parsed.version === 2 &&
      (typeof parsed.targetHadWorlds !== "boolean" ||
        (parsed.targetIdentityId !== null &&
          typeof parsed.targetIdentityId !== "string"))
    ) {
      return null;
    }
    return {
      version: 2,
      sourceRoot: path.resolve(parsed.sourceRoot),
      targetRoot: path.resolve(parsed.targetRoot),
      token: parsed.token,
      startedAt: parsed.startedAt,
      // Journals from the first transactional implementation had no explicit
      // state. Treat them as unverified rather than inferring commit from the
      // settings path and potentially selecting a rejected destination.
      state: parsed.state === "verified" ? "verified" : "copying",
      // Version-one migrations could only target an empty worlds location.
      targetHadWorlds: parsed.version === 2 && parsed.targetHadWorlds === true,
      targetIdentityId:
        parsed.version === 2 && typeof parsed.targetIdentityId === "string"
          ? parsed.targetIdentityId
          : null,
    };
  } catch {
    return null;
  }
}

export function hasRecoverableSaveFolderMigration(
  sourceRoot: string,
  targetRoot: string,
): boolean {
  const journal = readSaveFolderMigrationJournal(targetRoot);
  return (
    journal !== null &&
    journal.sourceRoot === path.resolve(sourceRoot) &&
    journal.targetRoot === path.resolve(targetRoot)
  );
}

export function beginSaveFolderMigration(
  sourceRoot: string,
  targetRoot: string,
  token: string,
): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token))
    throw new Error("invalid save migration token");
  const resolvedSource = path.resolve(sourceRoot);
  const resolvedTarget = path.resolve(targetRoot);
  if (rootsOverlap(resolvedSource, resolvedTarget)) {
    throw new Error(
      "the new save folder cannot overlap the current save folder",
    );
  }
  fs.mkdirSync(resolvedTarget, { recursive: true });
  const journalPath = migrationJournalPath(resolvedTarget);
  if (fs.existsSync(journalPath)) {
    throw new Error(
      "the selected folder has an unfinished save migration that must be recovered",
    );
  }
  const targetWorlds = path.join(resolvedTarget, "worlds");
  const targetHadWorlds = fs.existsSync(targetWorlds);
  if (targetHadWorlds) {
    const targetWorldsStat = fs.lstatSync(targetWorlds);
    if (targetWorldsStat.isSymbolicLink() || !targetWorldsStat.isDirectory()) {
      throw new Error(
        "identified migration destination has an unsafe worlds entry",
      );
    }
  }
  const targetIdentityId = targetHadWorlds
    ? requireExistingDataRootIdentity(resolvedTarget).id
    : null;
  const parkedWorlds = parkedWorldsPath(resolvedTarget, token);
  const completedBackup = completedWorldsBackupPath(resolvedTarget, token);
  if (fs.existsSync(parkedWorlds) || fs.existsSync(completedBackup)) {
    throw new Error(
      "the selected folder already contains rollback data for this migration token",
    );
  }
  atomicWriteNewFile(
    journalPath,
    JSON.stringify({
      version: 2,
      sourceRoot: resolvedSource,
      targetRoot: resolvedTarget,
      token,
      startedAt: Date.now(),
      state: "copying",
      targetHadWorlds,
      targetIdentityId,
    } satisfies SaveFolderMigrationJournal),
  );
  if (targetHadWorlds) {
    try {
      fs.renameSync(targetWorlds, parkedWorlds);
      syncDirectoryBestEffort(resolvedTarget);
    } catch (error) {
      // If the rename happened but the following directory sync failed, put
      // the destination back before forgetting the journal.
      if (fs.existsSync(parkedWorlds) && !fs.existsSync(targetWorlds)) {
        fs.renameSync(parkedWorlds, targetWorlds);
      }
      fs.unlinkSync(journalPath);
      syncDirectoryBestEffort(resolvedTarget);
      throw error;
    }
  }
}

export function markSaveFolderMigrationVerified(
  targetRoot: string,
  token: string,
): void {
  const journal = readSaveFolderMigrationJournal(targetRoot);
  if (!journal || journal.token !== token) {
    throw new Error(
      "save migration journal changed before runtime verification completed",
    );
  }
  if (journal.state === "verified") return;
  atomicReplaceFile(
    migrationJournalPath(targetRoot),
    JSON.stringify({
      ...journal,
      state: "verified",
    } satisfies SaveFolderMigrationJournal),
  );
}

function uniqueInterruptedMigrationPath(
  targetRoot: string,
  token: string,
): string {
  const base = path.join(
    targetRoot,
    `.thehumanbox-interrupted-migration-${token}`,
  );
  let candidate = base;
  let suffix = 1;
  while (fs.existsSync(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function recoverInterruptedSaveFolderMigration(
  sourceRoot: string,
  targetRoot: string,
): InterruptedMigrationRecovery {
  const resolvedSource = path.resolve(sourceRoot);
  const resolvedTarget = path.resolve(targetRoot);
  const journalPath = migrationJournalPath(resolvedTarget);
  const journal = readSaveFolderMigrationJournal(resolvedTarget);
  if (!journal)
    throw new Error(
      "the selected folder has no valid interrupted save migration",
    );
  if (
    journal.sourceRoot !== resolvedSource ||
    journal.targetRoot !== resolvedTarget
  ) {
    throw new Error(
      "the interrupted save migration belongs to a different source folder",
    );
  }
  if (journal.targetHadWorlds) {
    const identity = requireExistingDataRootIdentity(resolvedTarget);
    if (!journal.targetIdentityId || identity.id !== journal.targetIdentityId) {
      throw new Error(
        "the interrupted save migration destination identity has changed",
      );
    }
  }

  const targetWorlds = path.join(resolvedTarget, "worlds");
  const stagingRoot = path.join(
    resolvedTarget,
    `.thehumanbox-migration-${journal.token}`,
  );
  const parkedWorlds = parkedWorldsPath(resolvedTarget, journal.token);
  const completedBackup = completedWorldsBackupPath(
    resolvedTarget,
    journal.token,
  );
  const rollbackWorlds = fs.existsSync(parkedWorlds)
    ? parkedWorlds
    : fs.existsSync(completedBackup)
      ? completedBackup
      : null;
  if (
    journal.targetHadWorlds &&
    !rollbackWorlds &&
    !fs.existsSync(targetWorlds)
  ) {
    throw new Error(
      "the interrupted save migration lost both its live and parked destination worlds",
    );
  }

  // A rollback slot proves any current target worlds are the incoming,
  // uncommitted copy. Without one, a v2 targetHadWorlds journal crashed before
  // parking (or after a completed restore), so its live tree must stay put.
  const quarantineTargetWorlds =
    fs.existsSync(targetWorlds) &&
    (!journal.targetHadWorlds || rollbackWorlds !== null);
  const quarantineStaging = fs.existsSync(stagingRoot);
  let quarantinePath: string | null = null;
  if (quarantineTargetWorlds || quarantineStaging) {
    quarantinePath = uniqueInterruptedMigrationPath(
      resolvedTarget,
      journal.token,
    );
    fs.mkdirSync(quarantinePath);
    fs.copyFileSync(
      journalPath,
      path.join(quarantinePath, "migration-journal.json"),
    );
    if (quarantineTargetWorlds) {
      fs.renameSync(targetWorlds, path.join(quarantinePath, "worlds"));
    }
    if (quarantineStaging) {
      fs.renameSync(stagingRoot, path.join(quarantinePath, "staging"));
    }
  }

  if (rollbackWorlds) {
    if (fs.existsSync(targetWorlds)) {
      throw new Error(
        "could not clear the uncommitted destination worlds before rollback",
      );
    }
    fs.renameSync(rollbackWorlds, targetWorlds);
  }

  fs.unlinkSync(journalPath);
  syncDirectoryBestEffort(resolvedTarget);
  return { recovered: true, quarantinePath };
}

function preserveParkedWorldsBackup(
  targetRoot: string,
  journal: SaveFolderMigrationJournal,
): void {
  if (!journal.targetHadWorlds) return;
  const identity = requireExistingDataRootIdentity(targetRoot);
  if (!journal.targetIdentityId || identity.id !== journal.targetIdentityId) {
    throw new Error(
      "save migration destination identity changed before commit",
    );
  }

  const parkedWorlds = parkedWorldsPath(targetRoot, journal.token);
  const completedBackup = completedWorldsBackupPath(targetRoot, journal.token);
  if (fs.existsSync(parkedWorlds)) {
    if (fs.existsSync(completedBackup)) {
      throw new Error(
        "save migration has two competing destination-world backups",
      );
    }
    fs.renameSync(parkedWorlds, completedBackup);
    syncDirectoryBestEffort(path.resolve(targetRoot));
    return;
  }
  if (!fs.existsSync(completedBackup)) {
    throw new Error("save migration destination-world backup is missing");
  }
}

export function finishSaveFolderMigration(
  targetRoot: string,
  token: string,
): boolean {
  const journal = readSaveFolderMigrationJournal(targetRoot);
  if (!journal || journal.token !== token) return false;
  if (journal.state !== "verified") {
    throw new Error(
      "cannot commit migrated worlds before runtime verification",
    );
  }
  if (!fs.existsSync(path.join(path.resolve(targetRoot), "worlds"))) {
    throw new Error(
      "cannot commit migrated worlds without a live destination copy",
    );
  }
  preserveParkedWorldsBackup(targetRoot, journal);
  fs.unlinkSync(migrationJournalPath(targetRoot));
  syncDirectoryBestEffort(path.resolve(targetRoot));
  return true;
}

/**
 * Settings are written only after the staged `worlds` directory is fully
 * renamed into place. If the app crashes after that settings commit but before
 * deleting the journal, opening this exact root is proof that the migration
 * committed; finish it instead of quarantining the now-active world on a later
 * retry.
 */
export function finishCommittedMigrationForActiveRoot(
  targetRoot: string,
): boolean {
  const resolvedTarget = path.resolve(targetRoot);
  const journal = readSaveFolderMigrationJournal(resolvedTarget);
  if (!journal) {
    if (pathEntryExists(migrationJournalPath(resolvedTarget))) {
      throw new Error(
        "active save folder has an unreadable or invalid migration journal",
      );
    }
    return false;
  }
  if (journal.targetRoot !== resolvedTarget) {
    throw new Error(
      "active save folder migration journal belongs to a different path",
    );
  }
  if (journal.state !== "verified") {
    throw new Error(
      "active save folder has an unverified migration; refusing to select it until the original folder is restored",
    );
  }
  if (!fs.existsSync(path.join(resolvedTarget, "worlds"))) {
    throw new Error(
      "active save folder has an unfinished migration without a worlds directory",
    );
  }
  preserveParkedWorldsBackup(resolvedTarget, journal);
  fs.unlinkSync(migrationJournalPath(resolvedTarget));
  syncDirectoryBestEffort(resolvedTarget);
  return true;
}

export function copyWorldsToStaging(
  sourceRoot: string,
  targetRoot: string,
  token: string,
): string {
  const sourceWorlds = path.join(sourceRoot, "worlds");
  const targetWorlds = path.join(targetRoot, "worlds");
  if (rootsOverlap(sourceRoot, targetRoot)) {
    throw new Error(
      "the new save folder cannot overlap the current save folder",
    );
  }
  assertNoUnmigratedLegacyWorld(sourceRoot);
  assertNoLegacyWorldAtMigrationTarget(targetRoot);
  if (fs.existsSync(targetWorlds)) {
    throw new Error(
      "the selected folder already contains The Human Box worlds; choose an empty folder",
    );
  }

  fs.mkdirSync(targetRoot, { recursive: true });
  const stagingRoot = path.join(targetRoot, `.thehumanbox-migration-${token}`);
  const stagingWorlds = path.join(stagingRoot, "worlds");
  fs.mkdirSync(stagingRoot, { recursive: false });
  try {
    if (fs.existsSync(sourceWorlds)) {
      copyTreeWithoutLinks(sourceWorlds, stagingWorlds);
    } else {
      fs.mkdirSync(stagingWorlds);
      syncDirectoryBestEffort(stagingWorlds);
    }
    syncDirectoryBestEffort(stagingRoot);
    return stagingRoot;
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

function copyTreeWithoutLinks(source: string, target: string): void {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink())
    throw new Error(`save migration refused symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target);
    for (const entry of fs.readdirSync(source)) {
      copyTreeWithoutLinks(path.join(source, entry), path.join(target, entry));
    }
    syncDirectoryBestEffort(target);
    return;
  }
  if (!stat.isFile())
    throw new Error(`save migration refused special file: ${source}`);
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  syncFile(target);
}
