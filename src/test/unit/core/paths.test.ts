import { describe, it, expect, vi, afterEach } from "vitest";
import * as path from "node:path";

vi.mock("node:fs/promises");

import { loadPlanFileOverride } from "../../../core/paths";
import * as fs from "node:fs/promises";

const WORKSPACE = "/Users/test/myproject";

describe("loadPlanFileOverride", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns undefined when conf file missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect(await loadPlanFileOverride(WORKSPACE)).toBeUndefined();
  });

  it("returns undefined when PLAN_FILE not in conf", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("SOME_OTHER=value\n");
    expect(await loadPlanFileOverride(WORKSPACE)).toBeUndefined();
  });

  it("returns absolute path unchanged", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("PLAN_FILE=/absolute/path/PLAN.md\n");
    expect(await loadPlanFileOverride(WORKSPACE)).toBe("/absolute/path/PLAN.md");
  });

  it("resolves relative path against workspaceRoot", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("PLAN_FILE=PLAN.md\n");
    expect(await loadPlanFileOverride(WORKSPACE)).toBe(path.join(WORKSPACE, "PLAN.md"));
  });

  it("resolves subdirectory relative path", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("PLAN_FILE=docs/PLAN.md\n");
    expect(await loadPlanFileOverride(WORKSPACE)).toBe(path.join(WORKSPACE, "docs/PLAN.md"));
  });
});
