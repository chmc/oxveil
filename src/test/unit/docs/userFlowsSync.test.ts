import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../../../");
const FLOWS_PATH = path.join(ROOT, "docs/workflow/user-flows.md");
const SIDEBAR_STATE_PATH = path.join(ROOT, "src/views/sidebarState.ts");

function parseSidebarViews(): string[] {
  const src = fs.readFileSync(SIDEBAR_STATE_PATH, "utf-8");
  const match = src.match(/type SidebarView\s*=\s*([\s\S]*?);/);
  if (!match) throw new Error("SidebarView type not found");
  const views: string[] = [];
  const re = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(match[1])) !== null) views.push(m[1]);
  return views.sort();
}

describe("docs/workflow/user-flows.md sync", () => {
  it("exists and is generated", () => {
    expect(fs.existsSync(FLOWS_PATH)).toBe(true);
    const content = fs.readFileSync(FLOWS_PATH, "utf-8");
    expect(content).toContain("generated: true");
  });

  it("contains all SidebarView values from source", () => {
    const sourceViews = parseSidebarViews();
    const content = fs.readFileSync(FLOWS_PATH, "utf-8");
    for (const view of sourceViews) {
      expect(content, `Missing view: ${view} — run npm run generate:flow`).toContain(view);
    }
  });

  it("views frontmatter matches SidebarView source", () => {
    const sourceViews = parseSidebarViews();
    const content = fs.readFileSync(FLOWS_PATH, "utf-8");
    const frontmatterMatch = content.match(/^views: (\[.*?\])/m);
    expect(frontmatterMatch, "views frontmatter missing").toBeTruthy();
    const docViews = JSON.parse(frontmatterMatch![1]).sort() as string[];
    expect(docViews).toEqual(sourceViews);
  });

  it("has mermaid diagram", () => {
    const content = fs.readFileSync(FLOWS_PATH, "utf-8");
    expect(content).toContain("```mermaid");
    expect(content).toContain("flowchart TD");
  });

  it("has numbered user journeys", () => {
    const content = fs.readFileSync(FLOWS_PATH, "utf-8");
    expect(content).toContain("UJ-1:");
    expect(content).toContain("UJ-2:");
  });
});
