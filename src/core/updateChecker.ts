import * as semver from "semver";

export interface UpdateCheckerDeps {
  fetch: typeof globalThis.fetch;
  currentVersion: string;
  globalState: {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
  };
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

const CACHE_KEY = "oxveil.lastUpdateCheck";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface GitHubRelease {
  tag_name: string;
  html_url: string;
}

interface CachedCheck {
  timestamp: number;
  result: UpdateCheckResult;
}

export async function checkForUpdate(
  deps: UpdateCheckerDeps,
): Promise<UpdateCheckResult | null> {
  const cached = deps.globalState.get<CachedCheck>(CACHE_KEY);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const response = await deps.fetch(
      "https://api.github.com/repos/chmc/claudeloop/releases/latest",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as GitHubRelease;
    const latestVersion = data.tag_name.replace(/^v/, "");
    const currentVersion = deps.currentVersion;

    const result: UpdateCheckResult = {
      updateAvailable: isNewerVersion(currentVersion, latestVersion),
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url,
    };

    await deps.globalState.update(CACHE_KEY, { timestamp: Date.now(), result });
    return result;
  } catch {
    return null;
  }
}

export function isNewerVersion(current: string, latest: string): boolean {
  const cleanCurrent = current.replace(/^v/, "");
  const cleanLatest = latest.replace(/^v/, "");
  if (!semver.valid(cleanCurrent) || !semver.valid(cleanLatest)) return false;
  return semver.gt(cleanLatest, cleanCurrent);
}
