---
name: workflow-docs
description: Remind to update docs/workflow/states.md when modifying state-related files.
---

# Workflow Docs Update

When modifying any of the following files, update `docs/workflow/states.md`:

| File Changed | Spec Section to Update |
|---|---|
| `src/views/sidebarState.ts` | B. Sidebar View Projection (decision table, output states) |
| `src/core/sessionState.ts` | A. Session State Machine (statechart, transition matrix) |
| `src/views/statusBar.ts` | C. Status Bar Projection (state mapping table) |
| `src/views/planPreviewPanel.ts` | D. Plan Preview States (state table, transition table) |
| `src/types.ts` | Appendix: Type Definitions + check all sections for type changes |
| `src/views/sidebarMessages.ts` | F. Message Schemas (command tables) |
| `src/sessionWiring.ts` | E. Cross-Machine Wiring (event → update matrix, context keys) |
| `src/views/sidebarRenderers.ts` | B. Sidebar View Projection (renderer table) |

**BLOCKING:** When changing any file in `related_files`, edit `docs/workflow/states.md` FIRST — spec is source of truth, code follows.

- Update the Appendix type definitions if union members change.
- If behavior changes affect user journeys, run `npm run generate:flow` to regenerate `docs/workflow/user-flows.md`.
- Run `npm test` — the `workflowStatesSync.test.ts` test validates state enumerations match the spec.
