import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SelfImprovementSession,
  formatLessons,
  INITIAL_QUESTION,
  resolveClaudeModel,
  type SelfImprovementSessionDeps,
} from "../../../core/selfImprovementSession";
import type { Lesson } from "../../../types";

interface MockTerminal {
  sendText: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

describe("formatLessons", () => {
  it("formats lessons into markdown sections", () => {
    const lessons: Lesson[] = [
      { phase: 1, title: "Setup project", retries: 0, duration: 45, exit: "success" },
      { phase: 2, title: "Add feature", retries: 2, duration: 312, exit: "error" },
    ];

    const content = formatLessons(lessons);

    expect(content).toContain("## Phase 1: Setup project");
    expect(content).toContain("- retries: 0");
    expect(content).toContain("- duration: 45s");
    expect(content).toContain("- exit: success");

    expect(content).toContain("## Phase 2: Add feature");
    expect(content).toContain("- retries: 2");
    expect(content).toContain("- duration: 312s");
    expect(content).toContain("- exit: error");
  });

  it("handles string phase numbers", () => {
    const lessons: Lesson[] = [
      { phase: "1a", title: "Sub-phase", retries: 1, duration: 60, exit: "success" },
    ];

    const content = formatLessons(lessons);

    expect(content).toContain("## Phase 1a: Sub-phase");
  });

  it("handles empty lessons array", () => {
    const content = formatLessons([]);
    expect(content).toBe("");
  });
});

describe("INITIAL_QUESTION", () => {
  it("asks about improvements", () => {
    expect(INITIAL_QUESTION).toContain("improvements");
  });
});

describe("resolveClaudeModel", () => {
  // VS Code API: Production = 1, Development = 2, Test = 3
  const PRODUCTION = 1;
  const DEVELOPMENT = 2;

  it("returns env var when set", () => {
    expect(resolveClaudeModel("sonnet", DEVELOPMENT)).toBe("sonnet");
  });

  it("returns haiku in development mode when no env var", () => {
    expect(resolveClaudeModel(undefined, DEVELOPMENT)).toBe("haiku");
  });

  it("returns undefined in production mode when no env var", () => {
    expect(resolveClaudeModel(undefined, PRODUCTION)).toBeUndefined();
  });

  it("env var takes precedence over development mode default", () => {
    expect(resolveClaudeModel("opus", DEVELOPMENT)).toBe("opus");
  });

  it("returns undefined when env var is empty string", () => {
    expect(resolveClaudeModel("", PRODUCTION)).toBeUndefined();
  });

  it("returns haiku when env var is empty string in dev mode", () => {
    expect(resolveClaudeModel("", DEVELOPMENT)).toBe("haiku");
  });
});

describe("SelfImprovementSession", () => {
  let mockTerminal: MockTerminal;
  let deps: SelfImprovementSessionDeps;

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
    it("creates terminal with claude path and lessons content", () => {
      const session = new SelfImprovementSession(deps);
      const lessons: Lesson[] = [
        { phase: 1, title: "Test", retries: 0, duration: 10, exit: "success" },
      ];

      session.start(lessons);

      expect(deps.createTerminal).toHaveBeenCalledWith({
        name: "Self-Improvement",
        shellPath: "/usr/bin/claude",
        shellArgs: expect.arrayContaining([
          "--append-system-prompt",
          expect.stringContaining("Phase 1: Test"),
        ]),
        location: { viewColumn: 1 },
      });
    });

    it("includes initial question as positional argument", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).toContain(INITIAL_QUESTION);
    });

    it("includes --model flag when claudeModel is set", () => {
      const session = new SelfImprovementSession({ ...deps, claudeModel: "haiku" });
      const lessons: Lesson[] = [];

      session.start(lessons);

      expect(deps.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          shellArgs: expect.arrayContaining(["--model", "haiku"]),
        }),
      );
    });

    it("omits --model flag when claudeModel is undefined", () => {
      const session = new SelfImprovementSession(deps);
      const lessons: Lesson[] = [];

      session.start(lessons);

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--model");
    });

    it("includes --permission-mode plan always", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).toContain("--permission-mode");
      expect(args).toContain("plan");
    });

    it("includes --allow-dangerously-skip-permissions when allowSkipPermissions is true", () => {
      const session = new SelfImprovementSession({ ...deps, allowSkipPermissions: true });
      session.start([]);

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).toContain("--allow-dangerously-skip-permissions");
    });

    it("omits --allow-dangerously-skip-permissions when allowSkipPermissions is false", () => {
      const session = new SelfImprovementSession({ ...deps, allowSkipPermissions: false });
      session.start([]);

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--allow-dangerously-skip-permissions");
    });

    it("omits --allow-dangerously-skip-permissions when allowSkipPermissions is undefined", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);

      const args = (deps.createTerminal as ReturnType<typeof vi.fn>).mock.calls[0][0].shellArgs as string[];
      expect(args).not.toContain("--allow-dangerously-skip-permissions");
    });

    it("shows the terminal", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("marks session as active", () => {
      const session = new SelfImprovementSession(deps);
      expect(session.isActive()).toBe(false);

      session.start([]);
      expect(session.isActive()).toBe(true);
    });
  });

  describe("focusTerminal", () => {
    it("calls show on the terminal", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);
      mockTerminal.show.mockClear();

      session.focusTerminal();

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("does nothing when no terminal exists", () => {
      const session = new SelfImprovementSession(deps);
      // Should not throw
      session.focusTerminal();
    });
  });

  describe("matchesTerminal", () => {
    it("returns true for the session's terminal", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);

      expect(session.matchesTerminal(mockTerminal)).toBe(true);
    });

    it("returns false for a different terminal", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);

      const otherTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      expect(session.matchesTerminal(otherTerminal)).toBe(false);
    });

    it("returns false when session has not started", () => {
      const session = new SelfImprovementSession(deps);

      expect(session.matchesTerminal(mockTerminal)).toBe(false);
    });
  });

  describe("isActive", () => {
    it("returns false before start", () => {
      const session = new SelfImprovementSession(deps);
      expect(session.isActive()).toBe(false);
    });

    it("returns true after start", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);
      expect(session.isActive()).toBe(true);
    });

    it("returns false after dispose", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);
      session.dispose();
      expect(session.isActive()).toBe(false);
    });
  });

  describe("dispose", () => {
    it("disposes the terminal", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);
      session.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it("marks session as inactive", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);
      session.dispose();

      expect(session.isActive()).toBe(false);
    });

    it("is safe to call multiple times", () => {
      const session = new SelfImprovementSession(deps);
      session.start([]);
      session.dispose();
      session.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
