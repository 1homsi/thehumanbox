import { parentPort, workerData } from "node:worker_threads";
import { copyWorldsToStaging } from "./save-folder-migration";

if (!parentPort) throw new Error("world copy worker has no parent");

const { sourceRoot, targetRoot, token } = workerData as {
  sourceRoot: string;
  targetRoot: string;
  token: string;
};

try {
  parentPort.postMessage({
    stagingRoot: copyWorldsToStaging(sourceRoot, targetRoot, token),
  });
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
  });
}
