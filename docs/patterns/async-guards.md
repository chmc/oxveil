# Async Guard Patterns

## Disposal Guard (`_disposed`)

All webview panels set `_disposed = true` as the first action in `dispose()`. Check at entry of public methods that create panels.

```typescript
class MyPanel {
  private _disposed = false;

  reveal(): void {
    if (this._disposed) return;
    // ...
  }

  dispose(): void {
    this._disposed = true;
    this._panel?.dispose();
    this._panel = undefined;
  }
}
```

## Sequence Guard (`_readSeq`)

For async handlers that read files or perform I/O. Increments before await, checks after.

```typescript
class MyPanel {
  private _readSeq = 0;

  async onFileChanged(): Promise<void> {
    if (this._disposed) return;
    const seq = ++this._readSeq;
    const content = await readFile();
    if (seq !== this._readSeq) return; // superseded
    this.render(content);
  }
}
```

## GuardedHandler Type

Type async handlers to enforce seq parameter — compiler rejects handlers without it.

```typescript
import type { GuardedHandler } from "../core/state/GuardedHandler";

class MyPanel {
  private _readSeq = 0;

  private _handleChange: GuardedHandler = async (seq) => {
    const content = await readFile();
    if (seq !== this._readSeq) return;
    this.render(content);
  };

  onFileChanged(): Promise<void | undefined> {
    return this._handleChange(++this._readSeq);
  }
}
```

## VersionedSnapshot + assertFresh

For async handlers that read from `SessionState`. Prevents TOCTOU.

```typescript
async function onStateChanged() {
  const snap = session.readSnapshot();
  const allDone = snap.progress?.phases.every(p => p.status === "completed");

  await someAsyncOp();

  try { session.assertFresh(snap.seq); } catch { return; } // state changed during await
  if (deps.isDisposed?.()) return;

  // safe to use snap values here
}
```

## Rules

- Async handlers in views: use `GuardedHandler` type signature
- State reads before await: use `assertFresh(seq)` or re-read after
- New panels: include `_disposed` flag + `GuardedHandler` signatures
