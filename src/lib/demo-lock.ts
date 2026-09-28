// Both playground runs (pay first, pay later) spend from the same demo
// runtime, so only one may run at a time, with a short gap between runs.

const MIN_GAP_MS = 15_000;
let lastRun = 0;

/** True if a run may start now (and marks it started). */
export function acquireDemo(): boolean {
  if (Date.now() - lastRun < MIN_GAP_MS) return false;
  lastRun = Date.now();
  return true;
}

export const busyResponse = () =>
  new Response(JSON.stringify({ error: "The demo agent is busy. Try again in a few seconds." }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
