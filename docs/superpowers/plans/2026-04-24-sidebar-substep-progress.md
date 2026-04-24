# Sidebar Sub-step Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show verify/refactor sub-step progress within each phase in the sidebar so users know what Oxveil is doing.

**Architecture:** Parse sub-step state (Verify/Refactor status and attempts) from PROGRESS.md, map to PhaseView, render as a second line below each phase title using arrow sequence notation.

**Tech Stack:** TypeScript, Vitest, VS Code webview

**Spec:** `docs/superpowers/specs/2026-04-24-sidebar-substep-progress-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types.ts` | Add `SubStepState` interface |
| `src/parsers/progress.ts` | Parse Verify/Refactor fields from PROGRESS.md |
| `src/views/sidebarState.ts` | Add `SubStepView`, extend `mapPhases()` |
| `src/views/sidebarPhaseHelpers.ts` | Add `renderSubSteps()`, update phase row HTML |
| `src/views/sidebarStyles.ts` | Add sub-step CSS classes |
| `test/fixtures/mock-substeps/PROGRESS.md` | Test fixture with sub-step data |
| `docs/workflow/states.md` | Document sub-step types and data flow |

---

### Task 1: Add SubStepState Type

**Files:**
- Modify: `src/types.ts:15-30`

- [ ] **Step 1: Write failing test for SubStepState type existence**

```typescript
// src/test/unit/types.test.ts (new file)
import { describe, it, expect } from "vitest";
import type { SubStepState, PhaseState } from "../../types";

describe("SubStepState", () => {
  it("can be assigned to PhaseState.subSteps", () => {
    const subSteps: SubStepState[] = [
      { name: "implement", status: "completed" },
      { name: "verify", status: "in_progress", attempts: 2 },
      { name: "refactor", status: "pending" },
    ];
    const phase: PhaseState = {
      number: 1,
      title: "Test",
      status: "in_progress",
      subSteps,
    };
    expect(phase.subSteps).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/unit/types.test.ts`
Expected: FAIL with type error — `SubStepState` and `PhaseState.subSteps` don't exist

- [ ] **Step 3: Add SubStepState type and extend PhaseState**

```typescript
// Add after PhaseStatus type (around line 15) in src/types.ts:

export type SubStepName = "implement" | "verify" | "refactor";

export interface SubStepState {
  name: SubStepName;
  status: PhaseStatus;
  attempts?: number;
}

// Extend PhaseState interface (around line 22-30):
export interface PhaseState {
  number: number | string;
  title: string;
  status: PhaseStatus;
  attempts?: number;
  started?: string;
  completed?: string;
  dependencies?: PhaseDependency[];
  subSteps?: SubStepState[];  // NEW
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/unit/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/test/unit/types.test.ts
git commit -m "feat(types): add SubStepState interface for sub-step tracking"
```

---

### Task 2: Create Test Fixture with Sub-step Data

**Files:**
- Create: `test/fixtures/mock-substeps/PROGRESS.md`

- [ ] **Step 1: Create fixture directory**

Run: `mkdir -p test/fixtures/mock-substeps`

- [ ] **Step 2: Create PROGRESS.md fixture with sub-step fields**

```markdown
# Progress for plan.md
Last updated: 2026-04-24 10:00:00

## Status Summary
- Total phases: 3
- Completed: 1
- In Progress: 1
- Failed: 0
- Pending: 1

## Phase Details

### ✅ Phase 1: Setup project
Status: completed
Started: 2026-04-24 10:00:00
Completed: 2026-04-24 10:05:00
Attempts: 1
Verify: completed
Verify Attempts: 1
Refactor: completed
Refactor Attempts: 1

### 🔄 Phase 2: Core implementation
Status: in_progress
Started: 2026-04-24 10:05:00
Attempts: 1
Verify: in_progress
Verify Attempts: 2

### ⏳ Phase 3: Final touches
Status: pending
```

- [ ] **Step 3: Commit fixture**

```bash
git add test/fixtures/mock-substeps/PROGRESS.md
git commit -m "test(fixtures): add mock-substeps fixture with verify/refactor data"
```

---

### Task 3: Parse Sub-step Data from PROGRESS.md

**Files:**
- Modify: `src/parsers/progress.ts:70-98`
- Modify: `src/test/unit/parsers/progress.test.ts`

- [ ] **Step 1: Write failing test for sub-step parsing**

