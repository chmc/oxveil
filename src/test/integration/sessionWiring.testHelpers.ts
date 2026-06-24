import { vi } from "vitest";
import type { SessionState } from "../../core/sessionState";
import { SidebarMutableState } from "../../core/sidebarMutableState";
import type { SessionWiringDeps } from "../../sessionWiring";
import type { SidebarState } from "../../views/sidebarState";
import { deriveViewState } from "../../views/sidebarState";

export function makeMutableState(): SidebarMutableState {
  return new SidebarMutableState({ detectionStatus: "detected" });
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
    notifications: { onPhasesChanged: vi.fn(), reset: vi.fn(), onSessionFailed: vi.fn() },
    elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
    isActiveSession: () => true,
    folderUri: "file:///test",
    buildSidebarState: makeBuildFullState(session, ms),
    sidebarMutableState: ms,
    getConfig: (key: string) => (key === "selfImprovement" ? true : undefined),
    ...overrides,
  };
}
