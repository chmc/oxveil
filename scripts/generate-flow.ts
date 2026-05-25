#!/usr/bin/env tsx
/**
 * Generates docs/workflow/user-flows.md from source code.
 * Run: npm run generate:flow
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function parseSidebarViews(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "src/views/sidebarState.ts"), "utf-8");
  const match = src.match(/type SidebarView\s*=\s*([\s\S]*?);/);
  if (!match) throw new Error("SidebarView type not found in sidebarState.ts");
  const views: string[] = [];
  const re = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(match[1])) !== null) views.push(m[1]);
  return views;
}

function parseCommands(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "src/views/sidebarMessages.ts"), "utf-8");
  const match = src.match(/COMMAND_MAP[^=]*=\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error("COMMAND_MAP not found in sidebarMessages.ts");
  const cmds: string[] = [];
  const re = /(\w+):\s*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(match[1])) !== null) cmds.push(m[1]);
  return cmds;
}

// User journeys: manually authored, validated against parsed views
const JOURNEYS = [
  { id: "UJ-1", name: "First-time setup", path: ["not-found", "empty"], actions: ["install"] },
  { id: "UJ-2", name: "Create and execute plan", path: ["empty", "planning", "ready", "running", "completed"], actions: ["createPlan", "formPlan", "start", "(done)"] },
  { id: "UJ-3", name: "Handle failure", path: ["failed", "running", "completed"], actions: ["retry", "(done)"] },
  { id: "UJ-4", name: "Skip failed phase", path: ["failed", "running", "completed"], actions: ["skip", "(done)"] },
  { id: "UJ-5", name: "Resume stopped work", path: ["stopped", "running", "completed"], actions: ["resume", "(done)"] },
  { id: "UJ-6", name: "Self-improvement flow", path: ["completed", "self-improvement", "completed"], actions: ["(auto: lessons)", "skip"] },
  { id: "UJ-7", name: "Restart from scratch", path: ["completed", "empty"], actions: ["fullReset"] },
  { id: "UJ-8", name: "Cancel plan creation", path: ["planning", "empty"], actions: ["(terminal close)"] },
];

// Transitions for full state diagram — manually maintained, reflects sidebarState.ts logic
const TRANSITIONS: Array<{ from: string; to: string; action: string }> = [
  { from: "not-found", to: "empty", action: "install" },
  { from: "empty", to: "planning", action: "createPlan" },
  { from: "planning", to: "ready", action: "formPlan" },
  { from: "planning", to: "empty", action: "terminal close" },
  { from: "ready", to: "running", action: "start" },
  { from: "running", to: "completed", action: "all done" },
  { from: "running", to: "failed", action: "phase fails" },
  { from: "running", to: "stopped", action: "stop" },
  { from: "failed", to: "running", action: "retry" },
  { from: "failed", to: "running", action: "skip" },
  { from: "stopped", to: "running", action: "resume" },
  { from: "completed", to: "self-improvement", action: "lessons captured" },
  { from: "self-improvement", to: "completed", action: "skip/done" },
  { from: "completed", to: "empty", action: "fullReset" },
  { from: "failed", to: "empty", action: "fullReset" },
  { from: "stopped", to: "empty", action: "fullReset" },
];

function generateMermaid(): string {
  const lines = ["```mermaid", "flowchart TD"];
  for (const t of TRANSITIONS) {
    const fromId = t.from.replace(/-/g, "_");
    const toId = t.to.replace(/-/g, "_");
    const fromLabel = t.from.includes("-") ? `"${t.from}"` : t.from;
    const toLabel = t.to.includes("-") ? `"${t.to}"` : t.to;
    lines.push(`    ${fromId}[${fromLabel}] -->|${t.action}| ${toId}[${toLabel}]`);
  }
  lines.push("```");
  return lines.join("\n");
}

function generateJourneys(): string {
  const lines = ["## User Journeys", ""];
  for (const j of JOURNEYS) {
    lines.push(`### ${j.id}: ${j.name}`, "");
    lines.push("```");
    lines.push(j.path.map((p, i) => i === 0 ? `[${p}]` : `--${j.actions[i - 1]}--> [${p}]`).join(" "));
    lines.push("```", "");
  }
  return lines.join("\n");
}

function generate(views: string[]): string {
  return `---
title: Oxveil User Flows
generated: true
source: scripts/generate-flow.ts
views: ${JSON.stringify(views)}
---

# User Flows

Generated from source. Do not edit manually — regenerate: \`npm run generate:flow\`

${generateJourneys()}
## Full State Diagram

${generateMermaid()}

## Views

${views.map((v) => `- \`${v}\``).join("\n")}
`;
}

// Main
const views = parseSidebarViews();
const commands = parseCommands();
console.log(`Parsed ${views.length} views: ${views.join(", ")}`);
console.log(`Parsed ${commands.length} commands`);

const outPath = path.resolve(ROOT, "docs/workflow/user-flows.md");
fs.writeFileSync(outPath, generate(views));
console.log(`Generated ${outPath}`);
