import * as vscode from "vscode";
import type { SidebarState } from "./views/sidebarState";
import type { SidebarPanel } from "./views/sidebarPanel";
import type { SidebarMutableState } from "./activateSidebar";
import { dispatchSidebarMessage } from "./views/sidebarMessages";

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
        if (msg.command === "resumePlan" || msg.command === "dismissPlan") {
          sidebarState.planUserChoice = msg.command === "resumePlan" ? "resume" : "dismiss";
          sidebarPanel.updateState(buildFullState());
          return;
        }
        dispatchSidebarMessage(msg, vscode.commands.executeCommand);
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
