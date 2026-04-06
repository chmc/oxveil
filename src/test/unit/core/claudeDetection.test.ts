import { describe, it, expect, vi } from "vitest";
import { detectClaude, type ClaudeExecutor } from "../../../core/claudeDetection";

function makeExecutor(result: { stdout: string } | Error): ClaudeExecutor {
  return vi.fn<ClaudeExecutor>().mockImplementation(() => {
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve(result);
  });
}

describe("detectClaude", () => {
  it("detects claude at default path", async () => {
    const executor = makeExecutor({ stdout: "1.0.0\n" });

    const result = await detectClaude(executor, "claude");

    expect(result).toBe("claude");
    expect(executor).toHaveBeenCalledWith("claude", ["--version"]);
  });

  it("detects claude at custom path from setting", async () => {
    const executor = makeExecutor({ stdout: "1.2.3\n" });

    const result = await detectClaude(executor, "/usr/local/bin/claude");

    expect(result).toBe("/usr/local/bin/claude");
    expect(executor).toHaveBeenCalledWith("/usr/local/bin/claude", ["--version"]);
  });

  it("returns null when binary not found", async () => {
    const executor = makeExecutor(new Error("ENOENT"));

    const result = await detectClaude(executor, "claude");

    expect(result).toBeNull();
  });

  it("returns null when binary not executable", async () => {
    const executor = makeExecutor(new Error("EACCES"));

    const result = await detectClaude(executor, "/tmp/claude");

    expect(result).toBeNull();
  });
});
