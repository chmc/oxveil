import type { PlanPhaseWithDescription } from "./planDescription";

// Match "## Step 1: Title", "### Task 1: Title", "### 1. Title", "## Fix 1: Title"
// Group 1: optional keyword (Step, Task, Fix, etc.)
// Group 2: number
// Group 3: title
const SECTION_HEADER_RE = /^#{2,3}\s+(?:(\w+)\s+)?(\d+)[.:]\s*(.+)$/;

const STATUS_RE = /^\[status:\s*[^\]]+\]/i;
const DEPENDS_RE = /^\*\*Depends on:\*\*/;

export interface SectionParseResult {
  phases: PlanPhaseWithDescription[];
  format: "keyword" | "numbered" | "none";
  keyword?: string;
}

function emptyResult(): SectionParseResult {
  return { phases: [], format: "none" };
}

export function parseSections(content: string): SectionParseResult {
  if (!content?.trim()) {
    return emptyResult();
  }

  const lines = content.split("\n");
  const phases: PlanPhaseWithDescription[] = [];
  let current: (PlanPhaseWithDescription & { _bodyStart: number }) | null =
    null;
  let detectedKeyword: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(SECTION_HEADER_RE);

    if (headerMatch) {
      // Close previous section
      if (current) {
        current.bodyEndLine = i - 1;
        current.description = extractDescription(
          lines,
          current._bodyStart,
          current.bodyEndLine
        );
        phases.push(current);
      }

      const keyword = headerMatch[1];
      const rawNum = headerMatch[2];
      const title = headerMatch[3].trim();

      if (keyword && !detectedKeyword) {
        detectedKeyword = keyword;
      }

      current = {
        number: Number(rawNum),
        title,
        headerLine: i,
        bodyEndLine: i,
        description: "",
        _bodyStart: i + 1,
      };
      continue;
    }
  }

  // Close last section
  if (current) {
    current.bodyEndLine = lines.length - 1;
    current.description = extractDescription(
      lines,
      current._bodyStart,
      current.bodyEndLine
    );
    phases.push(current);
  }

  if (phases.length === 0) {
    return emptyResult();
  }

  // Clean up internal _bodyStart field
  for (const phase of phases) {
    delete (phase as unknown as Record<string, unknown>)._bodyStart;
  }

  const format: SectionParseResult["format"] = detectedKeyword
    ? "keyword"
    : "numbered";

  return {
    phases,
    format,
    ...(detectedKeyword ? { keyword: detectedKeyword } : {}),
  };
}

function extractDescription(
  lines: string[],
  bodyStart: number,
  bodyEnd: number
): string {
  const descLines: string[] = [];
  for (let i = bodyStart; i <= bodyEnd; i++) {
    const trimmed = lines[i].trim();
    if (STATUS_RE.test(trimmed)) continue;
    if (DEPENDS_RE.test(trimmed)) continue;
    descLines.push(trimmed);
  }

  // Trim leading and trailing blank lines
  while (descLines.length > 0 && descLines[0] === "") {
    descLines.shift();
  }
  while (descLines.length > 0 && descLines[descLines.length - 1] === "") {
    descLines.pop();
  }

  return descLines.join("\n");
}