```typescript
// Add to src/test/unit/parsers/progress.test.ts, new describe block:

describe("sub-step parsing", () => {
  it("extracts Verify and Refactor status from completed phase", () => {
    const content = readFixture("mock-substeps");
    const result = parseProgress(content);
    
    expect(result.phases[0].subSteps).toEqual([
      { name: "implement", status: "completed" },
      { name: "verify", status: "completed", attempts: 1 },
      { name: "refactor", status: "completed", attempts: 1 },
    ]);
  });

  it("extracts Verify in_progress with attempts", () => {
    const content = readFixture("mock-substeps");
    const result = parseProgress(content);
    
    expect(result.phases[1].subSteps).toEqual([
      { name: "implement", status: "completed" },
      { name: "verify", status: "in_progress", attempts: 2 },
    ]);
  });

  it("returns undefined subSteps for pending phases", () => {
    const content = readFixture("mock-substeps");
    const result = parseProgress(content);
    
    expect(result.phases[2].subSteps).toBeUndefined();
  });

  it("omits attempts field when value is 1", () => {
    const content = readFixture("mock-substeps");
    const result = parseProgress(content);
    
    // Phase 1 verify has 1 attempt — should not include attempts field
    const verify = result.phases[0].subSteps?.find(s => s.name === "verify");
    expect(verify?.attempts).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/unit/parsers/progress.test.ts -t "sub-step parsing"`
Expected: FAIL — `subSteps` is undefined

- [ ] **Step 3: Implement sub-step parsing in progress.ts**

```typescript
// Add constants after existing ones (around line 20):
const SUBSTEP_STATUS_RE = /^(Verify|Refactor):\s*(\w+)/;
const SUBSTEP_ATTEMPTS_RE = /^(Verify|Refactor)\s+Attempts:\s*(\d+)/;

// Add helper function after parseDependencies():
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
  const implementStatus: PhaseStatus = verifyStatus || refactorStatus 
    ? "completed" 
    : phaseStatus === "in_progress" ? "in_progress" : "completed";
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

// Update parseProgress() to track verify/refactor state:
// Add these variables inside the parsing loop (after current declaration):
let verifyStatus: string | undefined;
let verifyAttempts: number | undefined;
let refactorStatus: string | undefined;
let refactorAttempts: number | undefined;

// Add parsing for Verify/Refactor lines inside the loop:
const substepMatch = trimmed.match(SUBSTEP_STATUS_RE);
if (substepMatch) {
  const [, field, val] = substepMatch;
  if (field === "Verify") verifyStatus = val;
  else if (field === "Refactor") refactorStatus = val;
}

const attemptsMatch = trimmed.match(SUBSTEP_ATTEMPTS_RE);
if (attemptsMatch) {
  const [, field, val] = attemptsMatch;
  const n = parseInt(val, 10);
  if (!isNaN(n)) {
    if (field === "Verify") verifyAttempts = n;
    else if (field === "Refactor") refactorAttempts = n;
  }
}

// When pushing phase, add subSteps:
if (current?.status) {
  current.subSteps = buildSubSteps(
    current.status,
    verifyStatus, verifyAttempts,
    refactorStatus, refactorAttempts,
  );
  phases.push(current as PhaseState);
}

// Reset substep vars when starting new phase (after headerMatch block):
verifyStatus = undefined;
verifyAttempts = undefined;
refactorStatus = undefined;
refactorAttempts = undefined;
```

- [ ] **Step 4: Update import in progress.ts**

```typescript
// Update import at top of file:
import type {
  PhaseStatus,
  PhaseDependency,
  PhaseState,
  ProgressState,
  SubStepState,  // ADD
} from "../types";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/test/unit/parsers/progress.test.ts -t "sub-step parsing"`
Expected: PASS

- [ ] **Step 6: Run all progress tests to check for regressions**

Run: `npm test -- src/test/unit/parsers/progress.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/parsers/progress.ts src/test/unit/parsers/progress.test.ts
git commit -m "feat(parser): extract verify/refactor sub-steps from PROGRESS.md"
```

---

### Task 4: Add SubStepView and Update mapPhases()

**Files:**
- Modify: `src/views/sidebarState.ts:45-52, 118-130`
- Modify: `src/test/unit/views/sidebarState.test.ts`

- [ ] **Step 1: Write failing test for SubStepView mapping**

