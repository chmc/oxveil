import { escapeHtml } from "../utils/html";
import type {
  SidebarState,
  PhaseView,
  ArchiveView,
} from "./sidebarState";

// --- Phase status icons (codicon classes + text fallbacks) ---

function phaseStatusIcon(status: string, isStopped: boolean): string {
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

function phaseStatusText(status: string): string {
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

// --- Render helpers ---

function renderPhaseList(phases: PhaseView[], viewState?: string): string {
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

    return `<div class="${rowClass}" data-phase="${num}">
  ${phaseStatusIcon(p.status, isPaused)}
  <span class="phase-num">${num}.</span>
  <span class="phase-title">${title}</span>
  ${attempts}
  ${duration}
</div>`;
  });

  return `<div id="phase-list" class="phase-list">${rows.join("\n")}</div>`;
}

function renderActionBar(buttons: Array<{ label: string; command: string; primary?: boolean; phase?: number }>): string {
  const btns = buttons.map((b) => {
    const cls = b.primary ? "action-btn primary" : "action-btn";
    const phaseAttr = b.phase != null ? ` data-phase="${b.phase}"` : "";
    return `<button class="${cls}" data-command="${escapeHtml(b.command)}"${phaseAttr}>${escapeHtml(b.label)}</button>`;
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
  <h2 class="state-title">Create a Plan</h2>
  <p class="state-desc">Describe your project and let AI draft the phases.</p>
  ${renderActionBar([
    { label: "Create Plan", command: "createPlan", primary: true },
  ])}
  <div class="how-it-works">
    <h3>How it works</h3>
    <ol>
      <li>Describe your project to Claude in a chat</li>
      <li>Claude drafts a plan with phases</li>
      <li>Review, configure, and run</li>
    </ol>
  </div>
  <div class="quick-actions">
    <button class="action-btn" data-command="writePlan">Write Plan</button>
    <button class="action-btn" data-command="aiParse">AI Parse</button>
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
    { label: "AI Parse", command: "aiParse" },
    { label: "Chat", command: "planChat" },
  ])}
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
      { label: "Replay", command: "openReplay", primary: true },
      { label: "Create New Plan", command: "createPlan" },
    ])}
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

