export function renderPlanPreviewShell(nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { height: 100%; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background); color: var(--vscode-foreground, #ccc); padding: 0; height: 100%; }
    #plan-content { display: flex; flex-direction: column; height: 100%; }

    /* Header */
    .preview-header { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #333; background: var(--vscode-sideBar-background, #252526); flex-wrap: wrap; }
    .preview-title { font-weight: 600; font-size: 13px; color: var(--vscode-foreground, #e0e0e0); min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .live-badge { background: #1b4332; color: #4ec9b0; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .ended-badge { background: #3b1d1d; color: #f44747; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .valid-badge { background: #1b4332; color: #4ec9b0; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .form-plan-btn { flex-shrink: 0; background: #264f78; border: 1px solid #569cd6; color: #e0e0e0; font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; }
    .form-plan-btn:hover:not(:disabled) { background: #2d5a8a; }
    .form-plan-btn:disabled { background: #3c3c3c; border-color: #555; color: #888; cursor: not-allowed; }
    .start-btn { flex-shrink: 0; background: #264f78; border: 1px solid #569cd6; color: #e0e0e0; font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; }
    .start-btn:hover { background: #2d5a8a; }
    .start-btn.primary { background: #0e639c; border-color: #1177bb; }
    .start-btn.primary:hover { background: #1177bb; }

    /* Tab strip */
    .tab-strip { display: flex; gap: 4px; padding: 6px 16px; border-bottom: 1px solid #333; background: var(--vscode-sideBar-background, #252526); }
    .tab-pill { background: none; border: 1px solid #444; color: #888; font-size: 11px; padding: 3px 10px; border-radius: 12px; cursor: pointer; font-family: inherit; }
    .tab-pill:hover { border-color: #666; color: #ccc; }
    .tab-pill.active { background: #264f78; border-color: #569cd6; color: #e0e0e0; }

    /* Session ended banner */
    .session-ended-banner { padding: 10px 16px; background: #3b1d1d; border-bottom: 1px solid #5a2d2d; display: flex; align-items: center; gap: 8px; }
    .session-ended-text { color: #f44747; font-size: 12px; }
    .session-ended-hint { color: #888; font-size: 11px; margin-left: auto; }

    /* Action bar */
    .action-bar { flex-shrink: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid var(--vscode-panel-border, #333); background: var(--vscode-sideBar-background, #252526); }

    /* Content area */
    .preview-content { flex: 1; padding: 16px; overflow-y: auto; min-height: 0; }

    /* Phase cards */
    .phase-card { margin-bottom: 12px; padding: 12px 14px; background: var(--vscode-sideBar-background, #252526); border-radius: 6px; border-left: 3px solid #555; }
    .phase-card.done { border-left-color: #4ec9b0; }
    .phase-card.active { border-left-color: #569cd6; }
    .phase-card.pending { border-left-color: #555; }

    .phase-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .phase-number { color: #569cd6; font-weight: 600; font-size: 12px; }
    .phase-title { color: var(--vscode-foreground, #e0e0e0); font-weight: 500; font-size: 13px; }
    .annotate-btn { margin-left: auto; background: none; border: 1px solid #555; color: #888; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; }
    .annotate-btn:hover { border-color: #888; color: #ccc; }
    .raw-annotate-btn { margin-bottom: 12px; }

    .phase-desc { color: #999; font-size: 12px; line-height: 1.5; margin-bottom: 4px; }
    .phase-deps { color: #666; font-size: 11px; font-style: italic; }

    /* Annotation input */
    .annotation { margin-top: 8px; padding: 8px 10px; background: #2d1b00; border: 1px solid #bb8009; border-radius: 4px; display: flex; align-items: center; gap: 8px; }
    .annotation-icon { color: #e3b341; font-size: 12px; }
    .annotation-input { flex: 1; background: var(--vscode-editor-background, #1e1e1e); border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: var(--vscode-foreground, #e0e0e0); font-size: 12px; font-family: inherit; }
    .annotation-hint { color: #888; font-size: 10px; }

    /* Empty state */
    .empty-state { text-align: center; color: #666; padding-top: 120px; }
    .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }
    .empty-title { font-size: 14px; color: #888; margin-bottom: 8px; }
    .empty-subtitle { font-size: 12px; color: #666; line-height: 1.6; max-width: 300px; margin: 0 auto; }

    /* marked output — scoped to content areas */
    .raw-markdown { padding: 8px 0; }
    .phase-desc table, .raw-markdown table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
    .phase-desc th, .raw-markdown th, .phase-desc td, .raw-markdown td { border: 1px solid #444; padding: 4px 8px; text-align: left; }
    .phase-desc th, .raw-markdown th { background: var(--vscode-sideBar-background, #252526); color: var(--vscode-foreground, #e0e0e0); font-weight: 600; }
    .phase-desc em, .raw-markdown em { font-style: italic; }
    .phase-desc del, .raw-markdown del { text-decoration: line-through; opacity: 0.7; }
    .phase-desc a, .raw-markdown a { color: var(--vscode-textLink-foreground, #569cd6); text-decoration: none; }
    .phase-desc a:hover, .raw-markdown a:hover { text-decoration: underline; }
    .phase-desc blockquote, .raw-markdown blockquote { border-left: 3px solid #444; padding-left: 12px; margin: 8px 0; color: #888; }
    .phase-desc pre, .raw-markdown pre { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 12px 16px; border-radius: 4px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; line-height: 1.4; overflow-x: auto; color: #ccc; white-space: pre; margin: 8px 0; }
    .phase-desc code, .raw-markdown code { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; }
    .phase-desc pre code, .raw-markdown pre code { background: none; padding: 0; }
    .phase-desc ul, .raw-markdown ul, .phase-desc ol, .raw-markdown ol { margin: 4px 0 4px 20px; font-size: 12px; line-height: 1.6; color: #999; }
    .phase-desc p, .raw-markdown p { font-size: 12px; line-height: 1.6; color: #999; margin: 2px 0; }
    .phase-desc h1, .phase-desc h2, .phase-desc h3, .phase-desc h4, .phase-desc h5, .phase-desc h6,
    .raw-markdown h1, .raw-markdown h2, .raw-markdown h3, .raw-markdown h4, .raw-markdown h5, .raw-markdown h6 { margin: 12px 0 6px 0; color: var(--vscode-foreground, #e0e0e0); }
    .phase-desc h2, .raw-markdown h2 { font-size: 15px; border-bottom: 1px solid #333; padding-bottom: 4px; }
  </style>
</head>
<body>
  <div id="plan-content"></div>
  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      var content = document.getElementById("plan-content");

      window.addEventListener("message", function(event) {
        var msg = event.data;
        if (msg.type === "update") {
          var scrollable = content.querySelector(".preview-content");
          var scrollTop = scrollable ? scrollable.scrollTop : 0;
          content.innerHTML = msg.html;
          scrollable = content.querySelector(".preview-content");
          if (scrollable) {
            scrollable.scrollTop = Math.min(scrollTop, scrollable.scrollHeight - scrollable.clientHeight);
          }
          bindAnnotationButtons();
          bindTabButtons();
          bindFormPlanButton();
        }
      });

      vscode.postMessage({ type: "ready" });

      function bindTabButtons() {
        var tabs = document.querySelectorAll(".tab-pill");
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].addEventListener("click", function() {
            vscode.postMessage({ type: "switchTab", category: this.getAttribute("data-category") });
          });
        }
      }

      function bindFormPlanButton() {
        var btn = document.querySelector(".form-plan-btn");
        if (btn) {
          btn.addEventListener("click", function() {
            vscode.postMessage({ type: "formPlan" });
          });
        }
        var startBtn = document.querySelector(".start-btn");
        if (startBtn) {
          startBtn.addEventListener("click", function() {
            vscode.postMessage({ type: "start" });
          });
        }
      }

      function bindAnnotationButtons() {
        var buttons = document.querySelectorAll(".annotate-btn");
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].addEventListener("click", function() {
            var phase = this.getAttribute("data-phase");
            var card = this.closest(".phase-card") || this.closest(".preview-content") || this.closest(".action-bar");
            if (card && !card.querySelector(".annotation")) {
              var ann = document.createElement("div");
              ann.className = "annotation";
              ann.innerHTML = '<span class="annotation-icon">&#128221;</span>'
                + '<input class="annotation-input" placeholder="Add note for Claude...">'
                + '<span class="annotation-hint">Enter to send</span>';
              card.appendChild(ann);
              var input = ann.querySelector(".annotation-input");
              if (input) {
                input.focus();
                input.addEventListener("keydown", function(e) {
                  if (e.key === "Enter" && this.value.trim()) {
                    vscode.postMessage({ type: "annotation", phase: phase, text: this.value.trim() });
                    this.value = "";
                    ann.remove();
                  }
                });
              }
            }
          });
        }
      }
    })();
  </script>
</body>
</html>`;
}