```typescript
// Add to src/test/unit/views/sidebarState.test.ts, new describe block:

describe("mapPhases with subSteps", () => {
  it("maps SubStepState to SubStepView", () => {
    const result = mapPhases([{
      number: 1,
      title: "Setup",
      status: "completed",
      subSteps: [
        { name: "implement", status: "completed" },
        { name: "verify", status: "completed", attempts: 2 },
        { name: "refactor", status: "completed" },
      ],
    }]);
    
    expect(result[0].subSteps).toEqual([
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "completed", attempts: 2 },
      { name: "Refactor", status: "completed" },
    ]);
  });

  it("capitalizes sub-step names", () => {
    const result = mapPhases([{
      number: 1,
      title: "Test",
      status: "in_progress",
      subSteps: [{ name: "implement", status: "in_progress" }],
    }]);
    
    expect(result[0].subSteps?.[0].name).toBe("Implement");
  });

  it("preserves attempts only when > 1", () => {
    const result = mapPhases([{
      number: 1,
      title: "Test",
      status: "completed",
      subSteps: [
        { name: "verify", status: "completed", attempts: 1 },
        { name: "refactor", status: "completed", attempts: 3 },
      ],
    }]);
    
    expect(result[0].subSteps?.[0].attempts).toBeUndefined();
    expect(result[0].subSteps?.[1].attempts).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/unit/views/sidebarState.test.ts -t "mapPhases with subSteps"`
Expected: FAIL — `SubStepView` type doesn't exist, `subSteps` not mapped

- [ ] **Step 3: Add SubStepView interface**

```typescript
// Add after PhaseView interface (around line 52) in src/views/sidebarState.ts:

export interface SubStepView {
  name: string;  // Capitalized: "Implement", "Verify", "Refactor"
  status: PhaseStatus;
  attempts?: number;  // Only present when > 1
}
```

- [ ] **Step 4: Extend PhaseView with subSteps**

```typescript
// Update PhaseView interface:
export interface PhaseView {
  number: number | string;
  title: string;
  status: PhaseStatus;
  duration?: string;
  attempts?: number;
  subSteps?: SubStepView[];  // NEW
}
```

- [ ] **Step 5: Update mapPhases() to map sub-steps**

```typescript
// Update mapPhases function:
export function mapPhases(phases: PhaseState[]): PhaseView[] {
  return phases.map((p) => ({
    number: p.number,
    title: p.title,
    status: p.status,
    duration: p.started && p.completed
      ? formatDuration(
          new Date(p.completed).getTime() - new Date(p.started).getTime(),
        )
      : undefined,
    attempts: p.attempts,
    subSteps: p.subSteps?.map((s) => ({
      name: s.name.charAt(0).toUpperCase() + s.name.slice(1),
      status: s.status,
      attempts: s.attempts && s.attempts > 1 ? s.attempts : undefined,
    })),
  }));
}
```

- [ ] **Step 6: Update import to include SubStepState**

```typescript
// Update import at top of sidebarState.ts:
import type {
  DetectionStatus,
  SessionStatus,
  PhaseStatus,
  ProgressState,
  PhaseState,
  SubStepState,  // ADD
} from "../types";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- src/test/unit/views/sidebarState.test.ts -t "mapPhases with subSteps"`
Expected: PASS

- [ ] **Step 8: Run all sidebarState tests**

Run: `npm test -- src/test/unit/views/sidebarState.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/views/sidebarState.ts src/test/unit/views/sidebarState.test.ts
git commit -m "feat(sidebar): add SubStepView and map sub-steps in mapPhases()"
```

---

### Task 5: Add renderSubSteps() Function

**Files:**
- Modify: `src/views/sidebarPhaseHelpers.ts`
- Create: `src/test/unit/views/sidebarPhaseHelpers.test.ts`

- [ ] **Step 1: Write failing tests for renderSubSteps()**

