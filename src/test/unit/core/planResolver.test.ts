import { describe, it, expect, vi } from "vitest";
import {
  deriveProjectHash,
  resolveFromSessionData,
  extractLastPlanFilePath,
  type PlanResolverDeps,
} from "../../../core/planResolver";

describe("deriveProjectHash", () => {
  it("converts absolute path to Claude CLI project hash", () => {
    expect(deriveProjectHash("/Users/aleksi/source/oxveil")).toBe(
      "-Users-aleksi-source-oxveil",
    );
  });

  it("handles paths with many segments", () => {
    expect(deriveProjectHash("/a/b/c/d/e")).toBe("-a-b-c-d-e");
  });

  it("handles macOS private tmp paths", () => {
    expect(deriveProjectHash("/private/tmp/spike")).toBe(
      "-private-tmp-spike",
    );
  });
});

describe("extractLastPlanFilePath", () => {
  it("extracts planFilePath from ExitPlanMode tool input", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "ExitPlanMode",
            input: {
              plan: "# My Plan",
              planFilePath: "/Users/me/.claude/plans/test-plan.md",
            },
          },
        ],
      },
    });
    expect(extractLastPlanFilePath(line)).toBe(
      "/Users/me/.claude/plans/test-plan.md",
    );
  });

  it("returns last planFilePath when multiple ExitPlanMode calls exist", () => {
    const line1 = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "ExitPlanMode",
            input: { planFilePath: "/old-plan.md" },
          },
        ],
      },
    });
    const line2 = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "ExitPlanMode",
            input: { planFilePath: "/new-plan.md" },
          },
        ],
      },
    });
    const content = `${line1}\n${line2}`;
    expect(extractLastPlanFilePath(content)).toBe("/new-plan.md");
  });

  it("returns undefined when no planFilePath exists", () => {
    const content = JSON.stringify({ type: "user", message: "hello" });
    expect(extractLastPlanFilePath(content)).toBeUndefined();
  });

  it("skips invalid JSON lines", () => {
    const validLine = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            input: { planFilePath: "/valid.md" },
          },
        ],
      },
    });
    const content = `not-json\n${validLine}\nalso-not-json`;
    expect(extractLastPlanFilePath(content)).toBe("/valid.md");
  });

  it("returns undefined for empty content", () => {
    expect(extractLastPlanFilePath("")).toBeUndefined();
  });
});

describe("resolveFromSessionData", () => {
  function makeDeps(overrides: Partial<PlanResolverDeps> = {}): PlanResolverDeps {
    return {
      readdir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(""),
      stat: vi.fn().mockResolvedValue({ mtimeMs: 1000 }),
      fileExists: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  function makeJsonlLine(planFilePath: string): string {
    return JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "ExitPlanMode",
            input: { planFilePath },
          },
        ],
      },
    });
  }

  it("returns undefined when project directory does not exist", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockRejectedValue(new Error("ENOENT")),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no JSONL files exist", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["some-dir", "readme.md"]),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toBeUndefined();
  });

  it("filters to .jsonl files only", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["session.jsonl", "subdir", "notes.md"]),
      readFile: vi.fn().mockResolvedValue(makeJsonlLine("/plan.md")),
      stat: vi.fn().mockResolvedValue({ mtimeMs: 1000 }),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toEqual({ planPath: "/plan.md" });
    expect(deps.readFile).toHaveBeenCalledTimes(1);
  });

  it("finds planFilePath in newest JSONL", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["old.jsonl", "new.jsonl"]),
      stat: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("old.jsonl")) return Promise.resolve({ mtimeMs: 100 });
          return Promise.resolve({ mtimeMs: 200 });
        }),
      readFile: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("new.jsonl")) return Promise.resolve(makeJsonlLine("/new-plan.md"));
          return Promise.resolve(makeJsonlLine("/old-plan.md"));
        }),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toEqual({ planPath: "/new-plan.md" });
  });

  it("skips JSONL files without planFilePath", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["no-plan.jsonl", "has-plan.jsonl"]),
      stat: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("no-plan")) return Promise.resolve({ mtimeMs: 200 });
          return Promise.resolve({ mtimeMs: 100 });
        }),
      readFile: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("no-plan")) return Promise.resolve('{"type":"user"}');
          return Promise.resolve(makeJsonlLine("/found.md"));
        }),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toEqual({ planPath: "/found.md" });
  });

  it("verifies plan file exists on disk before returning", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["a.jsonl", "b.jsonl"]),
      stat: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("a.jsonl")) return Promise.resolve({ mtimeMs: 200 });
          return Promise.resolve({ mtimeMs: 100 });
        }),
      readFile: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("a.jsonl")) return Promise.resolve(makeJsonlLine("/deleted.md"));
          return Promise.resolve(makeJsonlLine("/exists.md"));
        }),
      fileExists: vi.fn()
        .mockImplementation((p: string) => Promise.resolve(p === "/exists.md")),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toEqual({ planPath: "/exists.md" });
  });

  it("handles unreadable files gracefully", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["bad.jsonl", "good.jsonl"]),
      stat: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("bad")) return Promise.resolve({ mtimeMs: 200 });
          return Promise.resolve({ mtimeMs: 100 });
        }),
      readFile: vi.fn()
        .mockImplementation((p: string) => {
          if (p.includes("bad")) return Promise.reject(new Error("EACCES"));
          return Promise.resolve(makeJsonlLine("/ok.md"));
        }),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toEqual({ planPath: "/ok.md" });
  });

  it("returns undefined when all plan files are deleted from disk", async () => {
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["a.jsonl"]),
      readFile: vi.fn().mockResolvedValue(makeJsonlLine("/gone.md")),
      fileExists: vi.fn().mockResolvedValue(false),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toBeUndefined();
  });

  it("scans at most 20 files", async () => {
    const files = Array.from({ length: 30 }, (_, i) => `session-${i}.jsonl`);
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(files),
      stat: vi.fn().mockImplementation((p: string) => {
        const idx = parseInt(p.match(/session-(\d+)/)?.[1] ?? "0");
        return Promise.resolve({ mtimeMs: 1000 + idx });
      }),
      readFile: vi.fn().mockResolvedValue('{"type":"user"}'),
    });
    await resolveFromSessionData("/workspace", deps);
    expect(deps.readFile).toHaveBeenCalledTimes(20);
  });

  it("returns last planFilePath from session with multiple ExitPlanMode calls", async () => {
    const content = [
      makeJsonlLine("/first-revision.md"),
      '{"type":"user","message":"revise the plan"}',
      makeJsonlLine("/final-revision.md"),
    ].join("\n");
    const deps = makeDeps({
      readdir: vi.fn().mockResolvedValue(["session.jsonl"]),
      readFile: vi.fn().mockResolvedValue(content),
    });
    const result = await resolveFromSessionData("/workspace", deps);
    expect(result).toEqual({ planPath: "/final-revision.md" });
  });
});
