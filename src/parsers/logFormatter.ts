import { escapeHtml } from "../utils/html";

const TS_RE = /^(\s*)\[(\d{2}:\d{2}:\d{2})\]\s?/;
const DIVIDER_RE = /[─┄]{5,}/;
const PHASE_RE = /▶ Executing Phase/;
const TOOL_RE = /\[Tool: (\w+)\]\s*(.*)/;
const TODO_RE = /\[Todos: \d+\/\d+ done\]/;
const TODO_WRITE_RE = /\[TodoWrite\]/;
const SESSION_RE = /\[Session:/;
const ERROR_RE = /\[Result \[error\]/;
const VERIFY_FAIL_RE = /✗/;
const REFACTOR_RE = /🔧/;
const WARN_RE = /⚠/;
const SUCCESS_RE = /✓/;

const BASH_TOOLS = new Set(["Bash", "bash"]);

export function formatLogLine(line: string): string {
  if (line === "") {
    return '<div class="log-line">&nbsp;</div>';
  }

  const escaped = escapeHtml(line);

  // Extract timestamp
  const tsMatch = line.match(TS_RE);
  let ts = "";
  let rest = escaped;
  if (tsMatch) {
    const indent = escapeHtml(tsMatch[1]);
    ts = `${indent}<span class="log-ts">[${escapeHtml(tsMatch[2])}]</span> `;
    // Remove timestamp prefix from escaped line
    const prefixLen = tsMatch[0].length;
    rest = escapeHtml(line.slice(prefixLen));
  }

  const afterTs = tsMatch ? line.slice(tsMatch[0].length) : line;

  // Pattern priority: divider → phase header → tool call → todo → TodoWrite → session → error → refactor → warning → success → default
  if (DIVIDER_RE.test(afterTs)) {
    return `<div class="log-line">${ts}<span class="log-divider">${rest}</span></div>`;
  }

  if (PHASE_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-phase-header">${ts}${rest}</span></div>`;
  }

  const toolMatch = afterTs.match(TOOL_RE);
  if (toolMatch) {
    const toolName = escapeHtml(toolMatch[1]);
    const args = escapeHtml(toolMatch[2]);
    const argClass = BASH_TOOLS.has(toolMatch[1]) ? "log-cmd" : "log-path";
    return `<div class="log-line">${ts}<span class="log-tool">[Tool: ${toolName}]</span> <span class="${argClass}">${args}</span></div>`;
  }

  if (TODO_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-todo">${ts}${rest}</span></div>`;
  }

  if (TODO_WRITE_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-todo-create">${ts}${rest}</span></div>`;
  }

  if (SESSION_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-session">${ts}${rest}</span></div>`;
  }

  if (ERROR_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-error">${ts}${rest}</span></div>`;
  }

  if (VERIFY_FAIL_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-error">${ts}${rest}</span></div>`;
  }

  if (REFACTOR_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-refactor">${ts}${rest}</span></div>`;
  }

  if (WARN_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-warn">${ts}${rest}</span></div>`;
  }

  if (SUCCESS_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-success">${ts}${rest}</span></div>`;
  }

  return `<div class="log-line">${ts}${rest}</div>`;
}