```typescript
// Create src/test/unit/views/sidebarPhaseHelpers.test.ts:
import { describe, it, expect } from "vitest";
import { renderSubSteps } from "../../../views/sidebarPhaseHelpers";
import type { SubStepView } from "../../../views/sidebarState";

describe("renderSubSteps", () => {
  it("renders completed sub-steps with checkmark", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-done");
    expect(html).toContain("✓");
    expect(html).toContain("Implement");
  });

  it("renders in_progress sub-step with active class", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "in_progress" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-active");
    expect(html).toContain("Verifying");  // -ing suffix for in_progress
  });

  it("renders failed sub-step with X mark", () => {
    const subSteps: SubStepView[] = [
      { name: "Verify", status: "failed" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-failed");
    expect(html).toContain("✗");
  });

  it("renders pending sub-step with pending class", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "in_progress" },
      { name: "Refactor", status: "pending" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-pending");
    expect(html).toContain("Refactor");
  });

  it("shows attempts count when > 1", () => {
    const subSteps: SubStepView[] = [
      { name: "Verify", status: "in_progress", attempts: 2 },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("(2)");
  });

  it("omits attempts when 1 or undefined", () => {
    const subSteps: SubStepView[] = [
      { name: "Verify", status: "completed", attempts: 1 },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).not.toContain("(1)");
  });

  it("joins sub-steps with arrow separator", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "completed" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-arrow");
    expect(html).toContain("→");
  });

  it("returns empty string for empty array", () => {
    expect(renderSubSteps([])).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(renderSubSteps(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/unit/views/sidebarPhaseHelpers.test.ts`
Expected: FAIL — `renderSubSteps` doesn't exist

- [ ] **Step 3: Implement renderSubSteps()**

```typescript
// Add to src/views/sidebarPhaseHelpers.ts after existing imports:
import type { PhaseView, SubStepView } from "./sidebarState";

// Add new function after phaseStatusText():

export function renderSubSteps(subSteps: SubStepView[] | undefined): string {
  if (!subSteps || subSteps.length === 0) return "";
  
  const items = subSteps.map((s) => {
    let icon = "";
    let cssClass = "";
    let name = s.name;
    
    switch (s.status) {
      case "completed":
        icon = '<span class="substep-check">✓</span> ';
        cssClass = "substep-done";
        break;
      case "in_progress":
        cssClass = "substep-active";
        // Add -ing suffix for in_progress
        if (name === "Verify") name = "Verifying";
        else if (name === "Refactor") name = "Refactoring";
        else if (name === "Implement") name = "Implementing";
        break;
      case "failed":
        icon = '<span class="substep-x">✗</span> ';
        cssClass = "substep-failed";
        break;
      default:
        cssClass = "substep-pending";
    }
    
    const attempts = s.attempts && s.attempts > 1 ? ` (${s.attempts})` : "";
    return `<span class="${cssClass}">${icon}${escapeHtml(name)}${attempts}</span>`;
  });
  
  return items.join('<span class="substep-arrow"> → </span>');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/unit/views/sidebarPhaseHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/sidebarPhaseHelpers.ts src/test/unit/views/sidebarPhaseHelpers.test.ts
git commit -m "feat(sidebar): add renderSubSteps() for sub-step progress display"
```

---

### Task 6: Update Phase Row to Include Sub-steps

**Files:**
- Modify: `src/views/sidebarPhaseHelpers.ts:37-81`
- Modify: `src/test/unit/views/sidebarPhaseHelpers.test.ts`

- [ ] **Step 1: Write failing test for sub-steps in phase row**

```typescript
// Add to src/test/unit/views/sidebarPhaseHelpers.test.ts:
import { renderPhaseList } from "../../../views/sidebarPhaseHelpers";

describe("renderPhaseList with subSteps", () => {
  it("renders phase-substeps div when subSteps present", () => {
    const phases: PhaseView[] = [{
      number: 1,
      title: "Test",
      status: "in_progress",
      subSteps: [
        { name: "Implement", status: "completed" },
        { name: "Verify", status: "in_progress" },
      ],
    }];
    const html = renderPhaseList(phases);
    expect(html).toContain("phase-substeps");
    expect(html).toContain("Implement");
    expect(html).toContain("Verifying");
  });

  it("omits phase-substeps div when no subSteps", () => {
    const phases: PhaseView[] = [{
      number: 1,
      title: "Test",
      status: "pending",
    }];
    const html = renderPhaseList(phases);
    expect(html).not.toContain("phase-substeps");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/unit/views/sidebarPhaseHelpers.test.ts -t "renderPhaseList with subSteps"`
Expected: FAIL — phase-substeps not present

- [ ] **Step 3: Update renderPhaseList() to include sub-steps**

