# Plan: Add Configuration Button to Sidebar Header

**Issue:** [#75](https://github.com/chmc/oxveil/issues/75)

## Context

The Oxveil sidebar header currently has only a reset button. Users need quick access to configuration settings without using the command palette. US-15 in `docs/workflow/user-stories.md` already anticipates "User clicks gear icon in sidebar header" — this plan implements that UI entry point.

## Phase 1: Add Config Button to package.json

**File:** `/Users/aleksi/source/oxveil/package.json`

### 1.1 Add icon to command definition (lines 120-123)

```json
{
  "command": "oxveil.openConfigWizard",
  "title": "Oxveil: Edit Config",
  "icon": "$(gear)"
}
```

### 1.2 Add entry to view/title menu (lines 285-291)

```json
"view/title": [
  {
    "command": "oxveil.openConfigWizard",
    "when": "view == oxveil.sidebar",
    "group": "navigation@1"
  },
  {
    "command": "oxveil.fullReset",
    "when": "view == oxveil.sidebar",
    "group": "navigation@2"
  }
]
```

**Note:** `@1`/`@2` controls ordering — config appears left (primary), reset appears right (destructive). Matches VS Code convention.

## Phase 2: Visual Verification

Run `/visual-verification` to confirm:
- [ ] Gear icon appears left of reset icon in sidebar header
- [ ] Clicking gear opens Config Wizard panel
- [ ] Reset button still works
- [ ] Buttons visible in all sidebar states (empty, ready, running, completed, failed)

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Add icon to command, add view/title menu entry |

## Files NOT Modified (already correct)

- `docs/workflow/states.md` — context keys documented, no menu contributions needed
- `docs/workflow/user-stories.md` — US-15 already describes gear icon in header
- `src/commands.ts` — `openConfigWizard` handler already exists
- Tests — no state type changes, no snapshot tests for menu contributions

## Verification

1. `npm run lint`
2. `npm test`
3. `/visual-verification` — sidebar header buttons in all states
4. `/visual-verification` — click gear icon, verify Config Wizard panel opens with form
