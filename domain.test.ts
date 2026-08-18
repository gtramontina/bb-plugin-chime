import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, chooseStormNotification, normalizeConfig, shouldPlayNotification, visibleThreadId, type ChimeNotification } from "./domain";

const baseNotification: ChimeNotification = {
  kind: "completed",
  threadId: "thread-1",
  projectId: "project-1",
  timestamp: 10_000,
};

describe("notification policy", () => {
  it("normalizes unsafe persisted values", () => {
    const config = normalizeConfig({
      ...DEFAULT_CONFIG,
      volume: 3,
      mutedProjectIds: ["one", "one", "two"],
      eventSounds: { ...DEFAULT_CONFIG.eventSounds, completed: "not-a-sound" as never },
    });

    expect(config.volume).toBe(1);
    expect(config.mutedProjectIds).toEqual(["one", "two"]);
    expect(config.eventSounds.completed).toBe(DEFAULT_CONFIG.eventSounds.completed);
  });

  it("rejects stale, muted, and visible-thread events", () => {
    expect(shouldPlayNotification(baseNotification, DEFAULT_CONFIG, 15_001, "/threads/elsewhere")).toBe(false);
    expect(shouldPlayNotification(baseNotification, { ...DEFAULT_CONFIG, mutedProjectIds: ["project-1"] }, 10_100, "/")).toBe(false);
    expect(shouldPlayNotification(baseNotification, { ...DEFAULT_CONFIG, muteVisibleThread: true }, 10_100, "/threads/thread-1")).toBe(false);
  });

  it("lets attention events override routine storm events", () => {
    const failed: ChimeNotification = { ...baseNotification, kind: "failed", timestamp: 10_050 };
    const started: ChimeNotification = { ...baseNotification, kind: "started", timestamp: 10_100 };
    expect(chooseStormNotification([baseNotification, failed, started])).toEqual(failed);
  });

  it("finds the visible bb thread without exposing other route segments", () => {
    expect(visibleThreadId("/projects/proj_1/threads/thr_visible")).toBe("thr_visible");
    expect(visibleThreadId("/settings/plugins/chime")).toBeNull();
  });
});
