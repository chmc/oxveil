import type { PlanState } from "../types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePlan(plan: PlanState): ValidationResult {
  const errors: string[] = [];
  const phaseNumbers = new Set<string>();

  // Check for duplicate phase numbers
  for (const phase of plan.phases) {
    const key = String(phase.number);
    if (phaseNumbers.has(key)) {
      errors.push(`Duplicate phase number: ${key}`);
    }
    phaseNumbers.add(key);
  }

  // Check sequential numbering for integer phases
  const integerPhases = plan.phases
    .filter((p) => typeof p.number === "number")
    .map((p) => p.number as number)
    .sort((a, b) => a - b);

  for (let i = 1; i < integerPhases.length; i++) {
    if (integerPhases[i] !== integerPhases[i - 1] + 1) {
      errors.push(
        `Gap in sequential numbering: expected ${integerPhases[i - 1] + 1}, found ${integerPhases[i]}`
      );
    }
  }

  // Check dependency references
  for (const phase of plan.phases) {
    if (!phase.dependencies) continue;
    for (const dep of phase.dependencies) {
      if (!phaseNumbers.has(dep)) {
        errors.push(
          `Phase ${phase.number} depends on non-existent Phase ${dep}`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
