import type { PlanPhase, PlanState } from "../types";

// Match "## Phase N[.N]: Title" or "### Phase N[.N]: Title" (with optional prefix text/emoji)
const PHASE_HEADER_RE =
  /^#{2,3}\s+.*?Phase\s+(\d+(?:\.\d+)?)\s*:\s*(.+)$/;

const STATUS_RE = /\[status:\s*([^\]]+)\]/i;

const DEPENDS_RE = /^\*\*Depends on:\*\*\s*(.+)$/;

const DEP_ITEM_RE = /Phase\s+(\d+(?:\.\d+)?)/g;

function emptyState(): PlanState {
  return { phases: [] };
}

export function parsePlan(content: string): PlanState {
  try {
    if (!content?.trim()) {
      return emptyState();
    }

    const lines = content.split("\n");
    const phases: PlanPhase[] = [];
    let current: PlanPhase | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(PHASE_HEADER_RE);

      if (headerMatch) {
        // Close previous phase
        if (current) {
          current.bodyEndLine = i - 1;
          phases.push(current);
        }

        const rawNum = headerMatch[1];
        current = {
          number: rawNum.includes(".") ? rawNum : Number(rawNum),
          title: headerMatch[2].trim(),
          headerLine: i,
          bodyEndLine: i, // will be updated
        };
        continue;
      }

      if (!current) continue;

      const trimmed = line.trim();

      const statusMatch = trimmed.match(STATUS_RE);
      if (statusMatch) {
        current.status = statusMatch[1].trim();
      }

      const depMatch = trimmed.match(DEPENDS_RE);
      if (depMatch) {
        const deps: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = DEP_ITEM_RE.exec(depMatch[1])) !== null) {
          deps.push(m[1]);
        }
        if (deps.length > 0) {
          current.dependencies = deps;
        }
      }
    }

    // Close last phase
    if (current) {
      current.bodyEndLine = lines.length - 1;
      phases.push(current);
    }

    return { phases };
  } catch {
    return emptyState();
  }
}
