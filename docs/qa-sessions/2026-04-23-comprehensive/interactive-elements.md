# Interactive Elements Inventory

Comprehensive mapping of all clickable/interactive elements in Oxveil UI.

---

## Sidebar Elements

Source: `src/views/sidebarRenderers.ts`, `src/views/sidebarScript.ts`

### Buttons (data-command attribute)

| Element | Command | Context | Expected Behavior |
|---------|---------|---------|-------------------|
| `button[data-command="install"]` | install | not-found view | Execute `oxveil.install` - install claudeloop |
| `a[data-command="setPath"]` | setPath | not-found view | Open VS Code settings for `oxveil.claudeloopPath` |
| `button[data-command="createPlan"]` | createPlan | empty, completed views | Execute `oxveil.createPlan` - start plan chat session |
| `button[data-command="writePlan"]` | writePlan | empty view (quick actions) | Execute `oxveil.writePlan` - open/create PLAN.md |
| `button[data-command="aiParse"]` | aiParse | empty view (quick actions) | Execute `oxveil.aiParsePlan` - AI parse existing plan |
| `button[data-command="formPlan"]` | formPlan | empty view (quick actions) | Execute `oxveil.formPlan` - form plan from notes |
| `button[data-command="start"]` | start | ready view | Execute `oxveil.start` - begin execution |
| `a[data-command="editPlan"]` | editPlan | ready view | Execute `oxveil.writePlan` - open plan for editing |
| `a[data-command="discardPlan"]` | discardPlan | ready view | Execute `oxveil.discardPlan` - delete plan file |
| `button[data-command="resumePlan"]` | resumePlan | stale view | Mark stale plan as active, show ready state |
| `button[data-command="dismissPlan"]` | dismissPlan | stale view | Dismiss stale plan notification |
| `button[data-command="stop"]` | stop | running view | Execute `oxveil.stop` - stop execution |
| `button[data-command="resume"]` | resume | stopped view | Execute `oxveil.runFromPhase` with next pending phase |
| `button[data-command="restart"]` | restart | stopped view | Execute `oxveil.reset` - restart from phase 1 |
| `button[data-command="retry"]` | retry | failed view | Execute `oxveil.runFromPhase` with failed phase |
| `button[data-command="skip"]` | skip | failed view | Execute `oxveil.markPhaseComplete` to skip failed phase |
| `button[data-command="openReplay"]` | openReplay | completed view | Execute `oxveil.archiveReplay` - open replay viewer |

### Phase Rows

| Element | Trigger | Expected Behavior |
|---------|---------|-------------------|
| `.phase-row[data-phase]` | click | Execute `oxveil.viewLog` with phase number |

### Archive Entries

| Element | Trigger | Expected Behavior |
|---------|---------|-------------------|
| `.archive-entry[data-archive]` | click | Execute `oxveil.archiveReplay` with archive name |

---

## Status Bar

Source: `src/views/statusBar.ts`

| Element | Command | Expected Behavior |
|---------|---------|-------------------|
| Status bar item | `oxveil.phases.focus` | Focus the Oxveil sidebar panel |

Status bar states and their visual indicators:
- `not-found`: Warning icon, warning background
- `installing`: Spinning sync icon
- `ready`: Symbol-event icon
- `idle`: Symbol-event icon
- `stopped`: Debug-pause icon
- `running`: Spinning sync icon with phase progress
- `failed`: Error icon, error background
- `done`: Check icon

---

## Live Run Panel

Source: `src/views/liveRunHtml.ts`, `src/views/liveRunPanel.ts`

### Dashboard Controls

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `.dashboard-toggle` | click | Toggle dashboard collapsed/expanded state |

### Completion Banner

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `.open-replay` button | `postOpenReplay()` | Execute `oxveil.openReplayViewer` |

### AI Parse Verification Banners

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `button[onclick="sendAction('ai-parse-retry')"]` | click | Retry AI parse with feedback |
| `button[onclick="sendAction('ai-parse-continue')"]` | click | Continue with current parse result |
| `button[onclick="sendAction('ai-parse-abort')"]` | click | Abort AI parse operation |
| `button[onclick="sendAction('open-result')"]` | click | Open ai-parsed-plan.md file |

