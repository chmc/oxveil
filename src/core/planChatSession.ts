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
}

export class PlanChatSession {
  private _deps: PlanChatSessionDeps;
  private _terminal: Terminal | undefined;
  private _active = false;

  constructor(deps: PlanChatSessionDeps) {
    this._deps = deps;
  }

  start(systemPrompt: string): void {
    this._terminal = this._deps.createTerminal({
      name: "Plan Chat",
      shellPath: this._deps.claudePath,
      shellArgs: [
        "--append-system-prompt", systemPrompt,
        "--permission-mode", "plan",
      ],
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
