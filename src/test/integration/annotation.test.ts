import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanChatSession, type PlanChatSessionDeps } from "../../core/planChatSession";

/**
 * Integration test for user story 7:
 * "User can annotate phases via 'Note' buttons → PlanChatSession.sendAnnotation() sends text to Claude terminal"
 *
 * This test verifies the full annotation flow including the new focusTerminal behavior.
 */

describe("Annotation flow (user story 7)", () => {
  let mockTerminal: {
    sendText: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let deps: PlanChatSessionDeps;

  beforeEach(() => {
    mockTerminal = {
      sendText: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    };

    deps = {
      createTerminal: vi.fn().mockReturnValue(mockTerminal),
      claudePath: "/usr/local/bin/claude",
    };
  });

  it("annotation sends formatted text to terminal and focuses it", () => {
    // Setup: Create session and start it (mimics Plan Chat command)
    const session = new PlanChatSession(deps);
    session.start("system prompt");

    // Clear mocks from start() call
    mockTerminal.sendText.mockClear();
    mockTerminal.show.mockClear();

    // Action: Send annotation (mimics extension.ts onAnnotation callback)
    session.sendAnnotation("1", "This phase needs more detail");
    session.focusTerminal();

    // Verify: Text sent to terminal in correct format
    expect(mockTerminal.sendText).toHaveBeenCalledWith(
      "[Phase 1 annotation] This phase needs more detail"
    );

    // Verify: Terminal receives focus so user sees the annotation and response
    expect(mockTerminal.show).toHaveBeenCalled();
  });

  it("annotation with numeric phase works correctly", () => {
    const session = new PlanChatSession(deps);
    session.start("prompt");
    mockTerminal.sendText.mockClear();

    session.sendAnnotation(3, "Consider edge cases");

    expect(mockTerminal.sendText).toHaveBeenCalledWith(
      "[Phase 3 annotation] Consider edge cases"
    );
  });

  it("annotation does nothing when session not started", () => {
    const session = new PlanChatSession(deps);
    // Don't call start()

    session.sendAnnotation("1", "test");
    session.focusTerminal();

    expect(mockTerminal.sendText).not.toHaveBeenCalled();
    // focusTerminal uses optional chaining, so no error
  });

  it("annotation does nothing after session disposed", () => {
    const session = new PlanChatSession(deps);
    session.start("prompt");
    session.dispose();
    mockTerminal.sendText.mockClear();

    session.sendAnnotation("1", "test");

    expect(mockTerminal.sendText).not.toHaveBeenCalled();
  });
});
