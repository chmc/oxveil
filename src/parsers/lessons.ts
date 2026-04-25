import type { Lesson } from "../types";

/**
 * Parse lessons.md content into structured Lesson array.
 *
 * Format:
 * ## Phase N: Title
 * - retries: N
 * - duration: Ns (expected: Ns)?
 * - exit: success|error
 */
export function parseLessons(content: string): Lesson[] {
  if (!content.trim()) {
    return [];
  }

  const lessons: Lesson[] = [];

  // Split by phase headers
  const phaseRegex = /^## Phase ([\d.]+): (.+)$/gm;
  const sections: Array<{ phase: number | string; title: string; body: string }> = [];

  let match: RegExpExecArray | null;
  let lastIndex = 0;
  const matches: Array<{ phase: number | string; title: string; index: number }> = [];

  while ((match = phaseRegex.exec(content)) !== null) {
    const phaseStr = match[1];
    const phase = phaseStr.includes(".") ? phaseStr : parseInt(phaseStr, 10);
    matches.push({ phase, title: match[2], index: match.index });
  }

  // Extract body for each section
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : content.length;
    const fullSection = content.slice(start, end);
    const headerEnd = fullSection.indexOf("\n");
    const body = headerEnd >= 0 ? fullSection.slice(headerEnd + 1) : "";
    sections.push({ phase: matches[i].phase, title: matches[i].title, body });
  }

  for (const section of sections) {
    const lesson = parseSection(section.phase, section.title, section.body);
    if (lesson) {
      lessons.push(lesson);
    }
  }

  return lessons;
}

function parseSection(phase: number | string, title: string, body: string): Lesson | null {
  const lines = body.split("\n");

  let retries: number | undefined;
  let duration: number | undefined;
  let exit: "success" | "error" | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) continue;

    const content = trimmed.slice(1).trim();

    // Parse retries
    const retriesMatch = content.match(/^retries:\s*(\d+)/i);
    if (retriesMatch) {
      retries = parseInt(retriesMatch[1], 10);
      continue;
    }

    // Parse duration - handles "45s", "312s (expected: 180s)", "45"
    const durationMatch = content.match(/^duration:\s*(\d+)s?/i);
    if (durationMatch) {
      duration = parseInt(durationMatch[1], 10);
      continue;
    }

    // Parse exit
    const exitMatch = content.match(/^exit:\s*(success|error)/i);
    if (exitMatch) {
      exit = exitMatch[1].toLowerCase() as "success" | "error";
      continue;
    }
  }

  // All fields required
  if (retries === undefined || duration === undefined || exit === undefined) {
    return null;
  }

  return { phase, title, retries, duration, exit };
}
