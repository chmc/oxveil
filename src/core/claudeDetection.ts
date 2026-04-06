export type ClaudeExecutor = (
  command: string,
  args: string[],
) => Promise<{ stdout: string }>;

/**
 * Detect whether the Claude CLI binary exists and is executable.
 * Returns the resolved path on success, or null if not found/not executable.
 */
export async function detectClaude(
  executor: ClaudeExecutor,
  path: string,
): Promise<string | null> {
  try {
    await executor(path, ["--version"]);
    return path;
  } catch {
    return null;
  }
}
