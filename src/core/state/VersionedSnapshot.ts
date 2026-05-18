export class StaleStateError extends Error {
  constructor(expected: number, actual: number) {
    super(`Stale state: expected seq ${expected}, got ${actual}`);
    this.name = "StaleStateError";
  }
}

export class VersionedSnapshot<T> {
  private _seq = 0;
  private _value: T;

  constructor(initial: T) {
    this._value = initial;
  }

  read(): { value: T; seq: number } {
    return { value: this._value, seq: this._seq };
  }

  update(fn: (v: T) => T): void {
    this._value = fn(this._value);
    this._seq++;
  }

  assertFresh(seq: number): void {
    if (seq !== this._seq) {
      throw new StaleStateError(seq, this._seq);
    }
  }
}
