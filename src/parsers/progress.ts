import type {
  PhaseStatus,
  PhaseDependency,
  PhaseState,
  ProgressState,
  SubStepState,
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

const SUBSTEP_STATUS_RE = /^(Verify|Refactor):\s*(\w+)/;
const SUBSTEP_ATTEMPTS_RE = /^(Verify|Refactor)\s+Attempts:\s*(\d+)/;

function buildSubSteps(
  phaseStatus: PhaseStatus,
  verifyStatus: string | undefined,
  verifyAttempts: number | undefined,
  refactorStatus: string | undefined,
  refactorAttempts: number | undefined,
): SubStepState[] | undefined {
  // No sub-steps for pending phases
  if (phaseStatus === "pending") return undefined;

  const subSteps: SubStepState[] = [];

  // Implement is always first — completed if we have any verify/refactor, else in_progress
  const implementStatus: PhaseStatus =
    verifyStatus || refactorStatus
      ? "completed"
      : phaseStatus === "in_progress"
        ? "in_progress"
        : "completed";
  subSteps.push({ name: "implement", status: implementStatus });

  // Add verify if present
  if (verifyStatus && VALID_STATUSES.has(verifyStatus as PhaseStatus)) {
    const step: SubStepState = {
      name: "verify",
      status: verifyStatus as PhaseStatus,
    };
    if (verifyAttempts && verifyAttempts > 1) step.attempts = verifyAttempts;
    subSteps.push(step);
  }

  // Add refactor if present
  if (refactorStatus && VALID_STATUSES.has(refactorStatus as PhaseStatus)) {
    const step: SubStepState = {
      name: "refactor",
      status: refactorStatus as PhaseStatus,
    };
    if (refactorAttempts && refactorAttempts > 1) step.attempts = refactorAttempts;
    subSteps.push(step);
  }

  return subSteps.length > 1 ? subSteps : undefined;
}

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

const STATUS_EMOJI: Record<string, string> = {
  completed: "✅",
  pending: "⏳",
  failed: "❌",
  in_progress: "🔄",
};

export function serializeProgress(state: ProgressState): string {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const completed = state.phases.filter((p) => p.status === "completed").length;
  const inProgress = state.phases.filter((p) => p.status === "in_progress").length;
  const pending = state.phases.filter((p) => p.status === "pending").length;
  const failed = state.phases.filter((p) => p.status === "failed").length;

  const lines: string[] = [
    "# Progress for PLAN.md",
    `Last updated: ${now}`,
    "",
    "## Status Summary",
    `- Total phases: ${state.phases.length}`,
    `- Completed: ${completed}`,
    `- In progress: ${inProgress}`,
    `- Pending: ${pending}`,
    `- Failed: ${failed}`,
    "",
    "## Phase Details",
    "",
  ];

  for (const phase of state.phases) {
    const emoji = STATUS_EMOJI[phase.status] ?? "⏳";
    lines.push(`### ${emoji} Phase ${phase.number}: ${phase.title}`);
    lines.push(`Status: ${phase.status}`);
    if (phase.started) lines.push(`Started: ${phase.started}`);
    if (phase.completed) lines.push(`Completed: ${phase.completed}`);
    if (phase.attempts !== undefined) lines.push(`Attempts: ${phase.attempts}`);
    if (phase.dependencies?.length) {
      const depStr = phase.dependencies
        .map((d) => {
          const e = STATUS_EMOJI[d.status] ?? "";
          return `Phase ${d.phaseNumber}${e ? ` ${e}` : ""}`;
        })
        .join(", ");
      lines.push(`Depends on: ${depStr}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function parseProgress(content: string): ProgressState {
  try {
    if (!content || !content.includes("## Phase Details")) {
      return emptyState();
    }

    const lines = content.split("\n");
    const phases: PhaseState[] = [];
    let current: Partial<PhaseState> | null = null;

    // Sub-step tracking
    let verifyStatus: string | undefined;
    let verifyAttempts: number | undefined;
    let refactorStatus: string | undefined;
    let refactorAttempts: number | undefined;

    for (const line of lines) {
      const headerMatch = line.match(PHASE_HEADER_RE);
      if (headerMatch) {
        // Push previous phase if valid
        if (current?.status) {
          current.subSteps = buildSubSteps(
            current.status,
            verifyStatus,
            verifyAttempts,
            refactorStatus,
            refactorAttempts,
          );
          phases.push(current as PhaseState);
        }
        const rawNum = headerMatch[1];
        current = {
          number: rawNum.includes(".") ? rawNum : Number(rawNum),
          title: headerMatch[2].trim(),
        };
        // Reset substep vars for new phase
        verifyStatus = undefined;
        verifyAttempts = undefined;
        refactorStatus = undefined;
        refactorAttempts = undefined;
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
      } else {
        // Parse Verify/Refactor status lines
        const substepMatch = trimmed.match(SUBSTEP_STATUS_RE);
        if (substepMatch) {
          const [, field, val] = substepMatch;
          if (field === "Verify") verifyStatus = val;
          else if (field === "Refactor") refactorStatus = val;
        }

        // Parse Verify/Refactor attempts lines
        const attemptsMatch = trimmed.match(SUBSTEP_ATTEMPTS_RE);
        if (attemptsMatch) {
          const [, field, val] = attemptsMatch;
          const n = parseInt(val, 10);
          if (!isNaN(n)) {
            if (field === "Verify") verifyAttempts = n;
            else if (field === "Refactor") refactorAttempts = n;
          }
        }
      }
    }

    // Push last phase
    if (current?.status) {
      current.subSteps = buildSubSteps(
        current.status,
        verifyStatus,
        verifyAttempts,
        refactorStatus,
        refactorAttempts,
      );
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
