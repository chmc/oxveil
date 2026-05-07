import type { StatusBarState, ProgressState, Provider } from "../types";
import type { SidebarView } from "./sidebarState";

export function deriveStatusBarFromView(
  view: SidebarView,
  progress: ProgressState | undefined,
  folderName?: string,
  otherRootsSummary?: string,
  provider?: Provider,
): StatusBarState {
  switch (view) {
    case "not-found":
      return { kind: "not-found" };

    case "ready":
      return provider ? { kind: "ready", provider } : { kind: "ready" };

    case "stopped":
      return provider
        ? { kind: "stopped", folderName, otherRootsSummary, provider }
        : { kind: "stopped", folderName, otherRootsSummary };

    case "failed": {
      const fp = progress?.phases.find((p) => p.status === "failed");
      return provider
        ? { kind: "failed", failedPhase: (fp?.number as number) ?? 0, folderName, otherRootsSummary, provider }
        : { kind: "failed", failedPhase: (fp?.number as number) ?? 0, folderName, otherRootsSummary };
    }

    case "completed":
      return provider
        ? { kind: "done", elapsed: "—", folderName, otherRootsSummary, provider }
        : { kind: "done", elapsed: "—", folderName, otherRootsSummary };

    default:
      return provider ? { kind: "idle", provider } : { kind: "idle" };
  }
}
