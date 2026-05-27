import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";

export interface PlanInterceptResult {
  action: "execute" | "critics" | "skip";
  feedback: string;
}

interface InterceptItem extends vscode.QuickPickItem {
  action: PlanInterceptResult["action"];
}

const ITEMS: InterceptItem[] = [
  {
    label: "Execute with Oxveil orchestration",
    action: "execute",
  },
  {
    label: "Run critic agents first",
    action: "critics",
  },
  {
    label: "Skip (continue in Claude)",
    action: "skip",
  },
];

const TIMEOUT_MS = 30_000;

export async function showPlanExitPicker(
  workspaceRoot: string,
  uuid: string,
): Promise<void> {
  const responseFile = path.join(workspaceRoot, ".claude", `plan-intercept-response-${uuid}.json`);

  const result = await runPicker();

  if (result === null) {
    // Timed out — caller detects absence of file; status bar message already shown
    return;
  }

  await writeAtomic(responseFile, result);
}

function runPicker(): Promise<PlanInterceptResult | null> {
  return new Promise((resolve) => {
    const qp = vscode.window.createQuickPick<InterceptItem>();
    qp.items = ITEMS;
    qp.placeholder = "Tell Claude what to change...";
    qp.ignoreFocusOut = true;

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      qp.dispose();
      resolve(null);
    }, TIMEOUT_MS);

    qp.onDidAccept(() => {
      if (settled) return;
      const [selected] = qp.selectedItems;
      if (!selected) return;
      settled = true;
      clearTimeout(timer);
      qp.dispose();
      resolve({ action: selected.action, feedback: qp.value });
    });

    qp.onDidHide(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      qp.dispose();
      resolve(null);
    });

    qp.show();
  });
}

async function writeAtomic(dest: string, result: PlanInterceptResult): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = path.join(os.tmpdir(), `oxveil-intercept-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(result), "utf8");
  await fs.rename(tmp, dest);
}
