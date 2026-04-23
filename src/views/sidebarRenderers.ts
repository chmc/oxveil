import { escapeHtml } from "../utils/html";
import type { SidebarState, ArchiveView } from "./sidebarState";
import { renderPhaseList } from "./sidebarPhaseHelpers";

function renderActionBar(buttons: Array<{ label: string; command: string; primary?: boolean; phase?: number; archive?: string }>): string {
  const btns = buttons.map((b) => {
    const cls = b.primary ? "action-btn primary" : "action-btn";
    const phaseAttr = b.phase != null ? ` data-phase="${b.phase}"` : "";
    const archiveAttr = b.archive ? ` data-archive="${escapeHtml(b.archive)}"` : "";
    return `<button class="${cls}" data-command="${escapeHtml(b.command)}"${phaseAttr}${archiveAttr}>${escapeHtml(b.label)}</button>`;
  });
  return `<div class="action-bar">${btns.join("\n")}</div>`;
}

function renderNotFound(state: SidebarState): string {
  const isVersionIssue = state.notFoundReason === "version-incompatible";
  const message = isVersionIssue
    ? "The installed version of claudeloop is not compatible. Please update to the latest version."
    : "claudeloop is required to run plans. Install it to get started.";
  return `<div class="centered-layout">
  <div class="state-icon"><span class="codicon codicon-warning"></span></div>
  <h2 class="state-title">claudeloop not found</h2>
  <p class="state-desc">${message}</p>
  ${renderActionBar([
    { label: "Install", command: "install", primary: true },
  ])}
  <a class="link-action" data-command="setPath">Set custom path...</a>
</div>`;
}

function renderEmpty(state: SidebarState): string {
  const archivesHtml = renderArchives(state.archives);
  return `<div class="centered-layout">
  <div class="state-icon"><span class="codicon codicon-comment-discussion"></span></div>
  <h2 class="state-title">From Idea to Reality</h2>
  <p class="state-desc">Tell AI what you're thinking. It'll help you refine it, plan it, and build it.</p>
  ${renderActionBar([
    { label: "Let's Go", command: "createPlan", primary: true },
  ])}
  <div class="how-it-works">
    <h3>How it works</h3>
    <ol>
      <li>Tell AI what you're thinking</li>
      <li>Together, shape it into a plan</li>
      <li>Review and let AI build it</li>
    </ol>
  </div>
  <div class="quick-actions">
    <button class="action-btn" data-command="writePlan">Write Plan</button>
    <button class="action-btn" data-command="aiParse">AI Parse</button>
    <button class="action-btn" data-command="formPlan">Form Plan</button>
  </div>
</div>
${archivesHtml}`;
}

function renderReady(state: SidebarState): string {
  const plan = state.plan!;
  const filename = escapeHtml(plan.filename);
  const archivesHtml = renderArchives(state.archives);
  return `<div class="card">
  <div class="card-header">
    <span class="plan-filename">${filename}</span>
    <span class="badge ready">Ready</span>
  </div>
  ${renderPhaseList(plan.phases)}
  ${renderActionBar([
    { label: "Start", command: "start", primary: true },
  ])}
  <div class="link-actions">
    <a class="link-action" data-command="editPlan">Edit</a>
    <a class="link-action" data-command="discardPlan">Discard</a>
  </div>
</div>
${archivesHtml}`;
}

function renderStale(state: SidebarState): string {
  const plan = state.plan!;
  const filename = escapeHtml(plan.filename);
  const archivesHtml = renderArchives(state.archives);
  return `<div class="card">
  <div class="card-header">
    <span class="plan-filename">${filename}</span>
    <span class="badge stale">Found</span>
  </div>
  <p class="state-desc">A plan file was found. Is this your current work?</p>
  ${renderActionBar([
    { label: "Resume", command: "resumePlan", primary: true },
    { label: "Dismiss", command: "dismissPlan" },
  ])}
</div>
${archivesHtml}`;
}

function renderRunning(state: SidebarState): string {
  const plan = state.plan!;
  const session = state.session;
  const filename = escapeHtml(plan.filename);
  const completed = plan.phases.filter((p) => p.status === "completed").length;
  const total = plan.phases.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const elapsed = session?.elapsed ? escapeHtml(session.elapsed) : "";
  const cost = session?.cost ? escapeHtml(session.cost) : "";
  const attemptInfo = session?.attemptCount && session.attemptCount > 1
    ? `<span class="info-item">attempt ${session.attemptCount}${session.maxRetries ? `/${session.maxRetries}` : ""}</span>`
    : "";
  const todoInfo = session?.todos
    ? `<span class="info-item">${session.todos.done}/${session.todos.total} todos</span>`
    : "";

  return `<div class="card">
  <div class="card-header">
    <span class="plan-filename">${filename}</span>
    <span class="badge running">Running</span>
  </div>
  <div id="progress-bar" class="progress-bar"><div class="progress-fill running" style="width: ${pct}%;"></div></div>
  <div id="info-bar" class="info-bar">
    ${elapsed ? `<span class="info-item">${elapsed}</span>` : ""}
    ${cost ? `<span class="info-item">${cost}</span>` : ""}
    ${todoInfo}
    ${attemptInfo}
  </div>
  ${renderPhaseList(plan.phases, "running")}
  ${renderActionBar([
    { label: "Stop", command: "stop", primary: true },
  ])}
</div>`;
}

