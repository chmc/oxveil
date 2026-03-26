export interface GitExecDeps {
  exec: (command: string, args: string[], cwd: string) => Promise<string>;
  cwd: string;
}

export interface PhaseCommitRange {
  firstCommit: string;
  lastCommit: string;
  commitCount: number;
}

export async function findPhaseCommits(
  deps: GitExecDeps,
  phaseNumber: number | string,
): Promise<PhaseCommitRange | null> {
  try {
    const output = await deps.exec(
      "git",
      [
        "log",
        "--all",
        `--grep=^Phase ${phaseNumber}:`,
        "--format=%H",
        "--reverse",
      ],
      deps.cwd,
    );

    const hashes = output.trim().split("\n").filter(Boolean);
    if (hashes.length === 0) return null;

    return {
      firstCommit: hashes[0],
      lastCommit: hashes[hashes.length - 1],
      commitCount: hashes.length,
    };
  } catch {
    return null;
  }
}

export async function getPhaseUnifiedDiff(
  deps: GitExecDeps,
  range: PhaseCommitRange,
): Promise<string> {
  const base =
    range.firstCommit === range.lastCommit
      ? `${range.firstCommit}~1..${range.lastCommit}`
      : `${range.firstCommit}~1..${range.lastCommit}`;

  try {
    return await deps.exec(
      "git",
      ["diff", base, "--", ":!.claudeloop/"],
      deps.cwd,
    );
  } catch {
    // firstCommit may be the root commit — diff against empty tree
    const emptyTree = "4b825dc642cb6eb9a060e54bf899d15f7e202a18";
    const altBase =
      range.firstCommit === range.lastCommit
        ? `${emptyTree}..${range.lastCommit}`
        : `${emptyTree}..${range.lastCommit}`;

    return await deps.exec(
      "git",
      ["diff", altBase, "--", ":!.claudeloop/"],
      deps.cwd,
    );
  }
}
