// Styles for the live run panel webview

export function getLiveRunStyles(): string {
  return `
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

    /* AI Parse Status Header */
    .ai-parse-status { padding: 10px 20px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #333; }
    .ai-parse-status.parsing { background: rgba(86, 156, 214, 0.1); color: #569cd6; }
    .ai-parse-status.complete { background: rgba(78, 201, 176, 0.1); color: #4ec9b0; }
    .ai-parse-status.needs-input { background: rgba(204, 167, 0, 0.1); color: #cca700; }
    .ai-parse-status .status-icon { font-size: 14px; }
    .ai-parse-status.parsing .status-icon { animation: spin 1s linear infinite; }
  `;
}
