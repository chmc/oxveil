import type { Lesson } from "../types";

export interface SelfImprovementHtmlOptions {
  lessons: Lesson[];
  cspSource: string;
  nonce: string;
}

/**
 * Render the self-improvement panel HTML.
 */
export function renderSelfImprovementHtml(options: SelfImprovementHtmlOptions): string {
  const { lessons, cspSource, nonce } = options;

  const lessonsRows = lessons
    .map((lesson) => {
      const statusIcon = lesson.exit === "success" ? "✓" : "✗";
      const statusClass = lesson.exit === "success" ? "success" : "error";
      const durationFormatted = formatDuration(lesson.duration);
      const retriesTitle = lesson.failReason ? ` title="${escapeHtml(lesson.failReason)}"` : "";
      const summaryText = lesson.summary ? escapeHtml(lesson.summary) : "—";
      const summaryClass = lesson.summary ? "summary-cell" : "summary-cell empty";
      return `
        <tr>
          <td>${escapeHtml(String(lesson.phase))}</td>
          <td>${escapeHtml(lesson.title)}</td>
          <td${retriesTitle}>${lesson.retries}</td>
          <td>${durationFormatted}</td>
          <td class="${statusClass}">${statusIcon}</td>
          <td class="${summaryClass}">${summaryText}</td>
        </tr>`;
    })
    .join("");

  const summaryStats = computeSummary(lessons);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Self-Improvement</title>
  <style nonce="${nonce}">
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, system-ui, -apple-system, sans-serif);
      --vscode-foreground: var(--vscode-editor-foreground, #cccccc);
      --vscode-background: var(--vscode-editor-background, #1e1e1e);
      --vscode-button-background: var(--vscode-button-background, #0e639c);
      --vscode-button-foreground: var(--vscode-button-foreground, #ffffff);
      --vscode-button-hoverBackground: var(--vscode-button-hoverBackground, #1177bb);
      --vscode-button-secondaryBackground: var(--vscode-button-secondaryBackground, #3a3d41);
      --vscode-button-secondaryForeground: var(--vscode-button-secondaryForeground, #ffffff);
      --vscode-button-secondaryHoverBackground: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-background);
      padding: 16px;
      margin: 0;
    }
    h1 {
      font-size: 1.4em;
      margin: 0 0 16px 0;
      font-weight: 500;
    }
    .summary {
      margin-bottom: 16px;
      font-size: 0.9em;
      opacity: 0.8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th, td {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(128, 128, 128, 0.3);
    }
    th {
      font-weight: 500;
      opacity: 0.7;
      font-size: 0.85em;
      text-transform: uppercase;
    }
    .success { color: #4ec9b0; }
    .error { color: #f14c4c; }
    .actions {
      display: flex;
      gap: 12px;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    th:nth-child(1), td:nth-child(1) { width: 60px; }
    th:nth-child(2), td:nth-child(2) { width: 150px; }
    th:nth-child(3), td:nth-child(3) { width: 60px; }
    th:nth-child(4), td:nth-child(4) { width: 80px; }
    th:nth-child(5), td:nth-child(5) { width: 60px; }
    th:nth-child(6), td:nth-child(6) { width: auto; }
    .summary-cell {
      font-style: italic;
      opacity: 0.9;
    }
    .summary-cell.empty {
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <h1>Self-Improvement</h1>
  <div class="summary">${summaryStats}</div>
  <table>
    <thead>
      <tr>
        <th>Phase</th>
        <th>Title</th>
        <th>Retries</th>
        <th>Duration</th>
        <th>Status</th>
        <th>Summary</th>
      </tr>
    </thead>
    <tbody>
      ${lessonsRows}
    </tbody>
  </table>
  <div class="actions">
    <button class="primary" id="start-btn">Start Improvement Session</button>
    <button class="secondary" id="skip-btn">Skip</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('start-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'start' });
    });
    document.getElementById('skip-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'skip' });
    });
  </script>
</body>
</html>`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function computeSummary(lessons: Lesson[]): string {
  const total = lessons.length;
  const succeeded = lessons.filter((l) => l.exit === "success").length;
  const failed = total - succeeded;
  const totalRetries = lessons.reduce((sum, l) => sum + l.retries, 0);
  const totalDuration = lessons.reduce((sum, l) => sum + l.duration, 0);

  const parts: string[] = [];
  parts.push(`${total} phase${total !== 1 ? "s" : ""}`);
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }
  if (totalRetries > 0) {
    parts.push(`${totalRetries} total retries`);
  }
  parts.push(`${formatDuration(totalDuration)} total`);

  return parts.join(" · ");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
