import { describe, it, expect, vi } from "vitest";
import {
  findPhaseCommits,
  getPhaseUnifiedDiff,
  type GitExecDeps,
} from "../../../core/gitIntegration";

function makeDeps(
  execFn: (cmd: string, args: string[], cwd: string) => Promise<string>,
): GitExecDeps {
  return { exec: vi.fn(execFn), cwd: "/workspace" };
}

describe("findPhaseCommits", () => {
  it("returns range for multiple commits", async () => {
    const deps = makeDeps(async () => "aaa111\nbbb222\nccc333\n");
    const result = await findPhaseCommits(deps, 1);
    expect(result).toEqual({
      firstCommit: "aaa111",
      lastCommit: "ccc333",
      commitCount: 3,
    });
    expect(deps.exec).toHaveBeenCalledWith(
      "git",
      ["log", "--all", "--grep=^Phase 1:", "--format=%H", "--reverse"],
      "/workspace",
    );
  });

  it("returns single commit range", async () => {
    const deps = makeDeps(async () => "aaa111\n");
    const result = await findPhaseCommits(deps, 2);
    expect(result).toEqual({
      firstCommit: "aaa111",
      lastCommit: "aaa111",
      commitCount: 1,
    });
  });

  it("returns null when no commits found", async () => {
    const deps = makeDeps(async () => "\n");
    const result = await findPhaseCommits(deps, 3);
    expect(result).toBeNull();
  });

  it("returns null when git is not available", async () => {
    const deps = makeDeps(async () => {
      throw new Error("not a git repository");
    });
    const result = await findPhaseCommits(deps, 1);
    expect(result).toBeNull();
  });

  it("handles string phase numbers", async () => {
    const deps = makeDeps(async () => "abc123\n");
    const result = await findPhaseCommits(deps, "1.5");
    expect(result).toEqual({
      firstCommit: "abc123",
      lastCommit: "abc123",
      commitCount: 1,
    });
    expect(deps.exec).toHaveBeenCalledWith(
      "git",
      ["log", "--all", "--grep=^Phase 1.5:", "--format=%H", "--reverse"],
      "/workspace",
    );
  });
});

describe("getPhaseUnifiedDiff", () => {
  it("generates diff for commit range excluding .claudeloop/", async () => {
    const deps = makeDeps(async () => "diff --git a/foo b/foo\n+added\n");
    const result = await getPhaseUnifiedDiff(deps, {
      firstCommit: "aaa111",
      lastCommit: "ccc333",
      commitCount: 3,
    });
    expect(result).toBe("diff --git a/foo b/foo\n+added\n");
    expect(deps.exec).toHaveBeenCalledWith(
      "git",
      ["diff", "aaa111~1..ccc333", "--", ":!.claudeloop/"],
      "/workspace",
    );
  });

  it("generates diff for single commit against parent", async () => {
    const deps = makeDeps(async () => "diff content");
    const result = await getPhaseUnifiedDiff(deps, {
      firstCommit: "aaa111",
      lastCommit: "aaa111",
      commitCount: 1,
    });
    expect(result).toBe("diff content");
    expect(deps.exec).toHaveBeenCalledWith(
      "git",
      ["diff", "aaa111~1..aaa111", "--", ":!.claudeloop/"],
      "/workspace",
    );
  });

  it("falls back to empty tree when parent does not exist", async () => {
    let callCount = 0;
    const deps = makeDeps(async (_cmd, args) => {
      callCount++;
      if (callCount === 1) throw new Error("bad revision");
      return "root diff content";
    });

    const result = await getPhaseUnifiedDiff(deps, {
      firstCommit: "aaa111",
      lastCommit: "aaa111",
      commitCount: 1,
    });

    expect(result).toBe("root diff content");
    expect(deps.exec).toHaveBeenCalledTimes(2);
    // Second call uses empty tree hash
    expect(deps.exec).toHaveBeenLastCalledWith(
      "git",
      [
        "diff",
        "4b825dc642cb6eb9a060e54bf899d15f7e202a18..aaa111",
        "--",
        ":!.claudeloop/",
      ],
      "/workspace",
    );
  });
});