function renderBody(state?: SidebarState): string {
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

// --- Main export ---

export function renderSidebar(nonce: string, cspSource: string, state?: SidebarState): string {
  const bodyHtml = renderBody(state);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground, #ccc);
      padding: 0;
    }

    /* Layout */
    .centered-layout { text-align: center; padding: 24px 16px; }
    .state-icon { font-size: 32px; margin-bottom: 12px; opacity: 0.7; }
    .state-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; color: var(--vscode-foreground); }
    .state-desc { font-size: 12px; color: var(--vscode-descriptionForeground, #888); line-height: 1.5; margin-bottom: 12px; }

    /* Card */
    .card {
      margin: 8px;
      padding: 12px;
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .plan-filename {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }

    /* Badges */
    .badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }
    .badge.ready { background: var(--vscode-testing-iconPassed, #4ec9b0); color: #fff; }
    .badge.running { background: var(--vscode-progressBar-background, #0e639c); color: #fff; }
    .badge.stopped { background: var(--vscode-editorWarning-foreground, #cca700); color: #000; }
    .badge.failed { background: var(--vscode-errorForeground, #f44747); color: #fff; }
    .badge.completed { background: var(--vscode-testing-iconPassed, #4ec9b0); color: #fff; }
    .badge.stale { background: var(--vscode-editorWarning-foreground, #cca700); color: #000; }

    /* Progress bar */
    .progress-bar {
      height: 4px;
      background: var(--vscode-editor-background, #1e1e1e);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 10px;
    }
    .progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .progress-fill.running { background: var(--vscode-progressBar-background, #0e639c); }
    .progress-fill.stopped { background: var(--vscode-editorWarning-foreground, #cca700); }
    .progress-fill.failed { background: var(--vscode-errorForeground, #f44747); }

    /* Info bar */
    .info-bar {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .info-item { white-space: nowrap; }

    /* Phase list */
    .phase-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
    .phase-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
    }
    .phase-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04)); }
    .phase-row.active {
      background: rgba(14, 99, 156, 0.15);
      border-left: 3px solid var(--vscode-progressBar-background, #0e639c);
    }
    .phase-row.done { opacity: 0.7; }
    .phase-row.done .phase-title { text-decoration: line-through; }
    .phase-row.error { background: rgba(244, 67, 54, 0.08); }
    .phase-row.paused {
      background: rgba(204, 167, 0, 0.1);
      border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
    }
    .phase-row.dim { opacity: 0.45; }

    .phase-icon { width: 16px; text-align: center; font-size: 13px; }
    .phase-icon.completed { color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .phase-icon.running { color: var(--vscode-progressBar-background, #569cd6); }
    .phase-icon.pending { color: var(--vscode-disabledForeground, #555); }
    .phase-icon.failed { color: var(--vscode-errorForeground, #f44747); }
    .phase-icon.stopped { color: var(--vscode-editorWarning-foreground, #cca700); }

    .phase-num { color: var(--vscode-descriptionForeground, #888); min-width: 20px; }
    .phase-title { flex: 1; }
    .phase-duration { font-size: 11px; color: var(--vscode-descriptionForeground, #888); }
    .phase-attempts { font-size: 10px; color: var(--vscode-descriptionForeground, #888); }

    /* Error snippet */
    .error-snippet {
      margin-bottom: 10px;
      padding: 8px 10px;
      background: var(--vscode-inputValidation-errorBackground, rgba(244, 67, 54, 0.1));
      border: 1px solid var(--vscode-errorForeground, #f44747);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      color: var(--vscode-errorForeground, #f44747);
      overflow-x: auto;
    }

    /* Success banner */
    .success-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(78, 201, 176, 0.1);
      border: 1px solid var(--vscode-testing-iconPassed, #4ec9b0);
      border-radius: 4px;
      margin-bottom: 10px;
      color: var(--vscode-testing-iconPassed, #4ec9b0);
      font-size: 13px;
      font-weight: 500;
    }
    .summary {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
      margin-bottom: 10px;
    }

    /* Action bar */
    .action-bar {
      display: flex;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .action-btn {
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid var(--vscode-button-secondaryBorder, var(--vscode-panel-border, #555));
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }
    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    .action-btn.primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, #0e639c);
    }
    .action-btn.primary:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }

    /* Link action */
    .link-action {
      display: inline-block;
      font-size: 12px;
      color: var(--vscode-textLink-foreground, #569cd6);
      cursor: pointer;
      margin-top: 8px;
      text-decoration: none;
    }
    .link-action:hover { text-decoration: underline; }

    /* How it works */
    .how-it-works {
      text-align: left;
      margin: 16px 0;
      padding: 12px;
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
    }
    .how-it-works h3 {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .how-it-works ol {
      padding-left: 20px;
      font-size: 12px;
      line-height: 1.8;
      color: var(--vscode-descriptionForeground, #888);
    }

    /* Quick actions */
    .quick-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 8px;
    }

    /* What's next */
    .whats-next {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border, #333);
    }
    .whats-next h3 {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    /* Archives */
    .archives-section {
      margin: 12px 8px;
      padding: 12px;
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
    }
    .archives-title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .archive-entry {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 4px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    .archive-entry:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04)); }
    .archive-status { width: 16px; text-align: center; }
    .archive-status.completed { color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .archive-status.failed { color: var(--vscode-errorForeground, #f44747); }
    .archive-status.unknown { color: var(--vscode-editorWarning-foreground, #cca700); }
    .archive-label { flex: 1; color: var(--vscode-foreground); }
    .archive-meta { font-size: 11px; color: var(--vscode-descriptionForeground, #888); }

    /* Spinner */
    .spinner-container { font-size: 24px; margin-bottom: 12px; }
    @keyframes codicon-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { display: inline-block; animation: codicon-spin 1s linear infinite; }
  </style>
</head>
<body>
  <div id="content">${bodyHtml}</div>
  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();

      // Button click handler
      document.addEventListener("click", function(e) {
        var btn = e.target.closest("[data-command]");
        if (btn) {
          var msg = { command: btn.getAttribute("data-command") };
          var phase = btn.getAttribute("data-phase");
          if (phase) msg.phase = parseInt(phase, 10);
          vscode.postMessage(msg);
          return;
        }
        var archiveEntry = e.target.closest("[data-archive]");
        if (archiveEntry) {
          vscode.postMessage({ command: "openReplay", archive: archiveEntry.getAttribute("data-archive") });
          return;
        }
        var phaseRow = e.target.closest(".phase-row");
        if (phaseRow) {
          var phaseNum = parseInt(phaseRow.getAttribute("data-phase"), 10);
          if (!isNaN(phaseNum)) {
            vscode.postMessage({ command: "openLog", phase: phaseNum });
          }
        }
      });

      // Message handler for state updates
      window.addEventListener("message", function(event) {
        var msg = event.data;
        if (msg.type === "fullState") {
          // Full re-render handled by the extension replacing webview HTML
          // or we could re-render here if the extension sends state data
          var content = document.getElementById("content");
          if (content && msg.html) {
            content.innerHTML = msg.html;
          }
        } else if (msg.type === "progressUpdate") {
          var update = msg.update;
          if (!update) return;

          // Update info bar
          var infoBar = document.getElementById("info-bar");
          if (infoBar && update.elapsed) {
            var items = [];
            if (update.elapsed) items.push('<span class="info-item">' + update.elapsed + '</span>');
            if (update.cost) items.push('<span class="info-item">' + update.cost + '</span>');
            if (update.todos) items.push('<span class="info-item">' + update.todos.done + '/' + update.todos.total + ' todos</span>');
            if (update.attemptCount && update.attemptCount > 1) {
              items.push('<span class="info-item">attempt ' + update.attemptCount + (update.maxRetries ? '/' + update.maxRetries : '') + '</span>');
            }
            infoBar.innerHTML = items.join('');
          }

          // Update progress bar
          var progressBar = document.getElementById("progress-bar");
          if (progressBar && update.phases) {
            var completed = 0;
            for (var i = 0; i < update.phases.length; i++) {
              if (update.phases[i].status === "completed") completed++;
            }
            var pct = update.phases.length > 0 ? Math.round((completed / update.phases.length) * 100) : 0;
            var fill = progressBar.querySelector(".progress-fill");
            if (fill) fill.style.width = pct + "%";
          }
        }
      });
    })();
  </script>
</body>
</html>`;
}
