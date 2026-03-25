import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OutputChannelManager,
  type OutputChannelDeps,
} from "../../../views/outputChannel";

function makeChannel() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
    clear: vi.fn(),
  };
}

describe("OutputChannelManager", () => {
  let channel: ReturnType<typeof makeChannel>;
  let manager: OutputChannelManager;

  beforeEach(() => {
    channel = makeChannel();
    manager = new OutputChannelManager(channel as unknown as OutputChannelDeps);
  });

  it("appends content from log-appended events", () => {
    manager.onLogAppended("hello world\n");

    expect(channel.append).toHaveBeenCalledWith("hello world\n");
  });

  it("prefixes stderr lines with [stderr]", () => {
    manager.onLogAppended("[stderr] error occurred\n");

    expect(channel.appendLine).toHaveBeenCalledWith("[stderr] error occurred");
  });

  it("handles mixed stdout and stderr lines", () => {
    manager.onLogAppended("normal line\n[stderr] bad thing\nanother normal\n");

    // Should process line by line
    expect(channel.appendLine).toHaveBeenCalledWith("[stderr] bad thing");
    expect(channel.append).toHaveBeenCalledWith("normal line\n");
    expect(channel.append).toHaveBeenCalledWith("another normal\n");
  });

  it("clears channel on clear()", () => {
    manager.clear();

    expect(channel.clear).toHaveBeenCalled();
  });

  it("disposes channel on dispose()", () => {
    manager.dispose();

    expect(channel.dispose).toHaveBeenCalled();
  });
});
