import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanChatSession, type PlanChatSessionDeps } from "../../../core/planChatSession";

interface MockTerminal {
  sendText: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

describe("PlanChatSession", () => {
  let mockTerminal: MockTerminal;
  let deps: PlanChatSessionDeps;

  beforeEach(() => {
    mockTerminal = {
      sendText: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    };
    deps = {
      createTerminal: vi.fn().mockReturnValue(mockTerminal),
      claudePath: "/usr/bin/claude",
    };
  });

  describe("start", () => {
    it("creates terminal with claude path and system prompt", () => {
      const session = new PlanChatSession(deps);
      session.start("Test prompt");

      expect(deps.createTerminal).toHaveBeenCalledWith({
        name: "Plan Chat (Claude)",
        shellPath: "/usr/bin/claude",
        shellArgs: [
          "--append-system-prompt", "Test prompt",
          "--permission-mode", "plan",
        ],
        location: { viewColumn: 1 },
      });
    });

    it("passes OXVEIL_PLAN_MARKER env var to createTerminal when markerPath is set", () => {
      const session = new PlanChatSession({ ...deps, markerPath: "/tmp/marker" });
      session.start("Test prompt");

      expect(deps.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          env: { OXVEIL_PLAN_MARKER: "/tmp/marker" },
        }),
      );
    });

    it("omits env from createTerminal when markerPath is not set", () => {
      const session = new PlanChatSession(deps);
      session.start("Test prompt");

      const call = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(call).not.toHaveProperty("env");
    });

    it("includes --model flag when claudeModel is set", () => {
      const session = new PlanChatSession({ ...deps, claudeModel: "haiku" });
      session.start("Test prompt");

      expect(deps.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          shellArgs: expect.arrayContaining(["--model", "haiku"]),
        }),
      );
    });

    it("omits --model flag when claudeModel is undefined", () => {
      const session = new PlanChatSession(deps);
      session.start("Test prompt");

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--model");
    });

    it("omits --model flag when claudeModel is empty string", () => {
      const session = new PlanChatSession({ ...deps, claudeModel: "" });
      session.start("Test prompt");

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--model");
    });

    it("includes --allow-dangerously-skip-permissions when allowSkipPermissions is true", () => {
      const session = new PlanChatSession({ ...deps, allowSkipPermissions: true });
      session.start("Test prompt");

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).toContain("--allow-dangerously-skip-permissions");
    });

    it("omits --allow-dangerously-skip-permissions when allowSkipPermissions is false", () => {
      const session = new PlanChatSession({ ...deps, allowSkipPermissions: false });
      session.start("Test prompt");

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--allow-dangerously-skip-permissions");
    });

    it("omits --allow-dangerously-skip-permissions when allowSkipPermissions is undefined", () => {
      const session = new PlanChatSession(deps);
      session.start("Test prompt");

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--allow-dangerously-skip-permissions");
    });

    describe("OpenCode provider", () => {
      let opencodeDeps: PlanChatSessionDeps;

      beforeEach(() => {
        opencodeDeps = {
          ...deps,
          provider: "opencode",
          opencodePath: "/usr/local/bin/opencode",
        };
      });

      it("creates terminal with opencode path and --prompt", () => {
        const session = new PlanChatSession(opencodeDeps);
        session.start("Test prompt");

        expect(opencodeDeps.createTerminal).toHaveBeenCalledWith({
          name: "Plan Chat (OpenCode)",
          shellPath: "/usr/local/bin/opencode",
          shellArgs: ["--prompt", "Test prompt"],
          location: { viewColumn: 1 },
        });
      });

      it("includes --model when claudeModel is set", () => {
        const session = new PlanChatSession({ ...opencodeDeps, claudeModel: "gpt-4" });
        session.start("Test prompt");

        const args = (opencodeDeps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
        expect(args).toContain("--model");
        expect(args).toContain("gpt-4");
      });

      it("omits --append-system-prompt and --permission-mode", () => {
        const session = new PlanChatSession(opencodeDeps);
        session.start("Test prompt");

        const args = (opencodeDeps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
        expect(args).not.toContain("--append-system-prompt");
        expect(args).not.toContain("--permission-mode");
      });

      it("omits --allow-dangerously-skip-permissions even when allowSkipPermissions is true", () => {
        const session = new PlanChatSession({ ...opencodeDeps, allowSkipPermissions: true });
        session.start("Test prompt");

        const args = (opencodeDeps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
        expect(args).not.toContain("--allow-dangerously-skip-permissions");
      });

      it("falls back to empty string when opencodePath is undefined", () => {
        const session = new PlanChatSession({ ...opencodeDeps, opencodePath: undefined });
        session.start("Test prompt");

        expect(opencodeDeps.createTerminal).toHaveBeenCalledWith(
          expect.objectContaining({ shellPath: "" }),
        );
      });
    });

    it("shows the terminal", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("marks session as active", () => {
      const session = new PlanChatSession(deps);
      expect(session.isActive()).toBe(false);

      session.start("prompt");
      expect(session.isActive()).toBe(true);
    });
  });

  describe("sendAnnotation", () => {
    it("calls terminal.sendText with formatted annotation", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");

      session.sendAnnotation("3", "Fix the imports");

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("Phase 3"),
      );
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("Fix the imports"),
      );
    });

    it("does nothing when session is not active", () => {
      const session = new PlanChatSession(deps);

      session.sendAnnotation("1", "some text");

      expect(mockTerminal.sendText).not.toHaveBeenCalled();
    });
  });

  describe("focusTerminal", () => {
    it("calls show on the terminal", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");
      mockTerminal.show.mockClear();

      session.focusTerminal();

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("does nothing when no terminal exists", () => {
      const session = new PlanChatSession(deps);
      // Should not throw
      session.focusTerminal();
    });
  });

  describe("matchesTerminal", () => {
    it("returns true for the session's terminal", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");

      expect(session.matchesTerminal(mockTerminal)).toBe(true);
    });

    it("returns false for a different terminal", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");

      const otherTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      expect(session.matchesTerminal(otherTerminal)).toBe(false);
    });

    it("returns false when session has not started", () => {
      const session = new PlanChatSession(deps);

      expect(session.matchesTerminal(mockTerminal)).toBe(false);
    });
  });

  describe("isActive", () => {
    it("returns false before start", () => {
      const session = new PlanChatSession(deps);
      expect(session.isActive()).toBe(false);
    });

    it("returns true after start", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");
      expect(session.isActive()).toBe(true);
    });

    it("returns false after dispose", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");
      session.dispose();
      expect(session.isActive()).toBe(false);
    });
  });

  describe("dispose", () => {
    it("disposes the terminal", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");
      session.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it("marks session as inactive", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");
      session.dispose();

      expect(session.isActive()).toBe(false);
    });

    it("is safe to call multiple times", () => {
      const session = new PlanChatSession(deps);
      session.start("prompt");
      session.dispose();
      session.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
