import { afterEach, describe, expect, it, vi } from "vitest";
import { StormBuffer } from "./storm-buffer";

afterEach(() => vi.useRealTimers());

describe("StormBuffer", () => {
  it("flushes one selected item per window", () => {
    vi.useFakeTimers();
    const flushed: number[] = [];
    const storm = new StormBuffer<number>(1_000, (items) => Math.max(...items), (item) => flushed.push(item));
    storm.push(1);
    storm.push(3);
    storm.push(2);

    vi.advanceTimersByTime(999);
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushed).toEqual([3]);
  });

  it("drops pending work when disposed", () => {
    vi.useFakeTimers();
    const flushed: number[] = [];
    const storm = new StormBuffer<number>(1_000, (items) => items[0] ?? null, (item) => flushed.push(item));
    storm.push(1);
    storm.dispose();
    vi.runAllTimers();
    expect(flushed).toEqual([]);
  });
});
