import * as path from "node:path";

const LOG_CHUNK_SIZE = 64 * 1024; // 64KB

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
  private _logOffset = 0;

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
    this._watcher?.dispose();
    this._watcher = undefined;
  }

  getFileChangeHandler(): (filePath: string) => void {
    return (filePath: string) => {
      const basename = path.basename(filePath);
      const fileType = KNOWN_FILES[basename];
      if (!fileType) return;

      // Per-file debounce
      const existing = this._timers.get(basename);
      if (existing) clearTimeout(existing);

      this._timers.set(
        basename,
        setTimeout(() => {
          this._timers.delete(basename);
          this._handleFile(filePath, fileType);
        }, this._deps.debounceMs),
      );
    };
  }

  private async _handleFile(filePath: string, fileType: FileType): Promise<void> {
    const content = await this._deps.readFile(filePath);

    switch (fileType) {
      case "lock":
        this._deps.onLockChange(content);
        break;
      case "progress":
        this._deps.onProgressChange(content);
        break;
      case "log":
        this._deliverLog(content);
        break;
    }
  }

  private _deliverLog(content: string): void {
    if (content.length <= LOG_CHUNK_SIZE) {
      this._deps.onLogChange(content);
      return;
    }

    // Deliver in 64KB chunks
    const first = content.slice(0, LOG_CHUNK_SIZE);
    this._deps.onLogChange(first);

    const remainder = content.slice(LOG_CHUNK_SIZE);
    if (remainder.length > 0) {
      setTimeout(() => this._deliverLog(remainder), 0);
    }
  }

  resetLogOffset(): void {
    this._logOffset = 0;
  }
}
