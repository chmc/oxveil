import type { ProgressState } from "../types";
import { escapeHtml } from "../utils/html";

export interface DashboardOptions {
  totalCost?: number;
  collapsed?: boolean;
  todoDone?: number;
  todoTotal?: number;
  todoCurrentItem?: string;
}

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "&#10003;";
    case "in_progress":
      return '<span class="spinner">&#8635;</span>';
    case "failed":
      return "&#10007;";
    default:
      return "&#9675;";
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "in_progress":
      return "running";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function formatPhaseDuration(started?: string, completed?: string): string {
  if (!started || !completed) return "";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function renderDashboardHtml(progress: ProgressState, options?: DashboardOptions): string {
  if (progress.phases.length === 0) {
    return '<div class="dashboard-empty">No active run</div>';
  }

  const collapsed = !!options?.collapsed;
  const costDisplay =
    options?.totalCost != null ? `$${options.totalCost.toFixed(2)}` : "\u2014";

  const todoHtml =
    options?.todoTotal != null && options.todoTotal > 0
      ? `<div class="todo-progress">
  <div class="todo-header">
    <span class="todo-label">Todos</span>
    <span class="todo-count">${options.todoDone ?? 0}/${options.todoTotal} done</span>
  </div>
  <div class="todo-bar"><div class="todo-bar-fill" style="width: ${Math.round(((options.todoDone ?? 0) / options.todoTotal) * 100)}%;"></div></div>
  ${options.todoCurrentItem ? `<div class="todo-current">${escapeHtml(options.todoCurrentItem)}</div>` : ""}
</div>`
      : "";

  if (collapsed) {
    const completed = progress.phases.filter((p) => p.status === "completed").length;
    return `<div class="dashboard-collapsed">
  <span class="dashboard-toggle">&#9660; Expand</span>
  <span class="collapsed-summary">${completed}/${progress.phases.length} phases \u2022 ${costDisplay}</span>
  ${todoHtml}
</div>`;
  }

  const phasesHtml = progress.phases
    .map((phase, i) => {
      const isActive = i === progress.currentPhaseIndex;
      const rowClass = isActive
        ? "phase-row phase-active"
        : phase.status === "pending"
          ? "phase-row phase-pending"
          : "phase-row";
      const iconCls = statusClass(phase.status);
      const duration = formatPhaseDuration(phase.started, phase.completed);
      const metaText = duration ? escapeHtml(duration) : "";
      return `<div class="${rowClass}">
  <span class="phase-icon ${iconCls}">${statusIcon(phase.status)}</span>
  <span class="phase-num${isActive ? " active" : ""}">Phase ${escapeHtml(String(phase.number))}:</span>
  <span class="phase-title${isActive ? " active" : ""}">${escapeHtml(phase.title)}</span>
  <span class="phase-meta${isActive ? " active" : ""}">${metaText}</span>
</div>`;
    })
    .join("\n");

  return `<div class="dashboard-content">
  <span class="dashboard-toggle">&#9650; Collapse</span>
  <div class="dashboard-header">
    <span class="cost">${costDisplay}</span>
  </div>
  <div class="phase-list">
    ${phasesHtml}
  </div>
  ${todoHtml}
</div>`;
}

export interface CompletionBannerOptions {
  totalCost?: number;
  totalPhases?: number;
  durationMs?: number;
}

export function renderCompletionBannerHtml(status: string, options?: CompletionBannerOptions): string {
  const icon = status === "done" ? "&#10003; " : "&#10007; ";
  const title = status === "done" ? `${icon}Run Completed` : `${icon}Run Failed`;
  const bannerClass = status === "done" ? "run-finished-banner" : "run-finished-banner run-failed";
  const costText = options?.totalCost != null ? `$${options.totalCost.toFixed(2)}` : "";
  const phasesText = options?.totalPhases != null ? `${options.totalPhases} phases` : "";
  let durationText = "";
  if (options?.durationMs != null) {
    const totalSec = Math.floor(options.durationMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    durationText = m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
  }
  const stats = [durationText, phasesText, costText].filter(Boolean).join(" \u2022 ");

  return `<div class="${bannerClass}">
  <div class="title">${title}</div>
  ${stats ? `<div class="stats">${stats}</div>` : ""}
  <button class="open-replay" onclick="postOpenReplay()">Open Replay</button>
</div>`;
}

export interface VerifyFailedOptions {
  reason: string;
  attempt: number;
  maxAttempts: number;
}

export function renderVerifyFailedBannerHtml(options: VerifyFailedOptions): string {
  const { reason, attempt, maxAttempts } = options;
  const retryButton = attempt < maxAttempts
    ? `<button class="banner-btn primary" onclick="sendAction('ai-parse-retry')">Retry with Feedback</button>`
    : "";
  return `<div class="verify-banner failed">
    <div class="verify-title">Verification Failed <span class="verify-attempt">(attempt ${attempt} of ${maxAttempts})</span></div>
    <div class="verify-reason">${escapeHtml(reason)}</div>
    <div class="verify-actions">
      ${retryButton}
      <button class="banner-btn" onclick="sendAction('ai-parse-continue')">Continue As-Is</button>
      <button class="banner-btn" onclick="sendAction('ai-parse-abort')">Abort</button>
    </div>
  </div>`;
}

export interface VerifyPassedOptions {
  retryCount: number;
}

export function renderVerifyPassedBannerHtml(options: VerifyPassedOptions): string {
  const retryNote = options.retryCount > 0
    ? ` <span class="verify-attempt">(after ${options.retryCount} retry${options.retryCount > 1 ? "s" : ""})</span>`
    : "";
  return `<div class="verify-banner passed">
    <div class="verify-title">AI Parse Complete${retryNote}</div>
    <div class="verify-actions">
      <button class="banner-btn primary" onclick="sendAction('open-result')">Open Result</button>
    </div>
  </div>`;
}

export function renderLiveRunShell(nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background); color: var(--vscode-foreground, #ccc); padding: 0; }

    /* Dashboard */
    .dashboard { padding: 16px 20px; border-bottom: 1px solid #333; background: var(--vscode-sideBar-background, #252526); }
    .dashboard-toggle { font-size: 11px; color: #569cd6; cursor: pointer; margin-bottom: 10px; user-select: none; }
    .dashboard-empty { padding: 16px 20px; color: #888; font-size: 13px; }
    .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .cost { font-size: 12px; color: #888; }

    .phase-list { display: flex; flex-direction: column; gap: 2px; }
    .phase-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 3px; font-size: 12.5px; }
    .phase-row.phase-active { background: rgba(14, 99, 156, 0.15); }
    .phase-row.phase-pending { opacity: 0.45; }
    .phase-icon { width: 16px; text-align: center; font-size: 13px; }
    .phase-icon.completed { color: #4ec9b0; }
    .phase-icon.running { color: #569cd6; }
    .phase-icon.pending { color: #555; }
    .phase-icon.failed { color: #f44747; }
    .phase-num { color: #6a9955; min-width: 60px; }
    .phase-num.active { color: #569cd6; font-weight: 600; }
    .phase-title { flex: 1; }
    .phase-title.active { color: #e0e0e0; font-weight: 500; }
    .phase-meta { font-size: 11px; color: #555; text-align: right; min-width: 100px; }
    .phase-meta.active { color: #569cd6; }

    /* Todo section */
    .todo-section { margin-top: 12px; padding: 10px 12px; background: var(--vscode-editor-background, #1e1e1e); border-radius: 4px; border: 1px solid #333; }
    .todo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .todo-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .todo-count { font-size: 11px; color: #569cd6; }
    .todo-bar { height: 3px; background: #333; border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
    .todo-bar-fill { height: 100%; background: #4ec9b0; border-radius: 2px; transition: width 0.3s; }
    .todo-current { font-size: 11.5px; color: #569cd6; }

    /* Log stream */
    #log-container { padding: 10px 20px; font-family: 'Menlo', 'Consolas', 'Courier New', monospace; font-size: 11.5px; line-height: 1.65; }
    .log-line { white-space: pre; }
    .log-ts { color: #555; }
    .log-tool { color: #569cd6; font-weight: 500; }
    .log-path { color: #888; }
    .log-cmd { color: #ce9178; }
    .log-todo { color: #4ec9b0; }
    .log-warn { color: #cca700; }
    .log-success { color: #4ec9b0; }
    .log-error { color: #f44747; }
    .log-text { color: #888; font-style: italic; }
    .log-phase-header { font-weight: 600; color: #569cd6; border-top: 1px solid #333; padding-top: 8px; margin-top: 4px; }
    .log-phase-badge { background: #0e639c; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-right: 6px; }
    .log-divider { display: block; border-top: 1px solid #333; margin: 4px 0; }
    .log-session { color: #888; font-size: 10.5px; background: #252526; padding: 2px 6px; border-radius: 3px; }
    .log-todo-create { color: #4ec9b0; font-style: italic; }
    .log-refactor { color: #ce9178; }

    /* Completion banner */
    .run-finished-banner { background: rgba(46, 125, 50, 0.15); border: 1px solid #2e7d32; border-radius: 4px; padding: 16px 20px; margin: 12px 20px; text-align: center; }
    .run-finished-banner .title { font-size: 14px; font-weight: 600; color: #4ec9b0; margin-bottom: 4px; }
    .run-finished-banner .stats { font-size: 12px; color: #888; margin-bottom: 8px; }
    .run-finished-banner button { background: #2e7d32; color: #fff; border: none; padding: 6px 16px; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .run-failed { background: rgba(244, 67, 54, 0.12); border-color: #c62828; }
    .run-failed .title { color: #f44747; }
    .run-failed button { background: #c62828; }

    /* Verify banners */
    .verify-banner { border-radius: 4px; padding: 12px 16px; margin-top: 12px; border: 1px solid transparent; }
    .verify-banner.failed { background: rgba(244, 67, 54, 0.12); border-color: var(--vscode-errorForeground, #f44747); }
    .verify-banner.passed { background: rgba(78, 201, 176, 0.12); border-color: #4ec9b0; }
    .verify-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .verify-banner.failed .verify-title { color: var(--vscode-errorForeground, #f44747); }
    .verify-banner.passed .verify-title { color: #4ec9b0; }
    .verify-attempt { font-size: 11px; font-weight: 400; color: #888; margin-left: 4px; }
    .verify-reason { font-family: 'Menlo', 'Consolas', 'Courier New', monospace; font-size: 11.5px; color: var(--vscode-foreground, #ccc); margin: 6px 0 10px; white-space: pre-wrap; }
    .verify-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .banner-btn { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); border: 1px solid var(--vscode-button-border, #555); padding: 5px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; font-family: inherit; }
    .banner-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .banner-btn.primary { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); border-color: transparent; }
    .banner-btn.primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinner { display: inline-block; animation: spin 1s linear infinite; }
  </style>
</head>
<body>
  <div id="dashboard"></div>
  <div id="log-container"></div>
  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      var dashboard = document.getElementById("dashboard");
      var logContainer = document.getElementById("log-container");
      var autoScroll = true;

      function isNearBottom() {
        return (document.body.scrollHeight - window.scrollY - window.innerHeight) < 50;
      }

      window.addEventListener("scroll", function() {
        autoScroll = isNearBottom();
      });

      function scrollToBottom() {
        if (autoScroll) {
          window.scrollTo(0, document.body.scrollHeight);
        }
      }

      window.addEventListener("message", function(event) {
        var msg = event.data;
        if (msg.type === "dashboard") {
          dashboard.innerHTML = msg.html;
          var vb = document.getElementById("verify-banner");
          if (vb) vb.remove();
          var rf = document.querySelector(".run-finished-banner");
          if (rf) rf.remove();
        } else if (msg.type === "log-append") {
          var lines = msg.lines || [];
          for (var i = 0; i < lines.length; i++) {
            var div = document.createElement("div");
            div.className = "log-line";
            div.innerHTML = lines[i];
            logContainer.appendChild(div);
          }
          scrollToBottom();
        } else if (msg.type === "run-finished") {
          var wrapper = document.createElement("div");
          wrapper.innerHTML = msg.html;
          if (wrapper.firstChild) {
            logContainer.parentNode.insertBefore(wrapper.firstChild, logContainer);
          }
        } else if (msg.type === "log-trim") {
          var count = msg.count || 0;
          for (var j = 0; j < count && logContainer.firstChild; j++) {
            logContainer.removeChild(logContainer.firstChild);
          }
        } else if (msg.type === "verify-failed" || msg.type === "verify-passed") {
          var oldRf = document.querySelector(".run-finished-banner");
          if (oldRf) oldRf.remove();
          var banner = document.getElementById("verify-banner");
          if (!banner) {
            banner = document.createElement("div");
            banner.id = "verify-banner";
            logContainer.after(banner);
          }
          banner.innerHTML = msg.html;
        }
      });

      window.postOpenReplay = function() {
        vscode.postMessage({ type: "open-replay" });
      };

      window.sendAction = function(type) {
        vscode.postMessage({ type: type });
      };

      // Toggle dashboard collapse
      document.addEventListener("click", function(e) {
        if (e.target && e.target.classList.contains("dashboard-toggle")) {
          vscode.postMessage({ type: "toggle-dashboard" });
        }
      });

      // Elapsed time updater
      setInterval(function() {
        var el = document.querySelector("[data-started]");
        if (!el) return;
        var started = parseInt(el.getAttribute("data-started"), 10);
        if (isNaN(started)) return;
        var elapsed = Date.now() - started;
        var totalSeconds = Math.floor(elapsed / 1000);
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        el.textContent = minutes + "m " + (seconds < 10 ? "0" : "") + seconds + "s";
      }, 1000);
    })();
  </script>
</body>
</html>`;
}
