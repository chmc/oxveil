import { describe, it, expect } from "vitest";
import { ArchiveTreeProvider } from "../../../views/archiveTree";
import type { ArchiveEntry, ArchiveMetadata } from "../../../parsers/archive";

function makeEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    name: "20260322-090000",
    label: "ai-parsed-plan.md",
    timestamp: "2026-03-22 09:00:00",
    metadata: {
      plan: "ai-parsed-plan.md",
      started: "2026-03-22 09:00:00",
      finished: "2026-03-22 09:45:00",
      status: "completed",
      phasesTotal: 4,
      phasesCompleted: 4,
      phasesFailed: 0,
      claudeloopVersion: "0.22.0",
    },
    ...overrides,
  };
}

describe("ArchiveTreeProvider", () => {
  it("shows empty state when no entries", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([]);
    const items = provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("No past runs");
    expect(items[0].description).toContain("Completed sessions");
  });

  it("renders completed entry with check icon", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([makeEntry()]);
    const items = provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("ai-parsed-plan.md");
    expect(items[0].iconId).toBe("check");
    expect(items[0].iconColor).toBe("testing.iconPassed");
    expect(items[0].contextValue).toBe("archive");
    expect(items[0].archiveName).toBe("20260322-090000");
  });

  it("renders failed entry with error icon", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([
      makeEntry({
        metadata: {
          plan: "plan.md",
          started: "2026-03-23 15:15:00",
          finished: "2026-03-23 16:02:00",
          status: "failed",
          phasesTotal: 5,
          phasesCompleted: 3,
          phasesFailed: 1,
          claudeloopVersion: "0.22.1",
        },
      }),
    ]);
    const items = provider.getChildren();

    expect(items[0].iconId).toBe("error");
    expect(items[0].iconColor).toBe("testing.iconFailed");
  });

  it("renders unknown status entry with warning icon", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([makeEntry({ metadata: null, label: "20260322-090000" })]);
    const items = provider.getChildren();

    expect(items[0].iconId).toBe("warning");
    expect(items[0].iconColor).toBe("problemsWarningIcon.foreground");
  });

  it("builds description with date, phases, duration, status", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([makeEntry()]);
    const items = provider.getChildren();

    expect(items[0].description).toBe("Mar 22 · 4 phases · 45m · completed");
  });

  it("shows dir name and unknown for entries without metadata", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([
      makeEntry({ metadata: null, name: "20260322-090000", label: "20260322-090000" }),
    ]);
    const items = provider.getChildren();

    expect(items[0].description).toBe("20260322-090000 · unknown");
  });

  it("renders multiple entries in order", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([
      makeEntry({ name: "20260324-103200", label: "plan-a.md" }),
      makeEntry({ name: "20260323-151500", label: "plan-b.md" }),
      makeEntry({ name: "20260322-090000", label: "plan-c.md" }),
    ]);
    const items = provider.getChildren();

    expect(items).toHaveLength(3);
    expect(items[0].label).toBe("plan-a.md");
    expect(items[1].label).toBe("plan-b.md");
    expect(items[2].label).toBe("plan-c.md");
  });

  it("updates entries and re-renders", () => {
    const provider = new ArchiveTreeProvider();
    provider.update([]);
    expect(provider.getChildren()).toHaveLength(1); // empty state

    provider.update([makeEntry()]);
    expect(provider.getChildren()).toHaveLength(1); // one real entry
    expect(provider.getChildren()[0].label).toBe("ai-parsed-plan.md");
  });
});
