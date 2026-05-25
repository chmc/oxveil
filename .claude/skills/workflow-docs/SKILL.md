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

**BLOCKING:** Gate 5 blocks state file edits until BOTH of these are updated first:
1. `docs/workflow/states.md` — spec is source of truth, code follows
2. `docs/workflow/user-flows.md` — run `npm run generate:flow` to regenerate

- Update the Appendix type definitions if union members change.
- Run `npm test` — `workflowStatesSync.test.ts` validates state enumerations, `userFlowsSync.test.ts` validates views.

**Note:** VS Code mermaid extension unreliable (flashes/disappears). `user-flows.md` mermaid renders correctly on GitHub.
