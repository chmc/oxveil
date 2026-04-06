import type { PlanPhase } from "../types";
import { parsePlan } from "./plan";

export interface PlanPhaseWithDescription extends PlanPhase {
  description: string;
}

export interface PlanStateWithDescriptions {
  phases: PlanPhaseWithDescription[];
}

const STATUS_RE = /^\[status:\s*[^\]]+\]/i;
const DEPENDS_RE = /^\*\*Depends on:\*\*/;

export function parsePlanWithDescriptions(
  content: string
): PlanStateWithDescriptions {
  const base = parsePlan(content);
  if (base.phases.length === 0) {
    return { phases: [] };
  }

  const lines = content.split("\n");

  const phases: PlanPhaseWithDescription[] = base.phases.map((phase) => {
    const bodyStart = phase.headerLine + 1;
    const bodyEnd = phase.bodyEndLine;

    const descLines: string[] = [];
    for (let i = bodyStart; i <= bodyEnd; i++) {
      const trimmed = lines[i].trim();
      if (STATUS_RE.test(trimmed)) continue;
      if (DEPENDS_RE.test(trimmed)) continue;
      descLines.push(trimmed);
    }

    // Trim leading and trailing blank lines
    while (descLines.length > 0 && descLines[0] === "") {
      descLines.shift();
    }
    while (descLines.length > 0 && descLines[descLines.length - 1] === "") {
      descLines.pop();
    }

    return {
      ...phase,
      description: descLines.join("\n"),
    };
  });

  return { phases };
}
