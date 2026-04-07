const TICK_INTERVAL_MS = 10_000;

export class ElapsedTimer {
  private readonly _onTick: (elapsed: string) => void;
  private _intervalId: ReturnType<typeof setInterval> | undefined;
  private _startTime = 0;
  private _elapsed = "0m";

  constructor(onTick: (elapsed: string) => void) {
    this._onTick = onTick;
  }

  get elapsed(): string {
    return this._elapsed;
  }

  start(): void {
    this.stop();
    this._startTime = Date.now();
    this._elapsed = "0m";
    this._onTick(this._elapsed);

    this._intervalId = setInterval(() => {
      const seconds = Math.floor((Date.now() - this._startTime) / 1000);
      const minutes = Math.floor(seconds / 60);
      const rem = seconds % 60;
      if (rem > 0 && minutes < 10) {
        this._elapsed = `${minutes}m ${rem}s`;
      } else {
        this._elapsed = `${minutes}m`;
      }
      this._onTick(this._elapsed);
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this._intervalId !== undefined) {
      clearInterval(this._intervalId);
      this._intervalId = undefined;
    }
  }
}
