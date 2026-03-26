import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ElapsedTimer } from "../../../views/elapsedTimer";

describe("ElapsedTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats 0 seconds as 0m", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();

    expect(onTick).toHaveBeenCalledWith("0m");
  });

  it("formats 60 seconds as 1m", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();
    vi.advanceTimersByTime(60_000);

    expect(onTick).toHaveBeenLastCalledWith("1m");
  });

  it("formats 720 seconds as 12m", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();
    vi.advanceTimersByTime(720_000);

    expect(onTick).toHaveBeenLastCalledWith("12m");
  });

  it("stops ticking after stop()", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();
    vi.advanceTimersByTime(60_000); // 1m
    timer.stop();
    onTick.mockClear();

    vi.advanceTimersByTime(60_000); // would be 2m

    expect(onTick).not.toHaveBeenCalled();
  });

  it("resets elapsed time on start()", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();
    vi.advanceTimersByTime(120_000); // 2m
    timer.stop();
    timer.start();

    expect(onTick).toHaveBeenLastCalledWith("0m");
  });

  it("returns current elapsed string", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();
    vi.advanceTimersByTime(180_000); // 3m

    expect(timer.elapsed).toBe("3m");
  });

  it("ticks every 10 seconds", () => {
    const onTick = vi.fn();
    const timer = new ElapsedTimer(onTick);

    timer.start();
    onTick.mockClear();

    vi.advanceTimersByTime(10_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(onTick).toHaveBeenCalledTimes(2);
  });
});
