export function buildSystemPrompt(): string {
  return [
    "When writing the plan, use `## Phase N: Title` headers with sequential numbering starting at 1.",
    "Each phase should be a meaningful, self-contained unit of work.",
    "Include clear descriptions with acceptance criteria.",
    "Ask the user clarifying questions before writing the plan.",
  ].join("\n");
}
