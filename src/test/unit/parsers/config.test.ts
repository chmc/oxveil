import { describe, it, expect } from "vitest";
import { parseConfig, serializeConfig } from "../../../parsers/config";

const SAMPLE_CONFIG = `# claudeloop configuration — edit or delete freely
PLAN_FILE=.claudeloop/ai-parsed-plan.md
PROGRESS_FILE=.claudeloop/PROGRESS.md
MAX_RETRIES=15
SIMPLE_MODE=false
SKIP_PERMISSIONS=true
BASE_DELAY=3
STREAM_TRUNCATE_LEN=300
MAX_PHASE_TIME=0
IDLE_TIMEOUT=600
VERIFY_TIMEOUT=300
AI_PARSE=true
GRANULARITY=tasks
VERIFY_PHASES=true
REFACTOR_PHASES=true
REFACTOR_MAX_RETRIES=20
QUOTA_RETRY_INTERVAL=900
`;

describe("parseConfig", () => {
  it("parses all known keys from a well-formed config", () => {
    const { config } = parseConfig(SAMPLE_CONFIG);

    expect(config.PLAN_FILE).toBe(".claudeloop/ai-parsed-plan.md");
    expect(config.PROGRESS_FILE).toBe(".claudeloop/PROGRESS.md");
    expect(config.MAX_RETRIES).toBe(15);
    expect(config.SIMPLE_MODE).toBe(false);
    expect(config.SKIP_PERMISSIONS).toBe(true);
    expect(config.BASE_DELAY).toBe(3);
    expect(config.STREAM_TRUNCATE_LEN).toBe(300);
    expect(config.MAX_PHASE_TIME).toBe(0);
    expect(config.IDLE_TIMEOUT).toBe(600);
    expect(config.VERIFY_TIMEOUT).toBe(300);
    expect(config.AI_PARSE).toBe(true);
    expect(config.GRANULARITY).toBe("tasks");
    expect(config.VERIFY_PHASES).toBe(true);
    expect(config.REFACTOR_PHASES).toBe(true);
    expect(config.REFACTOR_MAX_RETRIES).toBe(20);
    expect(config.QUOTA_RETRY_INTERVAL).toBe(900);
  });

  it("preserves comments", () => {
    const { comments } = parseConfig(SAMPLE_CONFIG);
    expect(comments).toEqual([
      "# claudeloop configuration — edit or delete freely",
    ]);
  });

  it("preserves unknown keys", () => {
    const content = `PLAN_FILE=plan.md
CUSTOM_KEY=custom_value
ANOTHER=42
`;
    const { unknownKeys } = parseConfig(content);
    expect(unknownKeys).toEqual([
      { key: "CUSTOM_KEY", value: "custom_value" },
      { key: "ANOTHER", value: "42" },
    ]);
  });

  it("returns defaults for missing keys", () => {
    const { config } = parseConfig("PLAN_FILE=plan.md\n");

    expect(config.PLAN_FILE).toBe("plan.md");
    expect(config.MAX_RETRIES).toBe(3);
    expect(config.SIMPLE_MODE).toBe(false);
    expect(config.HOOKS_ENABLED).toBe(true);
    expect(config.GRANULARITY).toBe("phases");
    expect(config.VERIFY_PHASES).toBe(true);
    expect(config.PHASE_PROMPT_FILE).toBe("");
  });

  it("parses boolean strings correctly", () => {
    const content = `SIMPLE_MODE=true
SKIP_PERMISSIONS=false
AI_PARSE=TRUE
HOOKS_ENABLED=False
`;
    const { config } = parseConfig(content);
    expect(config.SIMPLE_MODE).toBe(true);
    expect(config.SKIP_PERMISSIONS).toBe(false);
    expect(config.AI_PARSE).toBe(true);
    expect(config.HOOKS_ENABLED).toBe(false);
  });

  it("handles empty file", () => {
    const result = parseConfig("");
    expect(result.config.MAX_RETRIES).toBe(3);
    expect(result.unknownKeys).toEqual([]);
    expect(result.comments).toEqual([]);
  });

  it("handles empty string content", () => {
    const result = parseConfig("");
    expect(result.config.PLAN_FILE).toBe("");
    expect(result.config.GRANULARITY).toBe("phases");
  });

  it("skips malformed lines", () => {
    const content = `PLAN_FILE=plan.md
this is not a config line
=no_key
just_key_no_equals
MAX_RETRIES=5
`;
    const { config, unknownKeys } = parseConfig(content);
    expect(config.PLAN_FILE).toBe("plan.md");
    expect(config.MAX_RETRIES).toBe(5);
    // "just_key_no_equals" has no = so it's skipped
    // "=no_key" has empty key, treated as unknown
    expect(unknownKeys).toHaveLength(1);
    expect(unknownKeys[0]).toEqual({ key: "", value: "no_key" });
  });

  it("handles values with equals signs", () => {
    const content = `PLAN_FILE=path/with=equals.md\n`;
    const { config } = parseConfig(content);
    expect(config.PLAN_FILE).toBe("path/with=equals.md");
  });

  it("ignores invalid granularity values", () => {
    const content = `GRANULARITY=invalid\n`;
    const { config } = parseConfig(content);
    expect(config.GRANULARITY).toBe("phases"); // default
  });

  it("accepts all valid granularity values", () => {
    for (const g of ["phases", "tasks", "steps"]) {
      const { config } = parseConfig(`GRANULARITY=${g}\n`);
      expect(config.GRANULARITY).toBe(g);
    }
  });

  it("ignores non-numeric number values", () => {
    const content = `MAX_RETRIES=abc\n`;
    const { config } = parseConfig(content);
    expect(config.MAX_RETRIES).toBe(3); // default
  });

  it("handles multiple comment lines", () => {
    const content = `# Line 1
# Line 2
# Line 3
PLAN_FILE=plan.md
`;
    const { comments } = parseConfig(content);
    expect(comments).toHaveLength(3);
  });
});

