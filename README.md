# Oxveil

VS Code extension for managing AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop).

## Prerequisites

- Node.js >= 20
- VS Code ^1.100.0
- [claudeloop](https://github.com/chmc/claudeloop) >= 0.22.0 (runtime dependency -- not needed to build, only to test extension features end-to-end)

## Setup

```sh
npm install
npm run build
```

## Enable the extension

Set `oxveil.experimental` to `true` in VS Code settings. Without this, the extension activates but silently does nothing (feature flag gate). This is the most common gotcha for new developers.

## Running

**Quick check:** Press F5 to build and launch the Extension Development Host. After making changes, run `npm run build` and reload the dev host with Cmd+R.

**Iterative development:** Run `npm run watch` in a terminal, then press F5. esbuild rebuilds on file changes. Reload the dev host with Cmd+R to pick up changes.

Notes:

- Open a folder in the Extension Development Host -- the extension checks for `workspace.workspaceFolders`.
- claudeloop creates `.claudeloop/` at runtime. No need to create it manually.
- Without claudeloop installed, the extension shows a "not found" state with an install option.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Bundle extension to `dist/` with esbuild |
| `npm run watch` | Rebuild on file changes |
| `npm run lint` | TypeScript type-checking via `tsc --noEmit` |
| `npm test` | Run tests once |
| `npm run test:watch` | Watch mode tests |

## Testing

Tests use [vitest](https://vitest.dev/), not the VS Code test runner. They run outside VS Code.

- **Unit tests** (`src/test/unit/`) -- core modules and views with mocks
- **Integration tests** (`src/test/integration/`) -- full activation wiring

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical overview, IPC contract, component details, and roadmap.
