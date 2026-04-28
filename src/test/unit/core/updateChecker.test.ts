import { describe, it, expect, vi } from "vitest";
import {
  isNewerVersion,
  checkForUpdate,
  type UpdateCheckerDeps,
} from "../../../core/updateChecker";

describe("isNewerVersion", () => {
  it("returns true when latest is newer stable", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true when stable release of same version as beta", () => {
    expect(isNewerVersion("1.0.0-beta.1", "1.0.0")).toBe(true);
  });

  it("returns false when current beta is newer than latest stable", () => {
    expect(isNewerVersion("1.1.0-beta.1", "1.0.0")).toBe(false);
  });

  it("returns false when stable is compared against older prerelease", () => {
    expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(false);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("0.28.2", "0.28.2")).toBe(false);
  });

  it("returns true when latest stable is newer than current beta", () => {
    expect(isNewerVersion("1.0.0-beta.1", "1.1.0")).toBe(true);
  });

  it("handles versions with v prefix", () => {
    expect(isNewerVersion("v1.0.0", "v1.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "v1.1.0")).toBe(true);
  });

  it("returns false for malformed versions", () => {
    expect(isNewerVersion("invalid", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "invalid")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  function makeDeps(overrides: Partial<UpdateCheckerDeps> = {}): UpdateCheckerDeps {
    return {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v1.0.0", html_url: "https://example.com" }),
      }),
      currentVersion: "0.28.0",
      globalState: {
        get: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
      ...overrides,
    };
  }

  it("returns update available when latest is newer", async () => {
    const deps = makeDeps({
      currentVersion: "0.27.0",
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v0.28.0", html_url: "https://example.com/release" }),
      }),
    });

    const result = await checkForUpdate(deps);

    expect(result?.updateAvailable).toBe(true);
    expect(result?.currentVersion).toBe("0.27.0");
    expect(result?.latestVersion).toBe("0.28.0");
    expect(result?.releaseUrl).toBe("https://example.com/release");
  });

  it("returns no update when current is same as latest", async () => {
    const deps = makeDeps({
      currentVersion: "0.28.0",
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v0.28.0", html_url: "https://example.com" }),
      }),
    });

    const result = await checkForUpdate(deps);

    expect(result?.updateAvailable).toBe(false);
  });

  it("returns no update when current beta is newer than latest stable", async () => {
    const deps = makeDeps({
      currentVersion: "0.29.0-beta.1",
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v0.28.0", html_url: "https://example.com" }),
      }),
    });

    const result = await checkForUpdate(deps);

    expect(result?.updateAvailable).toBe(false);
  });

  it("returns null when fetch fails", async () => {
    const deps = makeDeps({
      fetch: vi.fn().mockResolvedValue({ ok: false }),
    });

    const result = await checkForUpdate(deps);

    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const deps = makeDeps({
      fetch: vi.fn().mockRejectedValue(new Error("network error")),
    });

    const result = await checkForUpdate(deps);

    expect(result).toBeNull();
  });

  it("uses cached result within TTL", async () => {
    const cachedResult = {
      updateAvailable: true,
      currentVersion: "0.27.0",
      latestVersion: "0.28.0",
      releaseUrl: "https://cached.com",
    };
    const fetchMock = vi.fn();
    const deps = makeDeps({
      fetch: fetchMock,
      globalState: {
        get: vi.fn().mockReturnValue({
          timestamp: Date.now() - 1000, // 1 second ago, within TTL
          result: cachedResult,
        }),
        update: vi.fn(),
      },
    });

    const result = await checkForUpdate(deps);

    expect(result).toEqual(cachedResult);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches when cache is expired", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: "v0.29.0", html_url: "https://fresh.com" }),
    });
    const deps = makeDeps({
      currentVersion: "0.28.0",
      fetch: fetchMock,
      globalState: {
        get: vi.fn().mockReturnValue({
          timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago, expired
          result: { updateAvailable: false },
        }),
        update: vi.fn(),
      },
    });

    const result = await checkForUpdate(deps);

    expect(fetchMock).toHaveBeenCalled();
    expect(result?.latestVersion).toBe("0.29.0");
  });

  it("caches result after successful fetch", async () => {
    const updateMock = vi.fn();
    const deps = makeDeps({
      globalState: {
        get: vi.fn().mockReturnValue(undefined),
        update: updateMock,
      },
    });

    await checkForUpdate(deps);

    expect(updateMock).toHaveBeenCalledWith(
      "oxveil.lastUpdateCheck",
      expect.objectContaining({
        timestamp: expect.any(Number),
        result: expect.objectContaining({
          updateAvailable: expect.any(Boolean),
        }),
      }),
    );
  });
});
