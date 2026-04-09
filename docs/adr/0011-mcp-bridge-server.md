# 11. MCP Bridge Server for Extension Interaction

**Date:** 2026-04-09
**Status:** Accepted

## Context

Visual verification of sidebar webview buttons is impossible via macOS automation (osascript/cliclick). Electron does not pass synthetic mouse events through to webview iframe content. The extension needs a programmatic interface for Claude Code to read state, click buttons, and execute commands — both for automated verification and as a foundation for future tooling.

## Decision

Add an opt-in MCP bridge consisting of two components:

1. **HTTP bridge** (`src/mcp/bridge.ts`) — lightweight `http.createServer` running inside the extension host on `127.0.0.1:0` (OS-assigned port). Serves 4 routes: `/health`, `/state`, `/click`, `/command`. Auth via random bearer token per session.

2. **MCP stdio server** (`src/mcp/server.ts`) — standalone Node.js process using `@modelcontextprotocol/sdk`. Claude Code spawns it via stdio. Proxies tool calls to the HTTP bridge. Re-reads discovery file on every request to handle extension reloads.

**Port discovery:** Bridge writes `{ port, token, version, pid }` to `<workspaceRoot>/.oxveil-mcp` (mode 0600). MCP server reads this on each request. PID included for stale detection.

**Activation:** Opt-in via `oxveil.mcpBridge` setting (default: false). Bridge lazy-imported in `extension.ts` for zero overhead when disabled.

**Build:** Second esbuild entry point produces `dist/mcp-server.js` (bundles `@modelcontextprotocol/sdk`, no vscode external).

## Consequences

**Positive:**
- Visual verification can now interact with sidebar webview buttons programmatically
- Foundation for Claude Code ↔ extension integration (future tools, automation)
- Clean separation: bridge runs in-process (direct state access), MCP server runs standalone (Claude Code compatible)
- Opt-in — no impact on users who don't use it

**Negative:**
- Adds `@modelcontextprotocol/sdk` as bundled dependency (breaks zero-runtime-dependency stance for the MCP server binary, though the main extension bundle remains dependency-free)
- HTTP server in extension host is a security surface (mitigated: localhost-only, token auth)
- Discovery file can go stale on crash (mitigated: PID check, overwrite on activate)
- v1 limited to single-root workspaces
