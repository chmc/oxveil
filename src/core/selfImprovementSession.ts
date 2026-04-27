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

export function formatLessons(lessons: Lesson[]): string {
  return lessons
    .map((l) => {
      const parts = [
        `## Phase ${l.phase}: ${l.title}`,
        `- retries: ${l.retries}`,
        `- duration: ${l.duration}s`,
        `- exit: ${l.exit}`,
      ];
      if (l.failReason) parts.push(`- fail_reason: ${l.failReason}`);
      if (l.summary) parts.push(`- summary: ${l.summary}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export const INITIAL_QUESTION =
  "Based on these session lessons, what improvements should we discuss?";

export class SelfImprovementSession {
  private _deps: SelfImprovementSessionDeps;
  private _terminal: Terminal | undefined;
  private _active = false;

  constructor(deps: SelfImprovementSessionDeps) {
    this._deps = deps;
  }

  start(lessons: Lesson[]): void {
    const lessonsContent = formatLessons(lessons);
    const args: string[] = [];
    if (this._deps.claudeModel) {
      args.push("--model", this._deps.claudeModel);
    }
    args.push("--append-system-prompt", lessonsContent);
    args.push(INITIAL_QUESTION);
    this._terminal = this._deps.createTerminal({
      name: "Self-Improvement",
      shellPath: this._deps.claudePath,
      shellArgs: args,
      location: { viewColumn: 1 },
    });
    this._terminal.show();
    this._active = true;
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
