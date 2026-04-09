import { vi } from "vitest";

import type { PlanPreviewPanelDeps, FileSystemWatcher, PlanFileCategory } from "../../../views/planPreviewPanel";

export const VALID_PLAN = `# Plan

## Phase 1: Setup
[status: pending]
Install dependencies

## Phase 2: Build
[status: pending]
**Depends on:** 1
Compile the project
`;

export const INVALID_PLAN = `# Plan

## Phase 1: Setup
[status: pending]
Do stuff

## Phase 1: Duplicate
[status: pending]
Oops duplicate
`;

export const ACTIVE_PLAN_PATH = "/workspace/.claude/plans/typed-hugging-dawn.md";

export function makeMockPanel() {
  let messageHandler: ((msg: any) => void) | undefined;
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((cb) => { messageHandler = cb; }),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
    _simulateMessage(msg: any) { messageHandler?.(msg); },
  };
}

export function makeMockWatcher() {
  const handlers: Record<string, (() => void)[]> = { change: [], create: [], delete: [] };
  return {
    watcher: {
      onDidChange: vi.fn((cb: () => void) => {
        handlers.change.push(cb);
        return { dispose: vi.fn() };
      }),
      onDidCreate: vi.fn((cb: () => void) => {
        handlers.create.push(cb);
        return { dispose: vi.fn() };
      }),
      onDidDelete: vi.fn((cb: () => void) => {
        handlers.delete.push(cb);
        return { dispose: vi.fn() };
      }),
      dispose: vi.fn(),
    } satisfies FileSystemWatcher,
    _fireChange() { handlers.change.forEach(cb => cb()); },
    _fireCreate() { handlers.create.forEach(cb => cb()); },
    _fireDelete() { handlers.delete.forEach(cb => cb()); },
  };
}

export function makeDeps(mockPanel = makeMockPanel()): PlanPreviewPanelDeps & { _panel: ReturnType<typeof makeMockPanel>; _watcher: ReturnType<typeof makeMockWatcher> } {
  const mockWatcher = makeMockWatcher();
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    readFile: vi.fn(async (_path: string) => VALID_PLAN),
    findAllPlanFiles: vi.fn(async () => [{ path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: Date.now() }]),
    onAnnotation: vi.fn(),
    createFileSystemWatcher: vi.fn(() => mockWatcher.watcher),
    statFile: vi.fn(async (_path: string) => ({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 })),
    _panel: mockPanel,
    _watcher: mockWatcher,
  };
}
