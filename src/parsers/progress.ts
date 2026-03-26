import type {
  PhaseStatus,
  PhaseDependency,
  PhaseState,
  ProgressState,
} from "../types";

const VALID_STATUSES = new Set<PhaseStatus>([
  "pending",
  "completed",
  "in_progress",
  "failed",
]);

// Match "### [any emoji/text] Phase N[.N]: Title"
const PHASE_HEADER_RE =
  /^###\s+.*?Phase\s+(\d+(?:\.\d+)?)\s*:\s*(.+)$/;

const DEP_PHASE_RE = /Phase\s+(\d+(?:\.\d+)?)\s*(✅|⏳|❌|🔄)?/g;

const EMOJI_STATUS: Record<string, PhaseStatus> = {
  "✅": "completed",
  "⏳": "pending",
  "❌": "failed",
  "🔄": "in_progress",
};

function parseDependencies(line: string): PhaseDependency[] {
  const deps: PhaseDependency[] = [];
  let match: RegExpExecArray | null;
  while ((match = DEP_PHASE_RE.exec(line)) !== null) {
    const rawNum = match[1];
    const emoji = match[2];
    deps.push({
      phaseNumber: rawNum.includes(".") ? rawNum : Number(rawNum),
      status: emoji ? (EMOJI_STATUS[emoji] ?? "unknown") : "unknown",
    });
  }
  return deps;
}

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
      } else if (trimmed.startsWith("Depends on:")) {
        const deps = parseDependencies(trimmed);
        if (deps.length > 0) {
          current.dependencies = deps;
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