```typescript
// Update renderPhaseList() in sidebarPhaseHelpers.ts:
// After the title span, add sub-steps div:

const rows = phases.map((p, i) => {
  const num = escapeHtml(String(p.number));
  const title = escapeHtml(p.title);
  const duration = p.duration ? `<span class="phase-duration">${escapeHtml(p.duration)}</span>` : "";
  const attempts = p.attempts ? `<span class="phase-attempts">(attempt ${p.attempts})</span>` : "";
  const isPaused = isStopped && i === pausedIndex;
  const rowClass = [
    "phase-row",
    p.status === "in_progress" ? "active" : "",
    p.status === "completed" ? "done" : "",
    p.status === "failed" ? "error" : "",
    isPaused ? "paused" : "",
    p.status === "pending" && !isPaused ? "dim" : "",
  ].filter(Boolean).join(" ");

  const meta = (attempts || duration)
    ? `<div class="phase-meta">${attempts}${duration}</div>`
    : "";
  
  // NEW: Sub-steps line
  const subStepsHtml = renderSubSteps(p.subSteps);
  const subStepsDiv = subStepsHtml 
    ? `<div class="phase-substeps">${subStepsHtml}</div>` 
    : "";

  return `<div class="${rowClass}" data-phase="${num}">
  ${phaseStatusIcon(p.status, isPaused)}
  <span class="phase-num">${num}.</span>
  <div class="phase-body">
    <span class="phase-title">${title}</span>
    ${subStepsDiv}
    ${meta}
  </div>
</div>`;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/unit/views/sidebarPhaseHelpers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/sidebarPhaseHelpers.ts src/test/unit/views/sidebarPhaseHelpers.test.ts
git commit -m "feat(sidebar): integrate sub-steps into phase row rendering"
```

---

### Task 7: Add Sub-step CSS Styles

**Files:**
- Modify: `src/views/sidebarStyles.ts:114-116`

- [ ] **Step 1: Add sub-step CSS classes**

```typescript
// Add after .phase-attempts styles (around line 116) in sidebarStyles.ts:

/* Sub-step progress */
.phase-substeps {
  font-size: 10px;
  margin-top: 3px;
  color: var(--vscode-descriptionForeground, #888);
}
.substep-done { 
  color: var(--vscode-testing-iconPassed, #4ec9b0); 
  opacity: 0.7; 
}
.substep-active { 
  color: var(--vscode-progressBar-background, #569cd6); 
}
.substep-failed { 
  color: var(--vscode-errorForeground, #f44747); 
}
.substep-pending { 
  opacity: 0.4; 
}
.substep-arrow { 
  opacity: 0.4; 
  margin: 0 2px; 
}
.substep-check, .substep-x {
  margin-right: 2px;
}
```

- [ ] **Step 2: Run lint to verify CSS is valid**

Run: `npm run lint`
Expected: PASS (no new errors)

- [ ] **Step 3: Commit**

```bash
git add src/views/sidebarStyles.ts
git commit -m "style(sidebar): add CSS for sub-step progress display"
```

---

### Task 8: Update Documentation

**Files:**
- Modify: `docs/workflow/states.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Update docs/workflow/states.md with sub-step types**

Add new section after "Data Flow" explaining SubStepState/SubStepView types and the parsing flow.

- [ ] **Step 2: Update README.md features section**

Add "Sub-step Progress Visibility" to the features list with brief description.

- [ ] **Step 3: Update ARCHITECTURE.md sidebar section**

Add note about sub-step parsing from PROGRESS.md and rendering flow.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/workflow/states.md README.md ARCHITECTURE.md
git commit -m "docs: add sub-step progress visibility documentation"
```

---

### Task 9: Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Visual verification**

Action: `/visual-verification`

Acceptance criteria:
- Active phase shows sub-step line below title
- Completed phases show sub-step history with checkmarks
- Arrow separators between sub-steps
- Attempts count displayed when > 1
- Pending phases have no sub-step line
- Colors match design: green for done, blue for active, red for failed

- [ ] **Step 4: Test config variations**

Test with:
- verify enabled, refactor disabled
- verify disabled, refactor enabled
- both disabled (no sub-step line should appear)

---

### Task 10: Final Commit and PR

**Files:** None

- [ ] **Step 1: Create final commit if any uncommitted changes**

Run: `git status`
If changes exist, commit them.

- [ ] **Step 2: Push branch and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(sidebar): show sub-step progress visibility" --body "$(cat <<'EOF'
## Summary
- Adds sub-step visibility (Implement → Verify → Refactor) to sidebar phase rows
- Parses verify/refactor status from PROGRESS.md
- Shows attempt counts for retried sub-steps
- Persists sub-step history on completed phases

Closes #64

## Test plan
- [x] Unit tests for parser, mapPhases, renderSubSteps
- [x] Visual verification of sidebar display
- [x] Config variation testing (verify/refactor enable/disable)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
