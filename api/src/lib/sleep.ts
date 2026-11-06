export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Waits up to `ms`, but returns early when the worker is asked to stop
export async function sleepUnless(ms: number, shouldStop: () => boolean) {
  const end = Date.now() + ms;
  while (!shouldStop() && Date.now() < end) {
    await sleep(Math.min(500, end - Date.now()));
  }
}