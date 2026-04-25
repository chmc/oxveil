import * as vscode from "vscode";
import type { SidebarState } from "./views/sidebarState";
import type { SidebarPanel } from "./views/sidebarPanel";
import type { SidebarMutableState } from "./activateSidebar";
import type { SidebarCommand } from "./views/sidebarMessages";

/** Convert SidebarCommand to CSS selector for real DOM click. */
function commandToSelector(msg: SidebarCommand): string {
  let selector = `[data-command="${msg.command}"]`;
  if ("phase" in msg && msg.phase !== undefined) {
    selector += `[data-phase="${msg.phase}"]`;
  }
  if ("archive" in msg && msg.archive !== undefined) {
    selector += `[data-archive="${msg.archive}"]`;
  }
  return selector;
}

export interface McpBridgeDeps {
  config: vscode.WorkspaceConfiguration;
  workspaceRoot: string | undefined;
  buildFullState: () => SidebarState;
  sidebarPanel: SidebarPanel;
  sidebarState: SidebarMutableState;
}

/**
 * Activates the MCP bridge if enabled. Wrapped in try-catch so a bridge failure
 * does not prevent activate() from completing (which blocks resolveWebviewView).
 *
 * Also watches for config changes to start/stop the bridge dynamically.
 */
export async function activateMcpBridge(deps: McpBridgeDeps): Promise<vscode.Disposable[]> {
  const { workspaceRoot, buildFullState, sidebarPanel } = deps;
  if (!workspaceRoot) return [];

  // Capture non-null value for closure
  const wsRoot = workspaceRoot;

  const disposables: vscode.Disposable[] = [];
  let bridgeHandle: vscode.Disposable | undefined;
  let simulateClickDisposable: vscode.Disposable | undefined;

  async function startBridgeIfEnabled(): Promise<void> {
    // Re-read config each time (may have changed since activation)
    const currentConfig = vscode.workspace.getConfiguration("oxveil");
    const mcpEnabled = currentConfig.get<boolean>("mcpBridge", false);

    if (!mcpEnabled) {
      // Stop bridge if running
      bridgeHandle?.dispose();
      bridgeHandle = undefined;
      return;
    }

    // Already running
    if (bridgeHandle) return;

    try {
      const { startBridge } = await import("./mcp/bridge");
      const bridge = await startBridge({
        workspaceRoot: wsRoot,
        buildFullState,
        dispatchClick: (msg) => {
          const selector = commandToSelector(msg);
          sidebarPanel.triggerClick(selector);
        },
        executeCommand: vscode.commands.executeCommand,
      });
      bridgeHandle = bridge;
      console.log("[Oxveil] MCP bridge started on port", bridge.port);
    } catch (err) {
      console.warn("[Oxveil] MCP bridge failed to start:", err);
    }
  }

  // Initial start
  await startBridgeIfEnabled();

  // Register simulate click command once
  simulateClickDisposable = vscode.commands.registerCommand(
    "oxveil._simulateClick",
    (args: { command: string }) => {
      if (args?.command && /^[a-zA-Z]+$/.test(args.command)) {
        sidebarPanel.simulateClick(args.command);
      }
    },
  );
  disposables.push(simulateClickDisposable);

  // Watch for config changes to start/stop bridge
  disposables.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("oxveil.mcpBridge")) {
        startBridgeIfEnabled();
      }
    }),
  );

  // Cleanup on dispose
  disposables.push({
    dispose() {
      bridgeHandle?.dispose();
    },
  });

  return disposables;
}
