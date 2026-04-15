---
name: workflow-docs
description: Remind to update docs/workflow/states.md when modifying state-related files.
---

# Workflow Docs Update

When modifying any of the following files, update `docs/workflow/states.md`:

| File Changed | Spec Section to Update |
|---|---|
| `sidebarState.ts` | B. Sidebar View Projection (decision table, output states) |
| `sessionState.ts` | A. Session State Machine (statechart, transition matrix) |
| `statusBar.ts` | C. Status Bar Projection (state mapping table) |
| `planPreviewPanel.ts` | D. Plan Preview States (state table, transition table) |
| `types.ts` | Appendix: Type Definitions + check all sections for type changes |
| `sidebarMessages.ts` | F. Message Schemas (command tables) |
| `sessionWiring.ts` | E. Cross-Machine Wiring (event → update matrix, context keys) |
| `sidebarRenderers.ts` | B. Sidebar View Projection (renderer table) |

- Update the Appendix type definitions if union members change.
- If behavior changes affect user journeys, also update `docs/workflow/user-stories.md`.
- Run `npm test` — the `workflowStatesSync.test.ts` test validates state enumerations match the spec.
