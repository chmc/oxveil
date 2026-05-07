import { describe, it, expect, vi, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";

// Capture deps passed to PlanPreviewPanel
let capturedFindAllPlanFiles: (() => Promise<any[]>) | undefined;

vi.mock("../../views/planPreviewPanel", () => ({
  PlanPreviewPanel: vi.fn().mockImplementation((deps: any) => {
    capturedFindAllPlanFiles = deps.findAllPlanFiles;
    return {
      startWatching: vi.fn(),
      onFileChanged: vi.fn(),
      endSession: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

vi.mock("../../views/dependencyGraph", () => ({ DependencyGraphPanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/executionTimeline", () => ({ ExecutionTimelinePanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/configWizard", () => ({ ConfigWizardPanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/replayViewer", () => ({ ReplayViewerPanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/selfImprovementPanel", () => ({ SelfImprovementPanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/archiveTimelinePanel", () => ({ ArchiveTimelinePanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/liveRunPanel", () => ({ LiveRunPanel: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/diffProvider", () => ({ PhaseDiffProvider: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })), DIFF_URI_SCHEME: "diff" }));
vi.mock("../../views/planCodeLens", () => ({ PlanCodeLensProvider: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock("../../views/archiveTree", () => ({ ArchiveTreeProvider: vi.fn().mockImplementation(() => ({ getEntries: vi.fn(() => []) })) }));
vi.mock("../../parsers/archive", () => ({ parseArchive: vi.fn() }));
vi.mock("../../core/planResolver", () => ({ resolveFromSessionData: vi.fn() }));
vi.mock("../../core/paths", () => ({ getPlanPath: vi.fn() }));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ mtimeMs: 1000, birthtimeMs: 1000 }),
}));

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
  },
  window: {
    createWebviewPanel: vi.fn(),
    registerFileDecorationProvider: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  commands: { executeCommand: vi.fn(), registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
  languages: { registerCodeLensProvider: vi.fn(() => ({ dispose: vi.fn() })) },
  EventEmitter: vi.fn().mockImplementation(() => ({ event: vi.fn(), fire: vi.fn(), dispose: vi.fn() })),
  Uri: { file: vi.fn((p: string) => ({ fsPath: p })) },
  RelativePattern: vi.fn(),
}));

import { createWebviewPanels } from "../../activateViews";
import { readdir } from "node:fs/promises";

describe("createWebviewPanels - findAllPlanFiles", () => {
  const WORKSPACE = "/fake/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
    capturedFindAllPlanFiles = undefined;

    createWebviewPanels({
      session: { status: "idle" } as any,
      workspaceRoot: WORKSPACE,
      gitExec: undefined,
    });
  });

  it("includes workspace .claude/plans/ in search sources", async () => {
    expect(capturedFindAllPlanFiles).toBeDefined();

    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir === path.join(WORKSPACE, ".claude", "plans")) return ["my-plan.md"] as any;
      return [] as any;
    });

    const results = await capturedFindAllPlanFiles!();
    const paths = results.map((r: any) => r.path);
    expect(paths).toContain(path.join(WORKSPACE, ".claude", "plans", "my-plan.md"));
  });

  it("home .claude/plans/ files are excluded when home dir returns no files", async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir === path.join(WORKSPACE, ".claude", "plans")) return ["my-plan.md"] as any;
      return [] as any;
    });

    const results = await capturedFindAllPlanFiles!();
    const paths = results.map((r: any) => r.path);
    const homeEntry = path.join(os.homedir(), ".claude", "plans", "my-plan.md");
    expect(paths).not.toContain(homeEntry);
    expect(paths).toContain(path.join(WORKSPACE, ".claude", "plans", "my-plan.md"));
  });

  it("workspace .claude/plans/ files have category 'plan'", async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir === path.join(WORKSPACE, ".claude", "plans")) return ["my-plan.md"] as any;
      return [] as any;
    });

    const results = await capturedFindAllPlanFiles!();
    expect(results[0].category).toBe("plan");
  });
});
