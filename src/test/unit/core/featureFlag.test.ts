import { describe, it, expect } from "vitest";
import { shouldActivate } from "../../../core/featureFlag";

describe("shouldActivate", () => {
  it("returns false when oxveil.experimental is false", () => {
    const getConfig = (key: string) => {
      if (key === "experimental") return false;
      return undefined;
    };

    expect(shouldActivate(getConfig)).toBe(false);
  });

  it("returns true when oxveil.experimental is true", () => {
    const getConfig = (key: string) => {
      if (key === "experimental") return true;
      return undefined;
    };

    expect(shouldActivate(getConfig)).toBe(true);
  });

  it("returns false when experimental setting is undefined", () => {
    const getConfig = () => undefined;

    expect(shouldActivate(getConfig)).toBe(false);
  });
});
