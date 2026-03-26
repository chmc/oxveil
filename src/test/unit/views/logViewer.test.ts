import { describe, it, expect } from "vitest";
import { findPhaseLogs, type LogViewerDeps } from "../../../views/logViewer";
import * as path from "node:path";

function makeDeps(files: string[] | "missing"): LogViewerDeps {
  return {
    workspaceRoot: "/workspace",
    readdir:
      files === "missing"
        ? async () => {
            throw new Error("ENOENT: no such file or directory");
          }
        : async () => files,
  };
}

const logsDir = path.join("/workspace", ".claudeloop", "logs");

describe("findPhaseLogs", () => {
  it("returns single log file", async () => {
    const deps = makeDeps(["phase-1.log"]);
    const result = await findPhaseLogs(deps, 1);
    expect(result).toEqual([path.join(logsDir, "phase-1.log")]);
  });

  it("returns multiple attempt logs sorted", async () => {
    const deps = makeDeps([
      "phase-2.attempt-2.log",
      "phase-2.log",
      "phase-2.attempt-1.log",
    ]);
    const result = await findPhaseLogs(deps, 2);
    expect(result).toEqual([
      path.join(logsDir, "phase-2.attempt-1.log"),
      path.join(logsDir, "phase-2.attempt-2.log"),
      path.join(logsDir, "phase-2.log"),
    ]);
  });

  it("returns verify log", async () => {
    const deps = makeDeps(["phase-3.log", "phase-3.verify.log"]);
    const result = await findPhaseLogs(deps, 3);
    expect(result).toEqual([
      path.join(logsDir, "phase-3.log"),
      path.join(logsDir, "phase-3.verify.log"),
    ]);
  });

  it("returns refactor log", async () => {
    const deps = makeDeps(["phase-1.log", "phase-1.refactor.log"]);
    const result = await findPhaseLogs(deps, 1);
    expect(result).toEqual([
      path.join(logsDir, "phase-1.log"),
      path.join(logsDir, "phase-1.refactor.log"),
    ]);
  });

  it("returns empty array when no logs found", async () => {
    const deps = makeDeps(["phase-2.log"]);
    const result = await findPhaseLogs(deps, 1);
    expect(result).toEqual([]);
  });

  it("returns empty array when logs directory is missing", async () => {
    const deps = makeDeps("missing");
    const result = await findPhaseLogs(deps, 1);
    expect(result).toEqual([]);
  });

  it("ignores files from other phases", async () => {
    const deps = makeDeps([
      "phase-1.log",
      "phase-2.log",
      "phase-10.log",
    ]);
    const result = await findPhaseLogs(deps, 1);
    expect(result).toEqual([path.join(logsDir, "phase-1.log")]);
  });
});
