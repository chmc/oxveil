import type { PhaseStatus, PhaseState, ProgressState } from "../types";

const VALID_STATUSES = new Set<PhaseStatus>([
  "pending",
  "completed",
  "in_progress",
  "failed",
]);

// Match "### [any emoji/text] Phase N[.N]: Title"
const PHASE_HEADER_RE =
  /^###\s+.*?Phase\s+(\d+(?:\.\d+)?)\s*:\s*(.+)$/;

function emptyState(): ProgressState {
  return { phases: [], totalPhases: 0 };
}

export function parseProgress(content: string): ProgressState {
  try {
    if (!content || !content.includes("## Phase Details")) {
      return emptyState();
    }

    const lines = content.split("\n");
    const phases: PhaseState[] = [];
    let current: Partial<PhaseState> | null = null;

    for (const line of lines) {
      const headerMatch = line.match(PHASE_HEADER_RE);
      if (headerMatch) {
        // Push previous phase if valid
        if (current?.status) {
          phases.push(current as PhaseState);
        }
        const rawNum = headerMatch[1];
        current = {
          number: rawNum.includes(".") ? rawNum : Number(rawNum),
          title: headerMatch[2].trim(),
        };
        continue;
      }

      if (!current) continue;

      const trimmed = line.trim();

      if (trimmed.startsWith("Status:")) {
        const val = trimmed.slice(7).trim();
        if (VALID_STATUSES.has(val as PhaseStatus)) {
          current.status = val as PhaseStatus;
        } else {
          // Invalid status — discard this phase
          current = null;
        }
      } else if (/^Started:/.test(trimmed) && !/^Attempt\s/.test(trimmed)) {
        current.started = trimmed.slice(8).trim();
      } else if (trimmed.startsWith("Completed:")) {
        current.completed = trimmed.slice(10).trim();
      } else if (trimmed.startsWith("Attempts:")) {
        const n = parseInt(trimmed.slice(9).trim(), 10);
        if (!isNaN(n)) {
          current.attempts = n;
        }
      }
    }

    // Push last phase
    if (current?.status) {
      phases.push(current as PhaseState);
    }

    const currentPhaseIndex = phases.findIndex(
      (p) => p.status === "in_progress"
    );

    return {
      phases,
      totalPhases: phases.length,
      currentPhaseIndex: currentPhaseIndex >= 0 ? currentPhaseIndex : undefined,
    };
  } catch {
    return emptyState();
  }
}
