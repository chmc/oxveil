import { describe, it, expect, vi } from "vitest";
import { Detection, type Executor } from "../../../core/detection";

function makeExecutor(result: { stdout: string } | Error): Executor {
  return vi.fn<Executor>().mockImplementation(() => {
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve(result);
  });
}

describe("Detection", () => {
  const MIN_VERSION = "0.22.0";

  it("returns detected when execFile resolves with valid version", async () => {
    const executor = makeExecutor({ stdout: "0.22.1\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.status).toBe("detected");
    expect(result.version).toBe("0.22.1");
    expect(result.path).toBe("claudeloop");
    expect(executor).toHaveBeenCalledWith("claudeloop", ["--version"]);
  });

  it("returns not-found when execFile rejects", async () => {
    const executor = makeExecutor(new Error("ENOENT"));
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.status).toBe("not-found");
    expect(result.version).toBeUndefined();
  });

  it("returns version-incompatible when version below minimum", async () => {
    const executor = makeExecutor({ stdout: "0.21.0\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.status).toBe("version-incompatible");
    expect(result.version).toBe("0.21.0");
  });

  it("uses custom path from settings when provided", async () => {
    const executor = makeExecutor({ stdout: "0.22.1\n" });
    const detection = new Detection(executor, "/usr/local/bin/claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.status).toBe("detected");
    expect(result.path).toBe("/usr/local/bin/claudeloop");
    expect(executor).toHaveBeenCalledWith("/usr/local/bin/claudeloop", ["--version"]);
  });

  it("parses version string correctly", async () => {
    const executor = makeExecutor({ stdout: "0.22.1\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.version).toBe("0.22.1");
  });

  it("parses version with extra whitespace", async () => {
    const executor = makeExecutor({ stdout: "  0.22.1  \n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.version).toBe("0.22.1");
    expect(result.status).toBe("detected");
  });

  it("caches detection result", async () => {
    const executor = makeExecutor({ stdout: "0.22.1\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    await detection.detect();
    expect(detection.current).toBeDefined();
    expect(detection.current!.status).toBe("detected");
  });

  it("re-detects with new path", async () => {
    const executor = makeExecutor({ stdout: "0.22.1\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    await detection.detect();

    detection.updatePath("/new/path/claudeloop");
    const result = await detection.detect();

    expect(executor).toHaveBeenLastCalledWith("/new/path/claudeloop", ["--version"]);
    expect(result.path).toBe("/new/path/claudeloop");
  });

  it("handles exact minimum version as compatible", async () => {
    const executor = makeExecutor({ stdout: "0.22.0\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.status).toBe("detected");
  });

  it("handles version above minimum as compatible", async () => {
    const executor = makeExecutor({ stdout: "1.0.0\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.status).toBe("detected");
  });

  it("returns minimumVersion in all results", async () => {
    const executor = makeExecutor({ stdout: "0.22.1\n" });
    const detection = new Detection(executor, "claudeloop", MIN_VERSION);

    const result = await detection.detect();

    expect(result.minimumVersion).toBe(MIN_VERSION);
  });
});
