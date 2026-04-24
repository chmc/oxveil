/** Sidebar webview CSS styles. */
export function sidebarCss(): string {
  return `
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

    /* Sub-step progress */
    .phase-substeps {
      font-size: 10px;
      margin-top: 3px;
      color: var(--vscode-descriptionForeground, #888);
    }
    .substep-done {
      color: var(--vscode-testing-iconPassed, #4ec9b0);
      opacity: 0.7;
    }
    .substep-active {
      color: var(--vscode-progressBar-background, #569cd6);
    }
    .substep-failed {
      color: var(--vscode-errorForeground, #f44747);
    }
    .substep-pending {
      opacity: 0.4;
    }
    .substep-arrow {
      opacity: 0.4;
      margin: 0 2px;
    }
    .substep-check, .substep-x {
      margin-right: 2px;
    }

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
    .link-actions {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin-top: 8px;
    }
    .link-action {
      display: inline-block;
      font-size: 12px;
      color: var(--vscode-textLink-foreground, #569cd6);
      cursor: pointer;
      margin-top: 8px;
      text-decoration: none;
    }
    .link-actions .link-action { margin-top: 0; }
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
      flex-wrap: wrap;
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
  `;
}
