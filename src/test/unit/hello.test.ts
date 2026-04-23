import { describe, it, expect } from "vitest";
import { hello } from "../../hello";

describe("hello", () => {
  it("returns default greeting when no name provided", () => {
    expect(hello()).toBe("Hello, World!");
  });

  it("returns greeting with provided name", () => {
    expect(hello("TypeScript")).toBe("Hello, TypeScript!");
  });

  it("handles empty string", () => {
    expect(hello("")).toBe("Hello, !");
  });
});
