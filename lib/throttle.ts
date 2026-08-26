export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `task` over `items` at most `limit` at a time, pausing `gapMs` between
 * requests on each worker. Results keep the input order.
 *
 * Both upstream venues rate-limit. Firing every request at once with
 * `Promise.allSettled` gets a large share of them 429'd, and because the callers
 * treat a failed fetch as best-effort the markets simply vanish - a silent,
 * partial board rather than a visible error.
 */
export async function mapLimit<T, R>(
  items: T[], limit: number, gapMs: number, task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await task(items[i], i);
      if (gapMs > 0) await sleep(gapMs);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** Run `task`, retrying up to `retries` times with a linear backoff. */
export async function withRetry<R>(
  task: () => Promise<R>, retries = 1, backoffMs = 400,
): Promise<R> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * attempt);
    try { return await task(); } catch (err) { last = err; }
  }
  throw last;
}
