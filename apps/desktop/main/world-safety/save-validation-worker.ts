import { parentPort, workerData } from "node:worker_threads";
import { validateWorldSaveBytes } from "./save-validation";

if (!parentPort) throw new Error("world-save validation worker has no parent");

try {
  const { bytes: _bytes, ...validated } = validateWorldSaveBytes(
    workerData as Uint8Array,
  );
  parentPort.postMessage(validated);
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
  });
}
