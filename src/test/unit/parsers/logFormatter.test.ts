import { describe, it, expect } from "vitest";
import { formatLogLine } from "../../../parsers/logFormatter";

describe("formatLogLine", () => {
  it("formats timestamp", () => {
    const html = formatLogLine("[14:31:02] hello");
    expect(html).toContain('<span class="log-ts">[14:31:02]</span>');
  });

  it("formats tool call with path", () => {
    const html = formatLogLine("  [14:31:02] [Tool: Read] src/foo.ts");
    expect(html).toContain('<span class="log-tool">[Tool: Read]</span>');
    expect(html).toContain('<span class="log-path">src/foo.ts</span>');
  });

  it("formats tool call with command", () => {
    const html = formatLogLine('  [14:31:08] [Tool: Bash] npm test');
    expect(html).toContain('<span class="log-tool">[Tool: Bash]</span>');
    expect(html).toContain('<span class="log-cmd">');
  });

  it("formats phase header", () => {
    const html = formatLogLine("[14:00:17] ▶ Executing Phase 3/5: Write tests");
    expect(html).toContain('class="log-phase-header"');
  });

  it("formats todo update", () => {
    const html = formatLogLine('[14:01:51] [Todos: 4/7 done] ▸ "Writing test"');
    expect(html).toContain('class="log-todo"');
  });

  it("formats TodoWrite", () => {
    const html = formatLogLine("[14:01:51] [TodoWrite] 9 items");
    expect(html).toContain('class="log-todo-create"');
  });

  it("formats warning", () => {
    expect(formatLogLine("[14:00:03] ⚠ Plan exists")).toContain(
      'class="log-warn"',
    );
  });

  it("formats success", () => {
    expect(formatLogLine("[14:42:18] ✓ Saved")).toContain(
      'class="log-success"',
    );
  });

  it("formats session summary", () => {
    expect(
      formatLogLine("[14:09:10] [Session: cost=$0.12 duration=3m]"),
    ).toContain('class="log-session"');
  });

  it("formats error result", () => {
    expect(
      formatLogLine(
        "[14:00:47] [Result [error]: 204 chars] Error: too large",
      ),
    ).toContain('class="log-error"');
  });

  it("formats divider", () => {
    expect(formatLogLine("[14:00:17] ───────────────────")).toContain(
      'class="log-divider"',
    );
  });

  it("formats refactor", () => {
    expect(
      formatLogLine("[14:33:10] 🔧 Refactoring phase 17..."),
    ).toContain('class="log-refactor"');
  });

  it("escapes HTML", () => {
    const html = formatLogLine("[14:00:00] <script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
  });

  it("handles empty line", () => {
    expect(formatLogLine("")).toBe('<div class="log-line">&nbsp;</div>');
  });

  it("formats verification passed line", () => {
    const result = formatLogLine("  [14:33:12] ✓ Verification passed");
    expect(result).toContain('class="log-success"');
    expect(result).toContain("Verification passed");
  });

  it("formats verification failed line", () => {
    const result = formatLogLine("  [14:33:12] ✗ Verification failed");
    expect(result).toContain('class="log-error"');
    expect(result).toContain("Verification failed");
  });

  it("formats retry separator line", () => {
    const result = formatLogLine("  [14:33:18] ───── Retry with feedback ─────");
    expect(result).toContain('class="log-divider"');
  });
});