---

## Plan Preview Panel

Source: `src/views/planPreviewHtml.ts`, `src/views/planPreviewPanel.ts`

### Tab Strip

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `.tab-pill[data-category]` | click | Switch to category tab (design/implementation/plan/ai-parsed) |

### Phase Cards

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `.annotate-btn[data-phase]` | click | Show annotation input for phase |
| `.annotation-input` | Enter key | Send annotation to Claude session |

### Action Bar

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `.form-plan-btn` | click | Execute form plan command |

---

## Config Wizard Panel

Source: `src/views/configWizardHtml.ts`, `src/views/configWizard.ts`

### Toggle Controls

| Element | Key | Expected Behavior |
|---------|-----|-------------------|
| `.toggle[data-key="VERIFY_PHASES"]` | click/Space/Enter | Toggle verify after each phase |
| `.toggle[data-key="REFACTOR_PHASES"]` | click/Space/Enter | Toggle refactor after each phase |
| `.toggle[data-key="AI_PARSE"]` | click/Space/Enter | Toggle AI parse plan; shows/hides granularity |
| `.toggle[data-key="SIMPLE_MODE"]` | click/Space/Enter | Toggle simplified execution mode |
| `.toggle[data-key="SKIP_PERMISSIONS"]` | click/Space/Enter | Toggle skip permissions; shows warning |
| `.toggle[data-key="HOOKS_ENABLED"]` | click/Space/Enter | Toggle lifecycle hooks |

### Number Inputs

| Element | Key | Description |
|---------|-----|-------------|
| `input[data-key="MAX_RETRIES"]` | change | Per-phase retry limit (0-10) |
| `input[data-key="BASE_DELAY"]` | change | Retry delay in seconds |
| `input[data-key="QUOTA_RETRY_INTERVAL"]` | change | Seconds between quota retries |
| `input[data-key="MAX_PHASE_TIME"]` | change | Max seconds per phase |
| `input[data-key="IDLE_TIMEOUT"]` | change | Seconds before idle timeout |
| `input[data-key="VERIFY_TIMEOUT"]` | change | Seconds for verification step |
| `input[data-key="REFACTOR_MAX_RETRIES"]` | change | Max refactoring attempts |
| `input[data-key="STREAM_TRUNCATE_LEN"]` | change | Max chars for stream output |

### Text Inputs

| Element | Key | Description |
|---------|-----|-------------|
| `input[data-key="PLAN_FILE"]` | change | Path to plan file |
| `input[data-key="PROGRESS_FILE"]` | change | Path to progress file |
| `input[data-key="PHASE_PROMPT_FILE"]` | change | Path to phase prompt template |

### Select

| Element | Key | Expected Behavior |
|---------|-----|-------------------|
| `select[data-key="GRANULARITY"]` | change | Select parse granularity (phases/tasks/steps) |

### Action Buttons

| Element | ID | Expected Behavior |
|---------|-----|-------------------|
| `.wizard-btn.secondary#btn-reset` | click | Reset to default values |
| `.wizard-btn.primary#btn-save` | click | Save configuration to .claudeloop.conf |

---

## Dependency Graph Panel

Source: `src/views/dependencyGraph.ts`

| Element | Action | Expected Behavior |
|---------|--------|-------------------|
| `.dag-node[data-phase]` | click | Execute `oxveil.viewLog` with phase number |

---

## Execution Timeline Panel

Source: `src/views/executionTimeline.ts`, `src/views/timelineHtml.ts`

No interactive elements - display only.

---

## Archive Timeline Panel

Source: `src/views/archiveTimelinePanel.ts`, `src/views/timelineHtml.ts`

No interactive elements - display only (read-only badge shown).

---

## Replay Viewer Panel

Source: `src/views/replayViewer.ts`

Replay HTML is generated by claudeloop and contains its own interactive elements (onclick handlers). Oxveil injects CSP but does not control the replay UI.

---

## Notifications

Source: `src/views/notifications.ts`

### Phase Failure Notification

