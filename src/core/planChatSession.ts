export interface Terminal {
  sendText: (text: string) => void;
  show: () => void;
  dispose: () => void;
}

export interface PlanChatSessionDeps {
  createTerminal: (options: {
    name: string;
    shellPath: string;
    shellArgs: string[];
    location: { viewColumn: number };
  }) => Terminal;
  claudePath: string;
  claudeModel?: string;
  allowSkipPermissions?: boolean;
  provider?: "claude" | "opencode";
  opencodePath?: string;
}

export class PlanChatSession {
  private _deps: PlanChatSessionDeps;
  private _terminal: Terminal | undefined;
  private _active = false;

  constructor(deps: PlanChatSessionDeps) {
    this._deps = deps;
  }

  start(systemPrompt: string): void {
    const isOpenCode = this._deps.provider === "opencode";
    const args: string[] = [];

    if (this._deps.claudeModel) {
      args.push("--model", this._deps.claudeModel);
    }

    let shellPath: string;
    let terminalName: string;
    if (isOpenCode) {
      shellPath = this._deps.opencodePath ?? "";
      terminalName = "Plan Chat (OpenCode)";
      args.push("--prompt", systemPrompt);
    } else {
      shellPath = this._deps.claudePath;
      terminalName = "Plan Chat (Claude)";
      args.push("--append-system-prompt", systemPrompt, "--permission-mode", "plan");
      if (this._deps.allowSkipPermissions) {
        args.push("--allow-dangerously-skip-permissions");
      }
    }

    this._terminal = this._deps.createTerminal({
      name: terminalName,
      shellPath,
      shellArgs: args,
      location: { viewColumn: 1 },
    });
    this._terminal.show();
    this._active = true;
  }

  sendAnnotation(phase: string | number, text: string): void {
    if (!this._active || !this._terminal) return;
    this._terminal.sendText(
      `[Phase ${phase} annotation] ${text}`,
    );
  }

  focusTerminal(): void {
    this._terminal?.show();
  }

  matchesTerminal(terminal: unknown): boolean {
    return this._terminal !== undefined && terminal === this._terminal;
  }

  isActive(): boolean {
    return this._active;
  }

  dispose(): void {
    if (!this._active) return;
    this._active = false;
    this._terminal?.dispose();
    this._terminal = undefined;
  }
}
