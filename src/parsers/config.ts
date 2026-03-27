import type { ConfigState, Granularity, ParsedConfig } from "../types";

const BOOLEAN_KEYS = new Set<keyof ConfigState>([
  "SIMPLE_MODE",
  "SKIP_PERMISSIONS",
  "HOOKS_ENABLED",
  "AI_PARSE",
  "VERIFY_PHASES",
  "REFACTOR_PHASES",
]);

const NUMBER_KEYS = new Set<keyof ConfigState>([
  "MAX_RETRIES",
  "BASE_DELAY",
  "QUOTA_RETRY_INTERVAL",
  "STREAM_TRUNCATE_LEN",
  "MAX_PHASE_TIME",
  "IDLE_TIMEOUT",
  "VERIFY_TIMEOUT",
  "REFACTOR_MAX_RETRIES",
]);

const STRING_KEYS = new Set<keyof ConfigState>([
  "PLAN_FILE",
  "PROGRESS_FILE",
  "PHASE_PROMPT_FILE",
]);

const GRANULARITY_VALUES = new Set<Granularity>(["phases", "tasks", "steps"]);

const KNOWN_KEYS = new Set<string>([
  ...BOOLEAN_KEYS,
  ...NUMBER_KEYS,
  ...STRING_KEYS,
  "GRANULARITY",
]);

function defaultConfig(): ConfigState {
  return {
    PLAN_FILE: "",
    PROGRESS_FILE: "",
    MAX_RETRIES: 3,
    SIMPLE_MODE: false,
    PHASE_PROMPT_FILE: "",
    BASE_DELAY: 3,
    QUOTA_RETRY_INTERVAL: 900,
    SKIP_PERMISSIONS: false,
    STREAM_TRUNCATE_LEN: 300,
    HOOKS_ENABLED: true,
    MAX_PHASE_TIME: 0,
    IDLE_TIMEOUT: 600,
    VERIFY_TIMEOUT: 300,
    AI_PARSE: true,
    GRANULARITY: "phases",
    VERIFY_PHASES: true,
    REFACTOR_PHASES: true,
    REFACTOR_MAX_RETRIES: 3,
  };
}

function parseBool(value: string): boolean {
  return value.toLowerCase() === "true";
}

export function parseConfig(content: string): ParsedConfig {
  const config = defaultConfig();
  const unknownKeys: Array<{ key: string; value: string }> = [];
  const comments: string[] = [];

  if (!content) {
    return { config, unknownKeys, comments };
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("#")) {
      comments.push(rawLine);
      continue;
    }

    if (!line || !line.includes("=")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    if (!KNOWN_KEYS.has(key)) {
      unknownKeys.push({ key, value });
      continue;
    }

    const typedKey = key as keyof ConfigState;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = config as any;
    if (BOOLEAN_KEYS.has(typedKey)) {
      cfg[key] = parseBool(value);
    } else if (NUMBER_KEYS.has(typedKey)) {
      const n = Number(value);
      if (!isNaN(n)) {
        cfg[key] = n;
      }
    } else if (STRING_KEYS.has(typedKey)) {
      cfg[key] = value;
    } else if (key === "GRANULARITY") {
      if (GRANULARITY_VALUES.has(value as Granularity)) {
        config.GRANULARITY = value as Granularity;
      }
    }
  }

  return { config, unknownKeys, comments };
}

export function serializeConfig(parsed: ParsedConfig): string {
  const lines: string[] = [];

  if (parsed.comments.length > 0) {
    lines.push(...parsed.comments);
  } else {
    lines.push("# claudeloop configuration — edit or delete freely");
  }

  const { config } = parsed;
  for (const key of KNOWN_KEYS) {
    const value = config[key as keyof ConfigState];
    lines.push(`${key}=${String(value)}`);
  }

  for (const { key, value } of parsed.unknownKeys) {
    lines.push(`${key}=${value}`);
  }

  return lines.join("\n") + "\n";
}
