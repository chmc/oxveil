/** Sidebar webview client-side JavaScript. */
export function sidebarJs(): string {
  return `
    (function() {
      try {
      var vscode = acquireVsCodeApi();

      // Button click handler
      document.addEventListener("click", function(e) {
        var btn = e.target.closest("[data-command]");
        if (btn) {
          var msg = { command: btn.getAttribute("data-command") };
          var phase = btn.getAttribute("data-phase");
          if (phase) msg.phase = parseInt(phase, 10);
          var archive = btn.getAttribute("data-archive");
          if (archive) msg.archive = archive;
          console.log("[Oxveil sidebar] click:", msg.command);
          vscode.postMessage(msg);
          if (btn.tagName === "BUTTON") {
            btn.setAttribute("disabled", "true");
            if (msg.command === "start") {
              btn.innerHTML = '<span class="codicon codicon-sync spin"></span> Starting...';
            } else if (msg.command === "formPlan") {
              btn.innerHTML = '<span class="codicon codicon-sync spin"></span> Forming...';
            } else {
              setTimeout(function() { btn.removeAttribute("disabled"); }, 2000);
            }
          }
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
        console.log("[Oxveil sidebar] message received:", msg.type);
        if (msg.type === "triggerClick") {
          // Trigger click for testing - uses same path as user clicks
          var el = document.querySelector(msg.selector);
          if (el) {
            console.log("[Oxveil sidebar] triggering click on:", msg.selector);
            el.click();
          } else {
            console.warn("[Oxveil sidebar] triggerClick: element not found:", msg.selector);
          }
          return;
        }
        if (msg.type === "fullState") {
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

          // Update phase list
          var phaseList = document.getElementById("phase-list");
          if (phaseList && update.phaseListHtml) {
            phaseList.outerHTML = update.phaseListHtml;
          }
        }
      });

      // Signal to extension that script is loaded and handlers are registered
      vscode.postMessage({ command: "__ready" });

      } catch(e) {
        console.error("[Oxveil sidebar] init failed:", e);
        var el = document.getElementById("content");
        if (el) el.innerHTML = '<p style="color:var(--vscode-errorForeground,#f44);padding:16px;">Sidebar failed to initialize. Reload the window (Developer: Reload Window).</p>';
      }
    })();
  `;
}
