import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  ViewColumn: { One: 1 },
}));

import {
  ArchiveTimelinePanel,
  type ArchiveTimelineDeps,
} from "../../../views/archiveTimelinePanel";
import type { ProgressState } from "../../../types";
import type { ArchiveMetadata } from "../../../parsers/archive";

function makeProgress(): ProgressState {
  return {
    phases: [
      {
        number: 1,
        title: "Setup",
        status: "completed",
        started: "2025-01-01 10:00:00",
        completed: "2025-01-01 10:02:00",
      },
      {
        number: 2,
        title: "Build",
        status: "completed",
        started: "2025-01-01 10:02:00",
        completed: "2025-01-01 10:05:00",
      },
    ],
    totalPhases: 2,
  };
}

function makeMetadata(): ArchiveMetadata {
  return {
    plan: "Test Plan",
    started: "2025-01-01 10:00:00",
    finished: "2025-01-01 10:05:00",
    status: "completed",
    phasesTotal: 2,
    phasesCompleted: 2,
    phasesFailed: 0,
    claudeloopVersion: "0.4.0",
  };
}

function makeMockPanel() {
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeDeps(mockPanel = makeMockPanel()): ArchiveTimelineDeps {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
  };
}

describe("ArchiveTimelinePanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates webview panel on first reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.archiveTimeline",
      "Timeline: Test Plan",
      1,
      { enableScripts: false, retainContextWhenHidden: false },
    );
  });

  it("renders timeline with header bar", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(mockPanel.webview.html).toContain("Past Run Timeline");
    expect(mockPanel.webview.html).toContain("Test Plan");
    expect(mockPanel.webview.html).toContain("READ-ONLY");
    expect(mockPanel.webview.html).toContain("Setup");
    expect(mockPanel.webview.html).toContain("Build");
  });

  it("does not render NOW line", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(mockPanel.webview.html).not.toContain('class="now-line"');
    expect(mockPanel.webview.html).not.toContain("setInterval");
  });

  it("reuses existing panel for same archive", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it("creates new panel for different archive", () => {
    const mockPanel1 = makeMockPanel();
    const mockPanel2 = makeMockPanel();
    let callCount = 0;
    const deps: ArchiveTimelineDeps = {
      createWebviewPanel: vi.fn(() => {
        callCount++;
        return callCount === 1 ? mockPanel1 : mockPanel2;
      }) as any,
    };
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    panel.reveal("20250102-120000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("removes panel from tracking on dispose", () => {
    const mockPanel = makeMockPanel();
    let disposeCallback: () => void = () => {};
    mockPanel.onDidDispose = vi.fn((cb) => { disposeCallback = cb; });
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    disposeCallback();
    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("uses fallback title when metadata is null", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), null);

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.archiveTimeline",
      "Timeline: 20250101-100000",
      1,
      expect.any(Object),
    );
  });

  it("dispose cleans up all panels", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    panel.dispose();

    expect(mockPanel.dispose).toHaveBeenCalled();
  });
});
