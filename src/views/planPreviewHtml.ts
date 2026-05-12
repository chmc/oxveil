import { escapeHtml } from "../utils/html";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    checkbox({ checked }: { checked: boolean }) {
      return checked ? "&#9745; " : "&#9744; ";
    },
  },
});

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
  planFormed?: boolean;
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

  const tabStrip = options.tabs && options.tabs.length >= 2
    ? `<div class="tab-strip">${options.tabs.map((t) =>
        `<button class="tab-pill${t.active ? " active" : ""}" data-category="${escapeHtml(t.category)}">${escapeHtml(t.label)}</button>`
      ).join("")}</div>`
    : "";

  return `<div class="preview-header">
  <span class="preview-title">${title}</span>
  ${badge}
  ${validBadge}
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

/** Belt-and-suspenders sanitization — CSP is the real security boundary. */
function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=")
    .replace(/\shref\s*=\s*["'][^"']*javascript:[^"']*["']/gi, ' href="about:blank"');
}

/** Convert markdown to HTML using marked (GFM). */
function renderMarkdownHtml(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string;
  return stripUnsafeHtml(html);
}

export function renderPhaseCardsHtml(options: PhaseCardsOptions): string {
  const header = renderHeader(options);
  let formBtn = "";
  if (options.showFormButton) {
    if (options.planFormed && !options.sessionActive) {
      formBtn = '<button class="start-btn primary">Start</button>';
    } else if (options.planFormed) {
      formBtn = '<button class="start-btn primary" disabled>Start</button>';
    } else {
      formBtn = '<button class="form-plan-btn">Form Claudeloop Plan</button>';
    }
  }

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
    const buttons: string[] = [];
    if (options.sessionActive) {
      buttons.push('<button class="annotate-btn raw-annotate-btn" data-phase="plan">&#128221; Add note</button>');
    }
    if (formBtn) { buttons.push(formBtn); }
    const actionBar = buttons.length > 0
      ? `<div class="action-bar">${buttons.join("\n  ")}</div>`
      : "";
    return `${header}
<div class="preview-content">
  <div class="raw-markdown">${renderMarkdownHtml(options.rawMarkdown || "")}</div>
</div>
${actionBar}`;
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

  const actionBar = formBtn
    ? `<div class="action-bar">${formBtn}</div>`
    : "";

  return `${header}
${endedBanner}
<div class="preview-content">
  ${cardsHtml}
</div>
${actionBar}`;
}

