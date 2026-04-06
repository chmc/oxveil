export function buildSystemPrompt(): string {
  return [
    "When writing the plan, use numbered section headers (e.g., `## Phase 1: Title` or `### Step 1: Title`).",
    "Each phase should be a meaningful, self-contained unit of work.",
    "Include clear descriptions with acceptance criteria.",
    "Ask the user clarifying questions before writing the plan.",
  ].join("\n");
}
