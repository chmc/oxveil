import { escapeHtml } from "../utils/html";

export interface PhaseCardData {
  number: number | string;
  title: string;
  description: string;
  dependencies?: string[];
}

export interface PhaseCardsOptions {
  state: "active" | "empty" | "session-ended" | "raw-markdown";
  phases?: PhaseCardData[];
  sessionActive?: boolean;
  isValid?: boolean;
  title?: string;
  rawMarkdown?: string;
  format?: "phase" | "keyword" | "numbered";
  keyword?: string;
  tabs?: Array<{ category: string; label: string; active: boolean }>;
  showFormButton?: boolean;
}

function formatLabel(format: PhaseCardsOptions["format"], keyword: string | undefined, num: string): string {
  switch (format) {
    case "keyword": return `${keyword || "Section"} ${num}`;
    case "numbered": return `${num}.`;
    default: return `Phase ${num}`;
  }
}

function renderHeader(options: PhaseCardsOptions): string {
  const title = escapeHtml(options.title || "Plan Preview");
  const isEnded = options.state === "session-ended";

  let badge: string;
  if (isEnded) {
    badge = '<span class="ended-badge">&#9679; Session ended</span>';
  } else {
    badge = '<span class="live-badge">&#9679; Live</span>';
  }

  const validBadge =
    options.isValid
      ? '<span class="valid-badge">&#10003; Valid</span>'
      : "";

  const formBtn = options.showFormButton
    ? '<button class="form-plan-btn">Form Claudeloop Plan</button>'
    : "";

  const tabStrip = options.tabs && options.tabs.length >= 2
    ? `<div class="tab-strip">${options.tabs.map((t) =>
        `<button class="tab-pill${t.active ? " active" : ""}" data-category="${escapeHtml(t.category)}">${escapeHtml(t.label)}</button>`
      ).join("")}</div>`
    : "";

  return `<div class="preview-header">
  <span class="preview-title">${title}</span>
  ${badge}
  ${validBadge}
  ${formBtn}
</div>
${tabStrip}`;
}

function renderPhaseCard(phase: PhaseCardData, sessionActive: boolean, format?: PhaseCardsOptions["format"], keyword?: string): string {
  const num = escapeHtml(String(phase.number));
  const label = escapeHtml(formatLabel(format, keyword, String(phase.number)));
  const title = escapeHtml(phase.title);
  const desc = renderMarkdownHtml(phase.description);

  const annotateBtn = sessionActive
    ? '<button class="annotate-btn" data-phase="' + num + '">&#128221; Note</button>'
    : "";

  const depsHtml =
    phase.dependencies && phase.dependencies.length > 0
      ? `<div class="phase-deps">Depends on: ${escapeHtml(phase.dependencies.join(", "))}</div>`
      : "";

  return `<div class="phase-card">
  <div class="phase-card-header">
    <span class="phase-number">${label}</span>
    <span class="phase-title">${title}</span>
    ${annotateBtn}
  </div>
  <div class="phase-desc">${desc}</div>
  ${depsHtml}
</div>`;
}

/** Apply bold and inline-code formatting to already-escaped HTML. */
function formatInline(escaped: string): string {
  let text = escaped;
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  return text;
}