| Button | Callback | Expected Behavior |
|--------|----------|-------------------|
| "View Log" | `onViewLog(phaseNumber)` | Open phase log |
| "Show Output" | `onShowOutput()` | Show output channel |
| "Dismiss" | - | Close notification |

### Detection Notification (not-found)

| Button | Callback | Expected Behavior |
|--------|----------|-------------------|
| "Install" | `onInstall()` | Install claudeloop |
| "Set Path" | `onSetPath()` | Open settings for custom path |
| "Dismiss" | - | Close notification |

### Version Incompatible Notification

| Button | Callback | Expected Behavior |
|--------|----------|-------------------|
| "Update Guide" | - | (No action implemented) |
| "Dismiss" | - | Close notification |

### Double Spawn Notification

| Button | Callback | Expected Behavior |
|--------|----------|-------------------|
| "Stop" | `onStop()` | Stop running process |
| "Force Unlock" | `onForceUnlock()` | Force unlock session |

### AI Parse Success Notification

| Button | Callback | Expected Behavior |
|--------|----------|-------------------|
| "Open Plan" | `onOpenFile(path)` | Open parsed plan file |

### AI Parse Needs Input Notification

| Button | Callback | Expected Behavior |
|--------|----------|-------------------|
| "View Options" | `onFocusLiveRun()` | Focus Live Run panel |

---

## Quick Picks (Modal Dialogs)

Source: Various command files

### Folder Picker

Source: `src/views/folderPicker.ts`

- Triggered: Multi-root workspace when no folder context
- Items: Workspace folders with status
- Selection: Returns selected WorkspaceSession

### Granularity Picker

Source: `src/commands/granularityPicker.ts`

- Triggered: AI parse command
- Items: phases, tasks, steps
- Selection: Returns granularity string

### Phase Picker

Source: `src/commands/phaseOps.ts`

- Triggered: Commands without explicit phase argument
- Items: Available phases
- Selection: Phase number to operate on

---

## Command Palette Commands

All registered commands accessible via Ctrl+Shift+P:

| Command | ID | Description |
|---------|-----|-------------|
| Create Plan | `oxveil.createPlan` | Start plan chat session |
| Write Plan | `oxveil.writePlan` | Open/create PLAN.md |
| Start | `oxveil.start` | Begin execution |
| Stop | `oxveil.stop` | Stop execution |
| Reset | `oxveil.reset` | Reset session |
| View Log | `oxveil.viewLog` | View phase log |
| View Diff | `oxveil.viewDiff` | View phase diff |
| Show Timeline | `oxveil.showTimeline` | Show execution timeline |
| Show Dependency Graph | `oxveil.showDependencyGraph` | Show phase dependency graph |
| Open Config Wizard | `oxveil.openConfigWizard` | Open configuration panel |
| AI Parse Plan | `oxveil.aiParsePlan` | AI parse existing plan |
| Form Plan | `oxveil.formPlan` | Form plan from notes |
| Install | `oxveil.install` | Install claudeloop |
| Force Unlock | `oxveil.forceUnlock` | Force unlock session |
| Mark Phase Complete | `oxveil.markPhaseComplete` | Skip/complete a phase |
| Run From Phase | `oxveil.runFromPhase` | Resume from specific phase |

---

## MCP Bridge (Test Support)

Source: `src/views/sidebarScript.ts`

The sidebar accepts a `triggerClick` message for automated testing:

```typescript
{ type: "triggerClick", selector: string }
```

This dispatches a real DOM click event on the matched element.

---

## Summary Statistics

| Location | Buttons | Links | Inputs | Other Interactive |
|----------|---------|-------|--------|-------------------|
| Sidebar | 14 | 3 | 0 | Phase rows, archive entries |
| Status Bar | 1 (click) | 0 | 0 | 0 |
| Live Run Panel | 5 | 0 | 0 | Dashboard toggle |
| Plan Preview | 2 | 0 | 1 | Tab pills |
| Config Wizard | 2 | 0 | 11 | 6 toggles, 1 select |
| Dependency Graph | 0 | 0 | 0 | DAG nodes |
| Notifications | ~12 | 0 | 0 | 0 |
| Quick Picks | - | - | - | 3 pickers |

**Total: ~50+ distinct interactive elements**
