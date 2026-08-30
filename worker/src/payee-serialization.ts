// Process-local serialization for the worker's current single-process mode.
// It makes simultaneous queue jobs for one payee run in order. If workers are
// later scaled horizontally, replace this with a DB/distributed lock; a Map
// cannot coordinate separate processes.
const tails = new Map<string, Promise<void>>();

export async function runWithPayeeLock<T>(payeeId: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(payeeId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => mine);
  tails.set(payeeId, tail);

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (tails.get(payeeId) === tail) tails.delete(payeeId);
  }
}
