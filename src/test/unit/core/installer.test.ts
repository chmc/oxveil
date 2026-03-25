import { describe, it, expect, vi, beforeEach } from "vitest";
import { Installer } from "../../../core/installer";

describe("Installer", () => {
  let createTerminal: ReturnType<typeof vi.fn>;
  let onDidCloseTerminal: ReturnType<typeof vi.fn>;
  let onDetectionChanged: ReturnType<typeof vi.fn>;

  interface MockTerminal {
    sendText: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
  }

  let mockTerminal: MockTerminal;
  let terminalCloseCallback: ((t: MockTerminal) => void) | undefined;

  beforeEach(() => {
    mockTerminal = {
      sendText: vi.fn(),
      show: vi.fn(),
    };
    createTerminal = vi.fn().mockReturnValue(mockTerminal);
    terminalCloseCallback = undefined;
    onDidCloseTerminal = vi.fn().mockImplementation((cb) => {
      terminalCloseCallback = cb;
      return { dispose: vi.fn() };
    });
    onDetectionChanged = vi.fn();
  });

  function createInstaller(platform = "darwin"): Installer {
    return new Installer({
      createTerminal,
      onDidCloseTerminal,
      onDetectionChanged,
      platform,
    });
  }

  describe("isSupported", () => {
    it("returns true for macOS", () => {
      const installer = createInstaller("darwin");
      expect(installer.isSupported()).toBe(true);
    });

    it("returns true for Linux", () => {
      const installer = createInstaller("linux");
      expect(installer.isSupported()).toBe(true);
    });

    it("returns false for unsupported platforms", () => {
      const installer = createInstaller("win32");
      expect(installer.isSupported()).toBe(false);
    });
  });

  describe("install", () => {
    it("generates correct install command for macOS", async () => {
      const installer = createInstaller("darwin");
      const installPromise = installer.install();

      expect(createTerminal).toHaveBeenCalledWith({
        name: "Install claudeloop",
      });
      expect(mockTerminal.show).toHaveBeenCalled();
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("curl"),
      );
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("install.sh"),
      );

      // Simulate terminal close
      terminalCloseCallback?.(mockTerminal);
      await installPromise;
    });

    it("generates correct install command for Linux", async () => {
      const installer = createInstaller("linux");
      const installPromise = installer.install();

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("curl"),
      );

      terminalCloseCallback?.(mockTerminal);
      await installPromise;
    });

    it("triggers re-detection after terminal closes", async () => {
      const installer = createInstaller("darwin");
      const installPromise = installer.install();

      expect(onDetectionChanged).not.toHaveBeenCalled();

      // Close the install terminal
      terminalCloseCallback?.(mockTerminal);
      await installPromise;

      expect(onDetectionChanged).toHaveBeenCalled();
    });

    it("ignores close events from other terminals", async () => {
      const installer = createInstaller("darwin");
      const installPromise = installer.install();

      // Close a different terminal
      const otherTerminal = { sendText: vi.fn(), show: vi.fn() };
      terminalCloseCallback?.(otherTerminal as unknown as MockTerminal);

      // onDetectionChanged should NOT have been called
      expect(onDetectionChanged).not.toHaveBeenCalled();

      // Now close the actual install terminal
      terminalCloseCallback?.(mockTerminal);
      await installPromise;

      expect(onDetectionChanged).toHaveBeenCalledTimes(1);
    });
  });
});
