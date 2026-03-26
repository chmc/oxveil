import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseArchive,
  extractTimestamp,
  computeDuration,
  formatDate,
  _parseMetadataForTest as parseMetadata,
  type ArchiveParseDeps,
} from "../../../parsers/archive";

const fixturesDir = join(__dirname, "../../../../test/fixtures");

function makeDeps(
  files: Record<string, string>,
  dirs: Set<string> = new Set(),
): ArchiveParseDeps {
  return {
    readdir: vi.fn(async (dir: string) => {
      const entries = Object.keys(files)
        .map((f) => {
          const rel = f.startsWith(dir + "/") ? f.slice(dir.length + 1) : null;
          if (!rel) return null;
          const first = rel.split("/")[0];
          return first;
        })
        .filter((f): f is string => f !== null);
      return [...new Set(entries)];
    }),
    readFile: vi.fn(async (path: string) => {
      if (path in files) return files[path];
      throw new Error(`ENOENT: ${path}`);
    }),
    isDirectory: vi.fn(async (path: string) => dirs.has(path)),
  };
}

function readFixtureMetadata(name: string): string {
  return readFileSync(join(fixturesDir, "mock-archive", name, "metadata.txt"), "utf-8");
}

describe("parseMetadata", () => {
  it("parses well-formed metadata.txt", () => {
    const content = readFixtureMetadata("20260322-090000");
    const result = parseMetadata(content);

    expect(result).not.toBeNull();
    expect(result!.plan).toBe("ai-parsed-plan.md");
    expect(result!.started).toBe("2026-03-22 09:00:00");
    expect(result!.finished).toBe("2026-03-22 09:45:00");
    expect(result!.status).toBe("completed");
    expect(result!.phasesTotal).toBe(4);
    expect(result!.phasesCompleted).toBe(4);
    expect(result!.phasesFailed).toBe(0);
    expect(result!.claudeloopVersion).toBe("0.22.0");
  });

  it("parses failed metadata", () => {
    const content = readFixtureMetadata("20260323-151500");
    const result = parseMetadata(content);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
    expect(result!.phasesTotal).toBe(5);
    expect(result!.phasesCompleted).toBe(3);
    expect(result!.phasesFailed).toBe(1);
  });

  it("returns null when required fields are missing", () => {
    const result = parseMetadata("plan=test.md\nstarted=2026-01-01");
    expect(result).toBeNull();
  });

  it("handles missing optional fields gracefully", () => {
    const content = "plan=test.md\nstarted=2026-01-01 00:00:00\nfinished=2026-01-01 01:00:00\nstatus=completed";
    const result = parseMetadata(content);

    expect(result).not.toBeNull();
    expect(result!.phasesTotal).toBe(0);
    expect(result!.claudeloopVersion).toBe("unknown");
  });

  it("ignores lines without =", () => {
    const content = "plan=test.md\nbadline\nstarted=2026-01-01 00:00:00\nfinished=2026-01-01 01:00:00\nstatus=completed";
    const result = parseMetadata(content);
    expect(result).not.toBeNull();
    expect(result!.plan).toBe("test.md");
  });
});

describe("extractTimestamp", () => {
  it("converts YYYYMMDD-HHMMSS to readable format", () => {
    expect(extractTimestamp("20260322-090000")).toBe("2026-03-22 09:00");
  });

  it("returns input when format doesn't match", () => {
    expect(extractTimestamp("random-dir")).toBe("random-dir");
  });
});

describe("computeDuration", () => {
  it("computes minutes", () => {
    expect(computeDuration("2026-03-22 09:00:00", "2026-03-22 09:45:00")).toBe("45m");
  });

  it("computes hours and minutes", () => {
    expect(computeDuration("2026-03-24 10:32:00", "2026-03-24 12:15:00")).toBe("1h 43m");
  });

  it("returns <1m for very short durations", () => {
    expect(computeDuration("2026-03-22 09:00:00", "2026-03-22 09:00:30")).toBe("1m");
  });

  it("returns empty for invalid dates", () => {
    expect(computeDuration("invalid", "also-invalid")).toBe("");
  });
});

