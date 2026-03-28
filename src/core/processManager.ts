import type { ChildProcess } from "node:child_process";
import type { IProcessManager } from "./interfaces";

export interface ProcessManagerSettings {
  verify: boolean;
  refactor: boolean;
  dryRun: boolean;
  aiParse: boolean;
}

export interface ProcessManagerDeps {
  claudeloopPath: string;
  workspaceRoot: string;
  spawn: (
    command: string,
    args: string[],
    options: Record<string, unknown>,
  ) => ChildProcess;
  lockExists: () => Promise<boolean>;
  deleteLock: () => Promise<void>;
  getSettings: () => ProcessManagerSettings;
  platform: string;
}

export class ProcessManager implements IProcessManager {
  private _process: ChildProcess | null = null;
  private _deps: ProcessManagerDeps;
  private _exitPromise: Promise<void> | null = null;
  private _exitResolve: (() => void) | null = null;

  constructor(deps: ProcessManagerDeps) {
    this._deps = deps;
  }

  get isRunning(): boolean {
    return this._process !== null;
  }

  async spawn(): Promise<void> {
    if (await this._deps.lockExists()) {
      throw new Error("lock file exists — claudeloop is already running");
    }

    const args = this._buildArgs();
    this._spawnChild(args);
    return this._exitPromise!;
  }

  async stop(): Promise<void> {
    return this._terminate(5000);
  }

  async deactivate(): Promise<void> {
    return this._terminate(3000);
  }

  async reset(): Promise<void> {
    if (await this._deps.lockExists()) {
      throw new Error("lock file exists — claudeloop is already running");
    }

    const settings = this._deps.getSettings();
    const args = ["--reset", ...this._settingsToArgs(settings)];
    this._spawnChild(args);
    return this._exitPromise!;
  }

  async spawnFromPhase(phase: number | string): Promise<void> {
    if (await this._deps.lockExists()) {
      throw new Error("lock file exists — claudeloop is already running");
    }

    const settings = this._deps.getSettings();
    const args = [
      "--phase",
      String(phase),
      "--continue",
      ...this._settingsToArgs(settings),
    ];
    this._spawnChild(args);
    return this._exitPromise!;
  }

  async markComplete(phase: number | string): Promise<void> {
    const args = ["--mark-complete", String(phase)];
    this._spawnChild(args);
    return this._exitPromise!;
  }

  async aiParse(granularity: string): Promise<void> {
    if (await this._deps.lockExists()) {
      throw new Error("lock file exists — claudeloop is already running");
    }

    this._spawnChild(["--ai-parse", "--granularity", granularity]);
    return this._exitPromise!;
  }

  async restore(archiveName: string): Promise<void> {
    if (await this._deps.lockExists()) {
      throw new Error("lock file exists — claudeloop is already running");
    }

    this._spawnChild(["--restore", archiveName]);
    return this._exitPromise!;
  }

  async forceUnlock(): Promise<void> {
    await this._deps.deleteLock();
  }

  private _buildArgs(): string[] {
    const settings = this._deps.getSettings();
    return this._settingsToArgs(settings);
  }

  private _settingsToArgs(settings: ProcessManagerSettings): string[] {
    const args: string[] = [];
    if (settings.verify) args.push("--verify");
    if (settings.refactor) args.push("--refactor");
    if (settings.dryRun) args.push("--dry-run");
    if (settings.aiParse) args.push("--ai-parse");
    return args;
  }

  private _spawnChild(args: string[]): void {
    const child = this._deps.spawn(this._deps.claudeloopPath, args, {
      cwd: this._deps.workspaceRoot,
      stdio: ["ignore", "ignore", "pipe"],
    });

    this._process = child;
    this._exitPromise = new Promise<void>((resolve) => {
      this._exitResolve = resolve;
      child.on("close", () => {
        this._process = null;
        this._exitResolve = null;
        resolve();
      });
    });
  }

  private async _terminate(timeoutMs: number): Promise<void> {
    if (!this._process) return;

    const signal =
      this._deps.platform === "win32" ? "SIGTERM" : "SIGINT";
    this._process.kill(signal);

    const exitPromise = this._exitPromise!;

    const timeout = new Promise<"timeout">((resolve) => {
      const id = setTimeout(() => resolve("timeout"), timeoutMs);
      exitPromise.then(() => clearTimeout(id));
    });

    const result = await Promise.race([
      exitPromise.then(() => "exited" as const),
      timeout,
    ]);

    if (result === "timeout" && this._process) {
      this._process.kill("SIGKILL");
      await exitPromise;
    }
  }
}
