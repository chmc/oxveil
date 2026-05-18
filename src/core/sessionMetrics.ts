export class SessionMetrics {
  private _cost = 0;
  private _todoDone = 0;
  private _todoTotal = 0;

  get cost(): number { return this._cost; }
  get todoDone(): number { return this._todoDone; }
  get todoTotal(): number { return this._todoTotal; }

  addCost(delta: number): void { this._cost += delta; }
  setCost(v: number): void { this._cost = v; }
  setTodos(done: number, total: number): void { this._todoDone = done; this._todoTotal = total; }

  reset(): void {
    this._cost = 0;
    this._todoDone = 0;
    this._todoTotal = 0;
  }
}
