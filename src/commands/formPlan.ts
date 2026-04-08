import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { stat } from "node:fs/promises";
import * as os from "node:os";
import { pickGranularity } from "./granularityPicker";
import type { IProcessManager } from "../core/interfaces";

type PlanFileCategory = "implementation" | "design" | "plan";

interface PlanCandidate {
  path: string;
  category: PlanFileCategory;
  mtimeMs: number;
}

interface CandidateQuickPickItem extends vscode.QuickPickItem {
  candidate?: PlanCandidate;
  isBrowse?: boolean;
}

export interface FormPlanCommandDeps {
  resolveFolder: () => Promise<
    | { workspaceRoot: string; processManager: IProcessManager }
    | undefined
  >;
}

const CATEGORY_LABELS: Record<PlanFileCategory, string> = {
  implementation: "Implementation",
  design: "Design",
  plan: "Plan",
};

async function gatherCandidates(
  workspaceRoot: string,
): Promise<PlanCandidate[]> {
  const sources: Array<{ dir: string; category: PlanFileCategory }> = [
    {
      dir: path.join(workspaceRoot, "docs", "superpowers", "plans"),
      category: "implementation",
    },
    {
      dir: path.join(workspaceRoot, "docs", "superpowers", "specs"),
      category: "design",
    },
    { dir: path.join(os.homedir(), ".claude", "plans"), category: "plan" },
  ];

  const results: PlanCandidate[] = [];
  for (const { dir, category } of sources) {
    try {
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const s = await stat(fullPath);
        results.push({ path: fullPath, category, mtimeMs: s.mtimeMs });
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  // Sort newest first
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

function buildQuickPickItems(
  candidates: PlanCandidate[],
): CandidateQuickPickItem[] {
  const items: CandidateQuickPickItem[] = candidates.map((c) => ({
    label: path.basename(c.path),
    description: CATEGORY_LABELS[c.category],
    detail: c.path,
    candidate: c,
    picked: c === candidates.find((x) => x.category === "implementation"),
  }));

  items.push({
    label: "$(folder-opened) Browse...",
    description: "Select a markdown file from disk",
    isBrowse: true,
  });

  return items;
}

export function concatenateFiles(
  files: Array<{ path: string; category: string; content: string }>,
): string {
  if (files.length === 1) {
    return files[0].content;
  }

  return files
    .map(
      (f) =>
        `# Source: ${f.category} — ${path.basename(f.path)}\n\n${f.content}`,
    )
    .join("\n\n---\n\n");
}

export function registerFormPlanCommand(
  deps: FormPlanCommandDeps,
): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.formPlan", async () => {
    const resolved = await deps.resolveFolder();
    if (!resolved) {
      vscode.window.showWarningMessage("Oxveil: No workspace open");
      return;
    }

    const { workspaceRoot, processManager } = resolved;

    // Gather candidates
    const candidates = await gatherCandidates(workspaceRoot);
    const items = buildQuickPickItems(candidates);

    if (candidates.length === 0) {
      // Only Browse... is available — still show it
    }

    // Show multi-select picker
    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: "Select plan files to form into a claudeloop plan...",
    });
    if (!selected || selected.length === 0) return;

    // Handle Browse... selection
    const filesToRead: Array<{
      path: string;
      category: string;
    }> = [];

    for (const item of selected) {
      if (item.isBrowse) {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          filters: { Markdown: ["md"] },
          openLabel: "Select Plan Files",
        });
        if (uris) {
          for (const uri of uris) {
            filesToRead.push({ path: uri.fsPath, category: "File" });
          }
        }
      } else if (item.candidate) {
        filesToRead.push({
          path: item.candidate.path,
          category: CATEGORY_LABELS[item.candidate.category],
        });
      }
    }

    if (filesToRead.length === 0) return;

    // Read all selected files
    const fileContents: Array<{
      path: string;
      category: string;
      content: string;
    }> = [];
    for (const f of filesToRead) {
      try {
        const content = await fs.readFile(f.path, "utf-8");
        fileContents.push({ ...f, content });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(
          `Oxveil: Failed to read ${path.basename(f.path)} — ${msg}`,
        );
        return;
      }
    }

    // Concatenate
    const planContent = concatenateFiles(fileContents);

    // Check for existing PLAN.md
    const planPath = path.join(workspaceRoot, "PLAN.md");
    try {
      await fs.access(planPath);
      const confirm = await vscode.window.showWarningMessage(
        "PLAN.md already exists. Replace?",
        { modal: true },
        "Replace",
      );
      if (confirm !== "Replace") return;
    } catch {
      // File doesn't exist — proceed
    }

    // Write PLAN.md
    await fs.writeFile(planPath, planContent, "utf-8");
    await vscode.commands.executeCommand(
      "setContext",
      "oxveil.walkthrough.hasPlan",
      true,
    );

    // Pick granularity for ai-parse
    const granularity = await pickGranularity();
    if (!granularity) {
      // User cancelled — still open the raw plan
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(planPath),
      );
      await vscode.window.showTextDocument(doc);
      return;
    }

    // Run ai-parse
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Forming claudeloop plan...",
        },
        () => processManager.aiParse(granularity),
      );

      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(planPath),
      );
      await vscode.window.showTextDocument(doc);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const action = await vscode.window.showErrorMessage(
        `Oxveil: Failed to form plan — ${msg}`,
        "View Output",
      );
      if (action === "View Output") {
        vscode.commands.executeCommand(
          "workbench.action.output.toggleOutput",
        );
      }
    }
  });
}
