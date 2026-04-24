import { escapeHtml } from "../utils/html";
import type { PhaseView, SubStepView } from "./sidebarState";

// --- Phase status icons (codicon classes + text fallbacks) ---

export function phaseStatusIcon(status: string, isStopped: boolean): string {
  if (isStopped && status === "pending") {
    return '<span class="codicon codicon-debug-pause phase-icon stopped"></span>';
  }
  switch (status) {
    case "completed":
      return '<span class="codicon codicon-check phase-icon completed"></span>';
    case "in_progress":
      return '<span class="codicon codicon-sync spin phase-icon running"></span>';
    case "failed":
      return '<span class="codicon codicon-error phase-icon failed"></span>';
    default:
      return '<span class="codicon codicon-circle-outline phase-icon pending"></span>';
  }
}

export function phaseStatusText(status: string): string {
  switch (status) {
    case "completed":
      return "&#10003;";
    case "in_progress":
      return "&#8635;";
    case "failed":
      return "&#10007;";
    default:
      return "&#9675;";
  }
}

export function renderSubSteps(subSteps: SubStepView[] | undefined): string {
  if (!subSteps || subSteps.length === 0) return "";

  const items = subSteps.map((s) => {
    let icon = "";
    let cssClass = "";
    let name = s.name;

    switch (s.status) {
      case "completed":
        icon = '<span class="substep-check">✓</span> ';
        cssClass = "substep-done";
        break;
      case "in_progress":
        cssClass = "substep-active";
        // Add -ing suffix for in_progress
        if (name === "Verify") name = "Verifying";
        else if (name === "Refactor") name = "Refactoring";
        else if (name === "Implement") name = "Implementing";
        break;
      case "failed":
        icon = '<span class="substep-x">✗</span> ';
        cssClass = "substep-failed";
        break;
      default:
        cssClass = "substep-pending";
    }

    const attempts = s.attempts && s.attempts > 1 ? ` (${s.attempts})` : "";
    return `<span class="${cssClass}">${icon}${escapeHtml(name)}${attempts}</span>`;
  });

  return items.join('<span class="substep-arrow"> → </span>');
}

// --- Render helpers ---

export function renderPhaseList(phases: PhaseView[], viewState?: string): string {
  if (phases.length === 0) return "";
  const isStopped = viewState === "stopped";
  // For stopped view: find the first pending phase after completed phases — that's the "paused" one
  let pausedIndex = -1;
  if (isStopped) {
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].status === "pending") {
        pausedIndex = i;
        break;
      }
    }
  }

  const rows = phases.map((p, i) => {
    const num = escapeHtml(String(p.number));
    const title = escapeHtml(p.title);
    const duration = p.duration ? `<span class="phase-duration">${escapeHtml(p.duration)}</span>` : "";
    const attempts = p.attempts ? `<span class="phase-attempts">(attempt ${p.attempts})</span>` : "";
    const isPaused = isStopped && i === pausedIndex;
    const rowClass = [
      "phase-row",
      p.status === "in_progress" ? "active" : "",
      p.status === "completed" ? "done" : "",
      p.status === "failed" ? "error" : "",
      isPaused ? "paused" : "",
      p.status === "pending" && !isPaused ? "dim" : "",
    ].filter(Boolean).join(" ");

    const meta = (attempts || duration)
      ? `<div class="phase-meta">${attempts}${duration}</div>`
      : "";

    // Sub-steps line
    const subStepsHtml = renderSubSteps(p.subSteps);
    const subStepsDiv = subStepsHtml
      ? `<div class="phase-substeps">${subStepsHtml}</div>`
      : "";

    return `<div class="${rowClass}" data-phase="${num}">
  ${phaseStatusIcon(p.status, isPaused)}
  <span class="phase-num">${num}.</span>
  <div class="phase-body">
    <span class="phase-title">${title}</span>
    ${subStepsDiv}
    ${meta}
  </div>
</div>`;
  });

  return `<div id="phase-list" class="phase-list">${rows.join("\n")}</div>`;
}
