import type { ProgressState } from "../types";
import { escapeHtml } from "../utils/html";
import { getLiveRunStyles } from "./liveRunStyles";

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
  const icon = status === "done" ? "&#10003; " : status === "stopped" ? "&#9646;&#9646; " : "&#10007; ";
  const title = status === "done" ? `${icon}Run Completed` : status === "stopped" ? `${icon}Run Stopped` : `${icon}Run Failed`;
  const bannerClass = status === "done" ? "run-finished-banner" : status === "stopped" ? "run-finished-banner" : "run-finished-banner run-failed";
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
  <style>${getLiveRunStyles()}</style>
</head>
<body>
  <div id="ai-parse-status-header"></div>
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

      var aiParseStatusHeader = document.getElementById("ai-parse-status-header");

      window.addEventListener("message", function(event) {
        var msg = event.data;
        if (msg.type === "ai-parse-status") {
          var statusText = "";
          var icon = "";
          if (msg.status === "parsing") {
            icon = "&#8635;";
            statusText = "AI Parsing...";
          } else if (msg.status === "complete") {
            icon = "&#10003;";
            statusText = "Parse complete";
          } else if (msg.status === "needs-input") {
            icon = "&#9888;";
            statusText = "Input needed";
          }
          if (statusText) {
            aiParseStatusHeader.innerHTML = '<div class="ai-parse-status ' + msg.status + '"><span class="status-icon">' + icon + '</span>' + statusText + '</div>';
          } else {
            aiParseStatusHeader.innerHTML = "";
          }
        } else if (msg.type === "dashboard") {
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
        } else if (msg.type === "clear-verify-banner") {
          var vb = document.getElementById("verify-banner");
          if (vb) vb.remove();
        }
      });

      window.postOpenReplay = function() {
        vscode.postMessage({ type: "open-replay" });
      };

      window.sendAction = function(type) {
        vscode.postMessage({ type: type });
        // Remove verify-banner after user takes action (e.g., "Open Result")
        var vb = document.getElementById("verify-banner");
        if (vb) vb.remove();
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
