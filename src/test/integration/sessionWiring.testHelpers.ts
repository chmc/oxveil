import { vi } from "vitest";
import type { SessionState } from "../../core/sessionState";
import type { SidebarMutableState } from "../../activateSidebar";
import type { SessionWiringDeps } from "../../sessionWiring";
import type { SidebarState } from "../../views/sidebarState";
import { deriveViewState } from "../../views/sidebarState";

export function makeMutableState(): SidebarMutableState {
  return {
    detectionStatus: "detected",
    planDetected: false,
    planUserChoice: "none",
    cachedPlanPhases: [],
    cost: 0,
    todoDone: 0,
    todoTotal: 0,
    selfImprovementActive: false,
  };
}

export function makeBuildFullState(session: SessionState, ms: SidebarMutableState) {
  return function (): SidebarState {
    const view = deriveViewState(
      ms.detectionStatus,
      session.status,
      ms.planDetected,
      session.progress,
      ms.planUserChoice,
      ms.selfImprovementActive,
    );
    return { view, archives: [] };
  };
}

export function makeSessionDeps(
  session: SessionState,
  ms: SidebarMutableState,
  overrides?: Partial<SessionWiringDeps>,
): SessionWiringDeps {
  return {
    session,
    statusBar: { update: vi.fn(), dispose: vi.fn() },
    notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
    elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
    isActiveSession: () => true,
    folderUri: "file:///test",
    buildSidebarState: makeBuildFullState(session, ms),
    sidebarMutableState: ms,
    getConfig: (key: string) => (key === "selfImprovement" ? true : undefined),
    ...overrides,
  };
}