describe("serializeConfig", () => {
  it("produces valid key=value output", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    const output = serializeConfig(parsed);

    expect(output).toContain("PLAN_FILE=.claudeloop/ai-parsed-plan.md");
    expect(output).toContain("MAX_RETRIES=15");
    expect(output).toContain("SIMPLE_MODE=false");
    expect(output).toContain("GRANULARITY=tasks");
  });

  it("includes comment header", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    const output = serializeConfig(parsed);

    expect(output.startsWith("# claudeloop configuration")).toBe(true);
  });

  it("includes unknown keys", () => {
    const content = `PLAN_FILE=plan.md
CUSTOM=hello
`;
    const parsed = parseConfig(content);
    const output = serializeConfig(parsed);

    expect(output).toContain("CUSTOM=hello");
  });

  it("adds default comment when none exist", () => {
    const parsed = parseConfig("PLAN_FILE=plan.md\n");
    const output = serializeConfig(parsed);

    expect(output).toContain("# claudeloop configuration");
  });

  it("ends with newline", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    const output = serializeConfig(parsed);
    expect(output.endsWith("\n")).toBe(true);
  });
});

describe("round-trip", () => {
  it("preserves all values through parse → serialize → parse", () => {
    const first = parseConfig(SAMPLE_CONFIG);
    const serialized = serializeConfig(first);
    const second = parseConfig(serialized);

    expect(second.config).toEqual(first.config);
    expect(second.unknownKeys).toEqual(first.unknownKeys);
  });

  it("preserves unknown keys through round-trip", () => {
    const content = `# my config
PLAN_FILE=plan.md
CUSTOM_KEY=custom_value
MAX_RETRIES=10
`;
    const first = parseConfig(content);
    const serialized = serializeConfig(first);
    const second = parseConfig(serialized);

    expect(second.config.PLAN_FILE).toBe("plan.md");
    expect(second.config.MAX_RETRIES).toBe(10);
    expect(second.unknownKeys).toEqual([
      { key: "CUSTOM_KEY", value: "custom_value" },
    ]);
  });

  it("preserves comments through round-trip", () => {
    const content = `# Header comment
# Another comment
PLAN_FILE=plan.md
`;
    const first = parseConfig(content);
    const serialized = serializeConfig(first);
    const second = parseConfig(serialized);

    expect(second.comments).toEqual(first.comments);
  });
});