function renderStopped(state: SidebarState): string {
  const plan = state.plan!;
  const filename = escapeHtml(plan.filename);
  const completed = plan.phases.filter((p) => p.status === "completed").length;
  const total = plan.phases.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  // Find first pending phase for resume target
  const nextPhase = plan.phases.find((p) => p.status === "pending");
  const resumePhase = nextPhase ? Number(nextPhase.number) : 1;
  const archivesHtml = renderArchives(state.archives);

  return `<div class="card">
  <div class="card-header">
    <span class="plan-filename">${filename}</span>
    <span class="badge stopped">Stopped</span>
  </div>
  <div class="progress-bar"><div class="progress-fill stopped" style="width: ${pct}%;"></div></div>
  ${renderPhaseList(plan.phases, "stopped")}
  ${renderActionBar([
    { label: "Resume", command: "resume", primary: true, phase: resumePhase },
    { label: "Restart", command: "restart" },
  ])}
</div>
${archivesHtml}`;
}

function renderFailed(state: SidebarState): string {
  const plan = state.plan!;
  const session = state.session;
  const filename = escapeHtml(plan.filename);
  const completed = plan.phases.filter((p) => p.status === "completed").length;
  const total = plan.phases.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failedPhase = plan.phases.find((p) => p.status === "failed");
  const failedNum = failedPhase ? Number(failedPhase.number) : 1;

  const errorHtml = session?.errorSnippet
    ? `<div class="error-snippet"><code>${escapeHtml(session.errorSnippet)}</code></div>`
    : "";
  const archivesHtml = renderArchives(state.archives);

  return `<div class="card">
  <div class="card-header">
    <span class="plan-filename">${filename}</span>
    <span class="badge failed">Failed</span>
  </div>
  <div class="progress-bar"><div class="progress-fill failed" style="width: ${pct}%;"></div></div>
  ${errorHtml}
  ${renderPhaseList(plan.phases, "failed")}
  ${renderActionBar([
    { label: "Retry", command: "retry", primary: true, phase: failedNum },
    { label: "Skip", command: "skip", phase: failedNum },
  ])}
</div>
${archivesHtml}`;
}

function renderCompleted(state: SidebarState): string {
  const plan = state.plan!;
  const session = state.session;
  const filename = escapeHtml(plan.filename);
  const phaseCount = plan.phases.length;
  const elapsed = session?.elapsed ? escapeHtml(session.elapsed) : "";
  const cost = session?.cost ? escapeHtml(session.cost) : "";
  const archivesHtml = renderArchives(state.archives);

  return `<div class="card">
  <div class="card-header">
    <span class="plan-filename">${filename}</span>
    <span class="badge completed">Completed</span>
  </div>
  <div class="success-banner">
    <span class="codicon codicon-check"></span>
    <span>All ${phaseCount} phases completed</span>
  </div>
  <div class="summary">
    ${elapsed ? `<span class="summary-item">${elapsed}</span>` : ""}
    ${cost ? `<span class="summary-item">${cost}</span>` : ""}
  </div>
  ${renderPhaseList(plan.phases, "completed")}
  <div class="whats-next">
    <h3>What's next?</h3>
    ${renderActionBar([
      ...(state.archives[0] ? [{ label: "Replay", command: "openReplay", primary: true, archive: state.archives[0].name }] : []),
      { label: "Create New Plan", command: "createPlan" },
    ])}
  </div>
</div>
${archivesHtml}`;
}

function renderPlanning(state: SidebarState): string {
  const archivesHtml = renderArchives(state.archives);
  return `<div class="centered-layout">
  <div class="state-icon"><span class="codicon codicon-sync spin"></span></div>
  <h2 class="state-title">Shaping Your Plan</h2>
  <p class="state-desc">Chat with AI to refine your idea. When you're ready, form it into an executable plan.</p>
  <div class="info-bar">
    <span class="info-item">Plan chat active</span>
  </div>
  ${renderActionBar([
    { label: "Form Plan", command: "formPlan", primary: true },
  ])}
  <div class="link-actions">
    <a class="link-action" data-command="focusChat">Focus Chat</a>
    <a class="link-action" data-command="showPlanPreview">Show Plan Preview</a>
  </div>
</div>
${archivesHtml}`;
}

function renderArchives(archives: ArchiveView[]): string {
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

export function renderBody(state?: SidebarState): string {
  if (!state) {
    return `<div class="centered-layout">
  <div class="spinner-container"><span class="codicon codicon-sync spin"></span></div>
  <p class="state-desc">Initializing...</p>
</div>`;
  }

  switch (state.view) {
    case "not-found":
      return renderNotFound(state);
    case "empty":
      return renderEmpty(state);
    case "planning":
      return renderPlanning(state);
    case "ready":
      return renderReady(state);
    case "stale":
      return renderStale(state);
    case "running":
      return renderRunning(state);
    case "stopped":
      return renderStopped(state);
    case "failed":
      return renderFailed(state);
    case "completed":
      return renderCompleted(state);
    default:
      return "";
  }
}