/** Basic markdown to HTML for free-form plans. */
function renderMarkdownHtml(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inList = false;
  let inOrderedList = false;
  let inCodeBlock = false;
  const codeBlockLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Fenced code blocks
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOrderedList) { out.push("</ol>"); inOrderedList = false; }
        inCodeBlock = true;
        codeBlockLines.length = 0;
      } else {
        out.push(`<pre class="md-codeblock"><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (inOrderedList) { out.push("</ol>"); inOrderedList = false; }
      const level = headingMatch[1].length;
      out.push(`<h${level} class="md-heading">${escapeHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered list items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (inOrderedList) { out.push("</ol>"); inOrderedList = false; }
      if (!inList) { out.push('<ul class="md-list">'); inList = true; }
      const content = trimmed.slice(2);
      // Handle checkbox syntax
      if (content.startsWith("[ ] ")) {
        out.push(`<li>&#9744; ${formatInline(escapeHtml(content.slice(4)))}</li>`);
      } else if (content.startsWith("[x] ") || content.startsWith("[X] ")) {
        out.push(`<li>&#9745; ${formatInline(escapeHtml(content.slice(4)))}</li>`);
      } else {
        out.push(`<li>${formatInline(escapeHtml(content))}</li>`);
      }
      continue;
    }

    // Numbered list items
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (!inOrderedList) { out.push('<ol class="md-list">'); inOrderedList = true; }
      out.push(`<li>${formatInline(escapeHtml(orderedMatch[1]))}</li>`);
      continue;
    }

    if (inList) { out.push("</ul>"); inList = false; }
    if (inOrderedList) { out.push("</ol>"); inOrderedList = false; }

    // Blank line
    if (trimmed === "") {
      out.push("<br>");
      continue;
    }

    // Regular text with inline formatting
    out.push(`<p class="md-text">${formatInline(escapeHtml(trimmed))}</p>`);
  }

  // Close any open blocks
  if (inCodeBlock) {
    out.push(`<pre class="md-codeblock"><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
  }
  if (inList) { out.push("</ul>"); }
  if (inOrderedList) { out.push("</ol>"); }
  return out.join("\n");
}

export function renderPhaseCardsHtml(options: PhaseCardsOptions): string {
  const header = renderHeader(options);

  if (options.state === "empty") {
    const subtitle = options.sessionActive
      ? "Waiting for Claude to write a plan..."
      : "Start chatting with Claude in the terminal on the left. When Claude writes a plan, it will appear here.";
    return `${header}
<div class="preview-content">
  <div class="empty-state">
    <div class="empty-icon">&#128203;</div>
    <div class="empty-title">No plan yet</div>
    <div class="empty-subtitle">${subtitle}</div>
  </div>
</div>`;
  }

  if (options.state === "raw-markdown") {
    const annotateBtn = options.sessionActive
      ? '<button class="annotate-btn raw-annotate-btn" data-phase="plan">&#128221; Add note</button>'
      : "";
    return `${header}
<div class="preview-content">
  ${annotateBtn}
  <div class="raw-markdown">${renderMarkdownHtml(options.rawMarkdown || "")}</div>
</div>`;
  }

  const sessionActive = !!options.sessionActive;
  const phases = options.phases || [];
  const cardsHtml = phases.map((p) => renderPhaseCard(p, sessionActive, options.format, options.keyword)).join("\n");

  const endedBanner =
    options.state === "session-ended"
      ? `<div class="session-ended-banner">
  <span class="session-ended-text">&#9888; Terminal closed — annotations disabled</span>
  <span class="session-ended-hint">Run &quot;Oxveil: Plan Chat&quot; to start a new session</span>
</div>`
      : "";

  return `${header}
${endedBanner}
<div class="preview-content">
  ${cardsHtml}
</div>`;
}

export function renderPlanPreviewShell(nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background); color: var(--vscode-foreground, #ccc); padding: 0; }

    /* Header */
    .preview-header { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #333; background: var(--vscode-sideBar-background, #252526); flex-wrap: wrap; }
    .preview-title { font-weight: 600; font-size: 13px; color: var(--vscode-foreground, #e0e0e0); min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .live-badge { background: #1b4332; color: #4ec9b0; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .ended-badge { background: #3b1d1d; color: #f44747; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .valid-badge { background: #1b4332; color: #4ec9b0; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .form-plan-btn { margin-left: auto; flex-shrink: 0; background: #264f78; border: 1px solid #569cd6; color: #e0e0e0; font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; }
    .form-plan-btn:hover { background: #2d5a8a; }

    /* Tab strip */
    .tab-strip { display: flex; gap: 4px; padding: 6px 16px; border-bottom: 1px solid #333; background: var(--vscode-sideBar-background, #252526); }
    .tab-pill { background: none; border: 1px solid #444; color: #888; font-size: 11px; padding: 3px 10px; border-radius: 12px; cursor: pointer; font-family: inherit; }
    .tab-pill:hover { border-color: #666; color: #ccc; }
    .tab-pill.active { background: #264f78; border-color: #569cd6; color: #e0e0e0; }

    /* Session ended banner */
    .session-ended-banner { padding: 10px 16px; background: #3b1d1d; border-bottom: 1px solid #5a2d2d; display: flex; align-items: center; gap: 8px; }
    .session-ended-text { color: #f44747; font-size: 12px; }
    .session-ended-hint { color: #888; font-size: 11px; margin-left: auto; }

    /* Content area */
    .preview-content { flex: 1; padding: 16px; overflow-y: auto; }

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

    /* Formatted markdown */
    .raw-markdown { padding: 8px 0; }
    .md-heading { margin: 12px 0 6px 0; color: var(--vscode-foreground, #e0e0e0); }
    h2.md-heading { font-size: 15px; border-bottom: 1px solid #333; padding-bottom: 4px; }
    h3.md-heading { font-size: 13px; }
    h4.md-heading { font-size: 12px; color: #999; }
    .md-text { font-size: 12px; line-height: 1.6; color: #999; margin: 2px 0; }
    .md-list { margin: 4px 0 4px 20px; font-size: 12px; line-height: 1.6; color: #999; }
    .md-code { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; }
    .md-codeblock { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 8px 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; line-height: 1.4; overflow-x: auto; color: #ccc; white-space: pre; margin: 4px 0; }

    /* Markdown inside phase cards */
    .phase-desc .md-heading { font-size: 12px; margin: 6px 0 2px 0; color: inherit; border-bottom: none; padding-bottom: 0; }
    .phase-desc .md-list { margin-left: 16px; }
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
          content.innerHTML = msg.html;
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
      }

      function bindAnnotationButtons() {
        var buttons = document.querySelectorAll(".annotate-btn");
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].addEventListener("click", function() {
            var phase = this.getAttribute("data-phase");
            var card = this.closest(".phase-card") || this.closest(".preview-content");
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
