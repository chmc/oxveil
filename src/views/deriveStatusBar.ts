import type { StatusBarState, ProgressState } from "../types";
import type { SidebarView } from "./sidebarState";

/**
 * Maps a sidebar view state to the corresponding status bar state.
 * Used when the session is idle or on startup to reflect orphan progress.
 */
export function deriveStatusBarFromView(
  view: SidebarView,
  progress: ProgressState | undefined,
  folderName?: string,
  otherRootsSummary?: string,
): StatusBarState {
  switch (view) {
    case "not-found":
      return { kind: "not-found" };

    case "ready":
      return { kind: "ready" };

    case "stopped":
      return { kind: "stopped", folderName, otherRootsSummary };

    case "failed": {
      const fp = progress?.phases.find((p) => p.status === "failed");
      return {
        kind: "failed",
        failedPhase: (fp?.number as number) ?? 0,
        folderName,
        otherRootsSummary,
      };
    }

    case "completed":
      return { kind: "done", elapsed: "—", folderName, otherRootsSummary };

    default:
      return { kind: "idle" };
  }
}
