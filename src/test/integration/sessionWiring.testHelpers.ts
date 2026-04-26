import type { SidebarMutableState } from "../../activateSidebar";

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
