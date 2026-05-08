import { escapeHtml } from "../utils/html";
import type { SidebarState, ArchiveView, SidebarView } from "./sidebarState";
import type { Provider } from "../types";

export function renderProviderBadge(provider: Provider | undefined): string {
  if (!provider) return "";
  const label = provider === "opencode" ? "OpenCode" : "Claude";
  const cls = provider === "opencode" ? "badge provider opencode" : "badge provider";
  return `<span class="${cls}" title="Provider: ${label}" aria-label="Provider: ${label}">${label}</span>`;
}

export function renderActionBar(buttons: Array<{ label: string; command: string; primary?: boolean; phase?: number; archive?: string }>): string {
  const btns = buttons.map((b) => {
    const cls = b.primary ? "action-btn primary" : "action-btn";
    const phaseAttr = b.phase != null ? ` data-phase="${b.phase}"` : "";
    const archiveAttr = b.archive ? ` data-archive="${escapeHtml(b.archive)}"` : "";
    return `<button class="${cls}" data-command="${escapeHtml(b.command)}"${phaseAttr}${archiveAttr}>${escapeHtml(b.label)}</button>`;
  });
  return `<div class="action-bar">${btns.join("\n")}</div>`;
}

export function renderSelfImprovementStatus(state: SidebarState, view: SidebarView): string {
  if (state.selfImprovement?.enabled) {
    const lessonsHtml = (view === "completed" || view === "self-improvement")
      ? `<div class="lessons-info">${state.selfImprovement.lessonsAvailable ? "💡 Lessons captured" : "📝 No lessons available"}</div>`
      : "";
    return `<div class="self-improvement-status">
  <span class="label">Self-improvement:</span>
  <span class="badge on">On</span>
  ${lessonsHtml}
</div>`;
  }
  return `<div class="self-improvement-status">
  <span class="label">Self-improvement:</span>
  <span class="badge off">Off</span>
  <a href="command:workbench.action.openSettings?%5B%22oxveil.selfImprovement%22%5D">Enable</a>
</div>`;
}

export function renderArchives(archives: ArchiveView[]): string {
  if (!archives || archives.length === 0) return "";

  const entries = archives.map((a) => {
    const label = escapeHtml(a.label);
    const date = escapeHtml(a.date);
    const duration = a.duration ? escapeHtml(a.duration) : "";
    const statusIcon = a.status === "completed" ? "&#10003;" : a.status === "failed" ? "&#10007;" : "&#9888;";
    const statusClass = a.status;
    return `<div class="archive-entry" data-archive="${escapeHtml(a.name)}">
  <span class="archive-status ${statusClass}">${statusIcon}</span>
  <span class="archive-label">${label}</span>
  <span class="archive-meta">${date}${a.phaseCount ? ` &middot; ${a.phaseCount} phases` : ""}${duration ? ` &middot; ${duration}` : ""}</span>
</div>`;
  });

  return `<div class="archives-section">
  <h3 class="archives-title">Recent Runs</h3>
  ${entries.join("\n")}
</div>`;
}
