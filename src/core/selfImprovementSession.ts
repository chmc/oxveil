import type { Lesson } from "../types";

export interface Terminal {
  sendText: (text: string) => void;
  show: () => void;
  dispose: () => void;
}

export interface SelfImprovementSessionDeps {
  createTerminal: (options: {
    name: string;
    shellPath: string;
    shellArgs: string[];
    location: { viewColumn: number };
  }) => Terminal;
  claudePath: string;
  claudeModel?: string;
}

// ExtensionMode.Development = 2 in VS Code API
const EXTENSION_MODE_DEVELOPMENT = 2;

export function resolveClaudeModel(
  envVar: string | undefined,
  extensionMode: number | undefined,
): string | undefined {
  if (envVar) return envVar;
  if (extensionMode === EXTENSION_MODE_DEVELOPMENT) return "haiku";
  return undefined;
}

export function buildSystemPrompt(lessons: Lesson[]): string {
  const lessonsContent = lessons
    .map((l) => {
      const parts = [
        `## Phase ${l.phase}: ${l.title}`,
        `- retries: ${l.retries}`,
        `- duration: ${l.duration}s`,
        `- exit: ${l.exit}`,
      ];
      return parts.join("\n");
    })
    .join("\n\n");

  return `You are reviewing a completed implementation session. The lessons below capture what happened during execution.

Lessons:
${lessonsContent}

When the conversation begins, start by summarizing the lessons in 2-3 sentences (phases completed, any retries, total time). Then ask what improvements the user wants to discuss - CLAUDE.md updates, workflow changes, or other refinements.

Focus on actionable rules. Be concise.`;
}

export class SelfImprovementSession {
  private _deps: SelfImprovementSessionDeps;
  private _terminal: Terminal | undefined;
  private _active = false;

  constructor(deps: SelfImprovementSessionDeps) {
    this._deps = deps;
  }

  start(lessons: Lesson[]): void {
    const systemPrompt = buildSystemPrompt(lessons);
    const args: string[] = [];
    if (this._deps.claudeModel) {
      args.push("--model", this._deps.claudeModel);
    }
    args.push("--append-system-prompt", systemPrompt);
    this._terminal = this._deps.createTerminal({
      name: "Self-Improvement",
      shellPath: this._deps.claudePath,
      shellArgs: args,
      location: { viewColumn: 1 },
    });
    this._terminal.show();
    this._active = true;

    // Auto-start conversation - Claude will respond with lessons summary
    this._terminal.sendText("start\n");
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
