/** Sidebar webview client-side JavaScript. */
export function sidebarJs(): string {
  return `
    (function() {
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
  `;
}
