import * as path from "node:path";

export interface LogViewerDeps {
  workspaceRoot: string;
  readdir: (dir: string) => Promise<string[]>;
}

/**
 * Find log files for a given phase number.
 * Checks for: phase-N.log, phase-N.attempt-M.log, phase-N.verify.log, phase-N.refactor.log
 * Returns sorted absolute paths. Returns empty array if logs dir is missing.
 */
export async function findPhaseLogs(
  deps: LogViewerDeps,
  phaseNumber: number | string,
): Promise<string[]> {
  const logsDir = path.join(deps.workspaceRoot, ".claudeloop", "logs");

  let entries: string[];
  try {
    entries = await deps.readdir(logsDir);
  } catch {
    return [];
  }

  const prefix = `phase-${phaseNumber}.`;
  const matches = entries
    .filter((f) => f.startsWith(prefix) && f.endsWith(".log"))
    .sort();

  return matches.map((f) => path.join(logsDir, f));
}
