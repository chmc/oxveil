import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { registerCommands, type CommandDeps } from "./commands";
import {
  registerSelfImprovementCommands,
  type SelfImprovementCommandDeps,
} from "./commands/selfImprovement";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import type { Installer } from "./core/installer";
import type { StatusBarManager } from "./views/statusBar";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ExecutionTimelinePanel } from "./views/executionTimeline";
import type { ConfigWizardPanel } from "./views/configWizard";
import type { ReplayViewerPanel } from "./views/replayViewer";
import type { ArchiveTimelinePanel } from "./views/archiveTimelinePanel";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { PlanPreviewPanel } from "./views/planPreviewPanel";
import type { SelfImprovementPanel } from "./views/selfImprovementPanel";
import type { NotificationManager } from "./views/notifications";
import type { PlanChatSession } from "./core/planChatSession";
import type { SelfImprovementSession } from "./core/selfImprovementSession";
import type { SidebarMutableState } from "./activateSidebar";
import type { SidebarState } from "./views/sidebarState";
import type { SidebarPanel } from "./views/sidebarPanel";

export interface ActivateCommandsDeps {
  manager: WorkspaceSessionManager;
  installer: Installer;
  statusBar: StatusBarManager;
  refreshArchive: () => Promise<void>;
  dependencyGraph: DependencyGraphPanel;
  executionTimeline: ExecutionTimelinePanel;
  configWizard: ConfigWizardPanel;
  replayViewer: ReplayViewerPanel;
  archiveTimelinePanel: ArchiveTimelinePanel;
  liveRunPanel: LiveRunPanel;
  planPreviewPanel: PlanPreviewPanel;
  selfImprovementPanel: SelfImprovementPanel;
  claudePath: string | null;
  extensionMode: number;
  notifications: NotificationManager;
  sidebarState: SidebarMutableState;
  sidebarPanel: SidebarPanel;
  buildFullState: () => SidebarState;
  sidebar: {
    onPlanChatStarted: () => void;
    onPlanFormed: () => void;
    onFullReset: () => void;
    onAiParseStarted: () => void;
    onAiParseEnded: () => void;
    isAiParsing: () => boolean;
  };
  getActivePlanChatSession: () => PlanChatSession | undefined;
  setActivePlanChatSession: (session: PlanChatSession | undefined) => void;
  getActiveSelfImprovementSession: () => SelfImprovementSession | undefined;
  setActiveSelfImprovementSession: (
    session: SelfImprovementSession | undefined,
  ) => void;
}

/**
 * Registers all extension commands and returns their disposables.
 */
export function activateCommands(deps: ActivateCommandsDeps): vscode.Disposable[] {
  const commandDeps: CommandDeps = {
    sessionManager: deps.manager,
    installer: deps.installer,
    statusBar: deps.statusBar,
    readdir: (dir: string) => fs.readdir(dir),
    onArchiveRefresh: deps.refreshArchive,
    dependencyGraph: deps.dependencyGraph,
    executionTimeline: deps.executionTimeline,
    configWizard: deps.configWizard,
    replayViewer: deps.replayViewer,
    archiveTimelinePanel: deps.archiveTimelinePanel,
    liveRunPanel: deps.liveRunPanel,
    planPreviewPanel: deps.planPreviewPanel,
    claudePath: deps.claudePath,
    extensionMode: deps.extensionMode,
    getActivePlanChatSession: deps.getActivePlanChatSession,
    onPlanChatSessionCreated: (session) => {
      // Clear stale sidebar state first (before reset() fires synchronous events)
      deps.sidebar.onPlanChatStarted();
      const activeSession = deps.manager.getActiveSession();
      if (activeSession) {
        activeSession.sessionState.reset();
      }
      deps.setActivePlanChatSession(session);
      deps.planPreviewPanel.setSessionActive(true);
      deps.planPreviewPanel.setPlanFormed(false);
      vscode.commands.executeCommand("setContext", "oxveil.planChatActive", true);
    },
    onPlanFormed: () => {
      deps.sidebar.onPlanFormed();
      deps.planPreviewPanel.setPlanFormed(true);
    },
    notificationManager: deps.notifications,
    onFullReset: deps.sidebar.onFullReset,
    onAiParseStarted: deps.sidebar.onAiParseStarted,
    onAiParseEnded: deps.sidebar.onAiParseEnded,
    isAiParsing: deps.sidebar.isAiParsing,
  };

  const selfImprovementDeps: SelfImprovementCommandDeps = {
    claudePath: deps.claudePath,
    extensionMode: deps.extensionMode,
    getSelfImprovementPanel: () => deps.selfImprovementPanel,
    getMutableState: () => deps.sidebarState,
    refreshSidebar: () => deps.sidebarPanel.updateState(deps.buildFullState()),
    getActiveSelfImprovementSession: deps.getActiveSelfImprovementSession,
    onSelfImprovementSessionCreated: deps.setActiveSelfImprovementSession,
  };

  return [
    ...registerCommands(commandDeps),
    ...registerSelfImprovementCommands(selfImprovementDeps),
  ];
}
