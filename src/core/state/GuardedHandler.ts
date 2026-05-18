export type GuardedHandler<T = void> = (seq: number) => Promise<T>;

export type DisposableHandler<T = void> = (
  seq: number,
  isDisposed: () => boolean,
) => Promise<T>;

export function createGuardedHandler<T>(
  getSeq: () => number,
  incSeq: () => number,
  handler: (seq: number) => Promise<T>,
): () => Promise<T | undefined> {
  return async () => {
    const seq = incSeq();
    const result = await handler(seq);
    if (seq !== getSeq()) return undefined;
    return result;
  };
}