describe("formatDate", () => {
  it("formats date as short month + day", () => {
    expect(formatDate("2026-03-22 09:00:00")).toBe("Mar 22");
  });

  it("returns input for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("parseArchive", () => {
  it("parses fixture archive with three entries", async () => {
    const archiveRoot = join(fixturesDir, "mock-archive");
    const { readFileSync: rfs } = await import("node:fs");
    const { statSync } = await import("node:fs");
    const { readdirSync } = await import("node:fs");

    const deps: ArchiveParseDeps = {
      readdir: async (dir) => readdirSync(dir, { encoding: "utf-8" }),
      readFile: async (p) => rfs(p, "utf-8"),
      isDirectory: async (p) => statSync(p).isDirectory(),
    };

    const entries = await parseArchive(deps, archiveRoot);

    expect(entries).toHaveLength(3);
    // Sorted descending by timestamp — newest first
    expect(entries[0].name).toBe("20260324-103200");
    expect(entries[1].name).toBe("20260323-151500");
    expect(entries[2].name).toBe("20260322-090000");
  });

  it("returns label from plan field in metadata", async () => {
    const archiveRoot = "/archive";
    const deps = makeDeps(
      {
        "/archive/20260322-090000/metadata.txt":
          "plan=my-plan.md\nstarted=2026-03-22 09:00:00\nfinished=2026-03-22 09:45:00\nstatus=completed",
      },
      new Set(["/archive/20260322-090000"]),
    );

    const entries = await parseArchive(deps, archiveRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("my-plan.md");
  });

  it("falls back to directory name when metadata.txt is missing", async () => {
    const archiveRoot = "/archive";
    const deps = makeDeps({}, new Set(["/archive/20260322-090000"]));
    // readdir returns the dir, but readFile will throw
    deps.readdir = vi.fn(async () => ["20260322-090000"]);

    const entries = await parseArchive(deps, archiveRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("20260322-090000");
    expect(entries[0].metadata).toBeNull();
  });

  it("returns empty array when archive directory does not exist", async () => {
    const deps: ArchiveParseDeps = {
      readdir: vi.fn(async () => { throw new Error("ENOENT"); }),
      readFile: vi.fn(async () => ""),
      isDirectory: vi.fn(async () => false),
    };

    const entries = await parseArchive(deps, "/nonexistent");
    expect(entries).toEqual([]);
  });

  it("returns empty array for empty archive directory", async () => {
    const deps: ArchiveParseDeps = {
      readdir: vi.fn(async () => []),
      readFile: vi.fn(async () => ""),
      isDirectory: vi.fn(async () => false),
    };

    const entries = await parseArchive(deps, "/archive");
    expect(entries).toEqual([]);
  });

  it("sorts entries descending by timestamp", async () => {
    const archiveRoot = "/archive";
    const meta = (started: string) =>
      `plan=p.md\nstarted=${started}\nfinished=${started}\nstatus=completed`;
    const deps = makeDeps(
      {
        "/archive/a/metadata.txt": meta("2026-03-20 08:00:00"),
        "/archive/b/metadata.txt": meta("2026-03-25 12:00:00"),
        "/archive/c/metadata.txt": meta("2026-03-22 10:00:00"),
      },
      new Set(["/archive/a", "/archive/b", "/archive/c"]),
    );
    deps.readdir = vi.fn(async () => ["a", "b", "c"]);

    const entries = await parseArchive(deps, archiveRoot);
    expect(entries.map((e) => e.name)).toEqual(["b", "c", "a"]);
  });

  it("skips non-directory entries", async () => {
    const archiveRoot = "/archive";
    const deps: ArchiveParseDeps = {
      readdir: vi.fn(async () => ["somefile.txt", "adir"]),
      readFile: vi.fn(async (p) => {
        if (p === "/archive/adir/metadata.txt") {
          return "plan=p.md\nstarted=2026-01-01 00:00:00\nfinished=2026-01-01 01:00:00\nstatus=completed";
        }
        throw new Error("ENOENT");
      }),
      isDirectory: vi.fn(async (p) => p === "/archive/adir"),
    };

    const entries = await parseArchive(deps, archiveRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("adir");
  });
});
