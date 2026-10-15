export function startWhenReady(
  ready: Promise<unknown>,
  boot: () => Promise<void>,
  onFailure: (error: unknown) => void | Promise<void>,
): void {
  void ready
    .then(boot)
    .catch(onFailure)
    .catch((error: unknown) => {
      console.error("[main] startup failure handler failed:", error);
    });
}
