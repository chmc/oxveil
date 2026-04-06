import * as path from "node:path";

export interface FileWatcher {
  onDidChange: (handler: (uri: { fsPath: string }) => void) => { dispose: () => void };
  onDidCreate: (handler: (uri: { fsPath: string }) => void) => { dispose: () => void };
  onDidDelete: (handler: (uri: { fsPath: string }) => void) => { dispose: () => void };
  dispose: () => void;
}

export interface WatcherDeps {
  workspaceRoot: string;
  debounceMs: number;
  onLockChange: (content: string) => void;
  onProgressChange: (content: string) => void;
  onLogChange: (content: string) => void;
  createWatcher: (glob: string) => FileWatcher;
  readFile: (path: string) => Promise<string>;
}

type FileType = "lock" | "progress" | "log";

const KNOWN_FILES: Record<string, FileType> = {
  lock: "lock",
  "PROGRESS.md": "progress",
  "live.log": "log",
};

export class WatcherManager {
  private readonly _deps: WatcherDeps;
  private _watcher: FileWatcher | undefined;
  private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _pending = new Set<string>();

  constructor(deps: WatcherDeps) {
    this._deps = deps;
  }

  start(): void {
    const glob = path.join(this._deps.workspaceRoot, ".claudeloop", "**");
    this._watcher = this._deps.createWatcher(glob);

    const handle = (uri: { fsPath: string }) =>
      this.getFileChangeHandler()(uri.fsPath);

    this._watcher.onDidChange(handle);
    this._watcher.onDidCreate(handle);
    this._watcher.onDidDelete(handle);
  }

  stop(): void {
    for (const timer of this._timers.values()) {
      clearTimeout(timer);
    }
    this._timers.clear();
    this._pending.clear();
    this._watcher?.dispose();
    this._watcher = undefined;
  }

  getFileChangeHandler(): (filePath: string) => void {
    return (filePath: string) => {
      const basename = path.basename(filePath);
      const fileType = KNOWN_FILES[basename];
      if (!fileType) return;

      if (this._timers.has(basename)) {
        this._pending.add(basename);
        return;
      }

      this._startCooldown(filePath, basename, fileType);
      this._handleFile(filePath, fileType);
    };
  }

  private _startCooldown(filePath: string, basename: string, fileType: FileType): void {
    this._timers.set(
      basename,
      setTimeout(() => {
        this._timers.delete(basename);
        if (this._pending.delete(basename)) {
          this._startCooldown(filePath, basename, fileType);
          this._handleFile(filePath, fileType);
        }
      }, this._deps.debounceMs),
    );
  }

  private async _handleFile(filePath: string, fileType: FileType): Promise<void> {
    let content: string;
    try {
      content = await this._deps.readFile(filePath);
    } catch {
      // File was deleted between the watcher event and the read.
      // For lock files, treat as lock released (empty → parseLock returns unlocked).
      if (fileType === "lock") {
        this._deps.onLockChange("");
      }
      return;
    }

    switch (fileType) {
      case "lock":
        this._deps.onLockChange(content);
        break;
      case "progress":
        this._deps.onProgressChange(content);
        break;
      case "log":
        this._deps.onLogChange(content);
        break;
    }
  }

}
