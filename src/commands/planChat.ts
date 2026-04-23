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

export function buildSystemPrompt(): string {
  return [
    "When writing the plan, use numbered section headers (e.g., `## Phase 1: Title` or `### Step 1: Title`).",
    "Each phase should be a meaningful, self-contained unit of work.",
    "Include clear descriptions with acceptance criteria.",
    "Ask the user clarifying questions before writing the plan.",
    "When you receive a message formatted as '[Phase N annotation] text', this is user feedback about that phase. Acknowledge the feedback and incorporate it into your planning.",
  ].join("\n");
}
