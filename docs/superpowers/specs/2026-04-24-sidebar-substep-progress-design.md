# Sidebar Sub-step Progress Visibility

**Issue:** [chmc/oxveil#64](https://github.com/chmc/oxveil/issues/64)  
**Date:** 2026-04-24  
**Status:** Approved

## Context

Users can configure Oxveil to run verification and refactoring after each phase implementation (`oxveil.verify`, `oxveil.refactor` settings). Currently these sub-steps are invisible in the sidebar — users only see the phase-level progress and don't know what Oxveil is doing within a phase or what's coming next.

This design adds sub-step visibility to the sidebar so users can see:
- Current activity within the active phase (Implementing → Verifying → Refactoring)
- Progress through configured sub-steps
- Retry counts when sub-steps require multiple attempts
- Completion status of sub-steps on finished phases

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sub-step location | Second line below phase title | Subtle, doesn't clutter primary info |
| Progress indicator | Arrow sequence (`Implement → Verify → Refactor`) | Shows full flow, highlights current step |
| Completed sub-step | Checkmark prefix + dimmed text | Clear completion signal |
| Failed sub-step | Red X prefix | Consistent with error styling |
| Retry display | Inline `(N)` suffix when attempts > 1 | Visible on any status |
| Config awareness | Only show enabled sub-steps | Matches user's actual workflow |
| Persistence | Sub-step line on completed phases too | Shows history + retry counts |
| Data source | Parse from PROGRESS.md | Single source of truth, persists across restarts |

## Visual Design

### Active Phase
```
↻ 2. Add sidebar header menu
   ✓ Implement → Verifying (2) → Refactor
   (attempt 1)
```

### Completed Phase
```
✓ 1. Register fullReset command
   ✓ Implement → ✓ Verify → ✓ Refactor
   (attempt 1) 3m 13s
```

### Failed Sub-step
```
↻ 2. Add sidebar header menu
   ✓ Implement → ✗ Verify (3) → Refactor
   (attempt 1)
```

### Config: Only Verify Enabled
```
↻ 2. Add sidebar header menu
   ✓ Implement → Verifying
```

### Pending Phase
```
○ 3. Wire sidebar message handler
```
(No sub-step line — steps not started)

## Data Model

### SubStepState (raw state in types.ts)
```typescript
interface SubStepState {
  name: 'implement' | 'verify' | 'refactor';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  attempts?: number;
}
```

### SubStepView (display-ready in sidebarState.ts)
```typescript
interface SubStepView {
  name: string;           // "Implement", "Verify", "Refactor"
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  attempts?: number;      // Show as "(N)" when > 1
}
```

### PhaseState Extension
```typescript
interface PhaseState {
  // ... existing fields
  subSteps?: SubStepState[];  // Present if verify/refactor enabled
}
```

### PhaseView Extension
```typescript
interface PhaseView {
  // ... existing fields
  subSteps?: SubStepView[];
}
```

## Parser Changes

### PROGRESS.md Format (claudeloop output)
```markdown
### ✅ Phase 2: Add sidebar header menu
Status: completed
Attempts: 2
Verify: completed
Verify Attempts: 3
Refactor: completed
```

### Extraction Logic (progress.ts)
1. Add regex patterns for `Verify:`, `Refactor:`, `Verify Attempts:`, `Refactor Attempts:`
2. Build `subSteps[]` array based on parsed values
3. Filter by config settings (skip disabled sub-steps)

### Sub-step Inference for Active Phase
| Parsed State | Inferred Current Sub-step |
|--------------|---------------------------|
| No Verify, no Refactor | Implementing |
| Verify: in_progress | Verifying |
| Verify: completed, no Refactor | Refactoring (if enabled) |
| Verify: failed | Verifying (failed) |
| Refactor: in_progress | Refactoring |

## Rendering Changes

### New Function: renderSubSteps()
Location: `src/views/sidebarPhaseHelpers.ts`

```typescript
function renderSubSteps(subSteps: SubStepView[]): string {
  // Returns HTML like:
  // <span class="substep-done">✓</span> <span class="substep-done">Implement</span>
  // <span class="substep-arrow">→</span>
  // <span class="substep-active">Verifying (2)</span>
  // <span class="substep-arrow">→</span>
  // <span class="substep-pending">Refactor</span>
}
```

### CSS Classes (sidebarStyles.ts)
```css
.phase-substeps {
  font-size: 10px;
  margin-top: 3px;
  color: var(--vscode-descriptionForeground);
}
.substep-done { color: #22c55e; opacity: 0.7; }
.substep-active { color: #3b82f6; }
.substep-failed { color: #ef4444; }
.substep-pending { opacity: 0.4; }
.substep-arrow { opacity: 0.4; margin: 0 4px; }
```

### Phase Row Update
In `renderPhaseList()`, add sub-step line after phase title when `phase.subSteps` exists:
```html
<div class="phase-row active">
  <span class="codicon codicon-sync phase-icon running"></span>
  <span class="phase-num">2.</span>
  <div class="phase-body">
    <span class="phase-title">Add sidebar header menu</span>
    <div class="phase-substeps">
      <!-- rendered sub-steps -->
    </div>
    <div class="phase-meta">
      <span class="phase-attempts">(attempt 1)</span>
    </div>
  </div>
</div>
```

## Data Flow

```
claudeloop writes PROGRESS.md
        ↓
watchers.ts detects change → onProgressChange
        ↓
progress.ts parses → ProgressState { phases: [{ subSteps: [...] }] }
        ↓
sessionWiring.ts calls mapPhases() → PhaseView[] with subSteps[]
        ↓
sidebarPhaseHelpers.ts renders → HTML with sub-step line
        ↓
sidebarPanel.ts posts progressUpdate message
        ↓
sidebarScript.ts updates #phase-list innerHTML
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/types.ts` | Add `SubStepState` interface, extend `PhaseState` |
| `src/parsers/progress.ts` | Extract verify/refactor status and attempts |
| `src/views/sidebarState.ts` | Add `SubStepView`, update `mapPhases()` |
| `src/views/sidebarPhaseHelpers.ts` | Add `renderSubSteps()`, update phase row HTML |
| `src/views/sidebarStyles.ts` | Add `.phase-substeps` and `.substep-*` CSS |
| `docs/workflow/states.md` | Document sub-step state enumeration and transitions |
| `README.md` | Add sub-step visibility to features |
| `ARCHITECTURE.md` | Update sidebar data flow section |

## Testing

### Unit Tests
- `progress.test.ts`: Parse PROGRESS.md with verify/refactor fields
- `sidebarState.test.ts`: `mapPhases()` produces correct `subSteps[]`
- `sidebarPhaseHelpers.test.ts`: `renderSubSteps()` renders all status combinations

### Visual Verification
- `/visual-verification` with sub-steps visible in running state
- Test completed phase shows sub-step history
- Test with verify enabled, refactor disabled (and vice versa)
- Test retry count display (attempts > 1)
- Test failure state (red X)

## Out of Scope

- Real-time sub-step detection from live.log (future enhancement if PROGRESS.md lacks granularity)
- Sub-step timing/duration (only phase-level duration shown)
- Clickable sub-steps (phases are clickable to open log, but sub-steps are not)
