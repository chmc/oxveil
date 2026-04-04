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

  const costDisplay =
    options?.totalCost != null ? `$${options.totalCost.toFixed(2)}` : "\u2014";

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

  const todoHtml =
    options?.todoTotal != null && options.todoTotal > 0
      ? `<div class="todo-section">
  <div class="todo-header">
    <span class="todo-label">Todos</span>
    <span class="todo-count">${options.todoDone ?? 0}/${options.todoTotal} done</span>
  </div>
  <div class="todo-bar"><div class="todo-bar-fill" style="width: ${Math.round(((options.todoDone ?? 0) / options.todoTotal) * 100)}%;"></div></div>
  ${options.todoCurrentItem ? `<div class="todo-current">${escapeHtml(options.todoCurrentItem)}</div>` : ""}
</div>`
      : "";

  return `<div class="dashboard-content">
  <div class="dashboard-header">
    <span class="cost">${costDisplay}</span>
  </div>
  <div class="phase-list">
    ${phasesHtml}
  </div>
  ${todoHtml}
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
    .log-refactor { color: #ce9178; }

    /* Completion banner */
    .run-finished-banner { background: rgba(46, 125, 50, 0.15); border: 1px solid #2e7d32; border-radius: 4px; padding: 16px 20px; margin: 12px 20px; text-align: center; }
    .run-finished-banner .title { font-size: 14px; font-weight: 600; color: #4ec9b0; margin-bottom: 4px; }
    .run-finished-banner .stats { font-size: 12px; color: #888; margin-bottom: 8px; }
    .run-finished-banner button { background: #2e7d32; color: #fff; border: none; padding: 6px 16px; border-radius: 3px; cursor: pointer; font-size: 12px; }

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
          var banner = document.createElement("div");
          banner.className = "run-finished-banner";
          banner.innerHTML = '<div class="title">Run Completed</div>'
            + '<div class="stats">' + (msg.summary || "") + '</div>'
            + '<button onclick="postOpenReplay()">Open Replay</button>';
          logContainer.parentNode.insertBefore(banner, logContainer);
        } else if (msg.type === "log-trim") {
          var count = msg.count || 0;
          for (var j = 0; j < count && logContainer.firstChild; j++) {
            logContainer.removeChild(logContainer.firstChild);
          }
        }
      });

      window.postOpenReplay = function() {
        vscode.postMessage({ type: "open-replay" });
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
