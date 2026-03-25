import type { IDetection, IDetectionResult } from "./interfaces";

export type Executor = (
  command: string,
  args: string[]
) => Promise<{ stdout: string }>;

export class Detection implements IDetection {
  private _current: IDetectionResult | undefined;
  private _path: string;
  private readonly _executor: Executor;
  private readonly _minimumVersion: string;

  constructor(executor: Executor, path: string, minimumVersion: string) {
    this._executor = executor;
    this._path = path;
    this._minimumVersion = minimumVersion;
  }

  get current(): IDetectionResult | undefined {
    return this._current;
  }

  updatePath(path: string): void {
    this._path = path;
    this._current = undefined;
  }

  async detect(): Promise<IDetectionResult> {
    try {
      const { stdout } = await this._executor(this._path, ["--version"]);
      const version = stdout.trim();

      if (!isVersionCompatible(version, this._minimumVersion)) {
        this._current = {
          status: "version-incompatible",
          path: this._path,
          version,
          minimumVersion: this._minimumVersion,
        };
      } else {
        this._current = {
          status: "detected",
          path: this._path,
          version,
          minimumVersion: this._minimumVersion,
        };
      }
    } catch {
      this._current = {
        status: "not-found",
        minimumVersion: this._minimumVersion,
      };
    }

    return this._current;
  }
}

function parseVersion(version: string): number[] {
  return version.split(".").map(Number);
}

function isVersionCompatible(current: string, minimum: string): boolean {
  const cur = parseVersion(current);
  const min = parseVersion(minimum);
  const len = Math.max(cur.length, min.length);

  for (let i = 0; i < len; i++) {
    const c = cur[i] ?? 0;
    const m = min[i] ?? 0;
    if (c > m) return true;
    if (c < m) return false;
  }

  return true; // equal
}
