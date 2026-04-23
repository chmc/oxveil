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
 */
export async function activateMcpBridge(deps: McpBridgeDeps): Promise<vscode.Disposable[]> {
  const { config, workspaceRoot, buildFullState, sidebarPanel, sidebarState } = deps;
  const mcpEnabled = config.get<boolean>("mcpBridge", false);
  if (!mcpEnabled || !workspaceRoot) return [];

  const disposables: vscode.Disposable[] = [];
  try {
    const { startBridge } = await import("./mcp/bridge");
    const bridge = await startBridge({
      workspaceRoot,
      buildFullState,
      dispatchClick: (msg) => {
        // Use real DOM click path - dispatches MouseEvent in webview,
        // which triggers the click handler and posts command back to extension
        const selector = commandToSelector(msg);
        sidebarPanel.triggerClick(selector);
      },
      executeCommand: vscode.commands.executeCommand,
    });
    disposables.push(bridge);
    disposables.push(
      vscode.commands.registerCommand("oxveil._simulateClick", (args: { command: string }) => {
        if (args?.command && /^[a-zA-Z]+$/.test(args.command)) {
          sidebarPanel.simulateClick(args.command);
        }
      }),
    );
  } catch (err) {
    console.warn("[Oxveil] MCP bridge failed to start:", err);
  }
  return disposables;
}
