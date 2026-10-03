// Everything that keeps a player's worlds safe on disk: validating saves, writing
// them atomically, recognising the data folder, recovering from interrupted
// resets and migrating the save folder. Split by concern under ./world-safety/;
// this file keeps the original import path working.
export {
  MAX_REMOTE_SAVE_BYTES,
  SUPPORTED_SAVE_SCHEMA_VERSION,
  validateWorldSaveBytes,
  assertSameLoadedWorld,
  downloadAndValidateWorldSave,
  validateWorldHash,
  chooseAvailableWorldHash,
} from "./world-safety/save-validation";
export type { ValidatedWorldSave, MigrationWorldExpectation } from "./world-safety/save-validation";
export {
  syncDirectoryBestEffort,
  atomicWriteNewFile,
  atomicReplaceFile,
} from "./world-safety/atomic-files";
export {
  resolveActiveWorldFiles,
  initializeDataRootIdentity,
  requireExistingDataRootIdentity,
  assertEmptyOrIdentifiedDataRoot,
  requireOrUpgradeDataRootIdentity,
} from "./world-safety/data-root";
export type { DataRootIdentity, ActiveWorldFiles } from "./world-safety/data-root";
export {
  recoverInterruptedFileReplacement,
  recoverInterruptedWorldReset,
  restoreParkedLiveWorld,
} from "./world-safety/recovery";
export type { ResetRollbackResult } from "./world-safety/recovery";
export {
  rootsOverlap,
  pathsReferToSameLocation,
  assertExportOutsideDataRoot,
} from "./world-safety/paths";
export {
  assertNoUnmigratedLegacyWorld,
  assertNoLegacyWorldAtMigrationTarget,
  inspectSaveFolderMigrationSource,
  verifySaveFolderMigrationCopy,
  hasRecoverableSaveFolderMigration,
  beginSaveFolderMigration,
  markSaveFolderMigrationVerified,
  recoverInterruptedSaveFolderMigration,
  finishSaveFolderMigration,
  finishCommittedMigrationForActiveRoot,
  copyWorldsToStaging,
} from "./world-safety/save-folder-migration";
export type { InterruptedMigrationRecovery } from "./world-safety/save-folder-migration";
