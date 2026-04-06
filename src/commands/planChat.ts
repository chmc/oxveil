export type ExistingPlanAction = "edit" | "create" | "cancel";

export interface ExistingPlanQuickPickItem {
  label: string;
  value: ExistingPlanAction;
}

export function buildSystemPrompt(): string {
  return [
    "You are a plan writer for a software project.",
    "Write the plan to a file called PLAN.md in the workspace root.",
    "Use this format:",
    "",
    "# Plan Title",
    "",
    "## Phase 1: Short Title",
    "",
    "Description of what this phase accomplishes.",
    "",
    "## Phase 2: Short Title",
    "",
    "Description of the next phase.",
    "",
    "Rules:",
    "- Each phase must start with `## Phase N: Title`",
    "- Phase numbers must be sequential integers starting at 1",
    "- Each phase should be a meaningful, self-contained unit of work",
    "- Include clear descriptions with acceptance criteria",
    "- Ask the user clarifying questions before writing the plan",
  ].join("\n");
}

export async function handleExistingPlan(
  showQuickPick: (items: ExistingPlanQuickPickItem[]) => Promise<ExistingPlanQuickPickItem | undefined>,
): Promise<ExistingPlanAction> {
  const items: ExistingPlanQuickPickItem[] = [
    { label: "Edit existing plan", value: "edit" },
    { label: "Create new plan (backup current)", value: "create" },
  ];
  const picked = await showQuickPick(items);
  return picked?.value ?? "cancel";
}
