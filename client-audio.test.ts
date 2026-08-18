// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { claimAudioLeadership } from "./client-audio";

describe("audio client leadership", () => {
  beforeEach(() => localStorage.clear());

  it("allows one leader per origin until its lease expires", () => {
    expect(claimAudioLeadership("client-a", 1_000)).toBe(true);
    expect(claimAudioLeadership("client-b", 1_500)).toBe(false);
    expect(claimAudioLeadership("client-b", 3_001)).toBe(true);
  });

  it("lets the current leader renew its lease", () => {
    expect(claimAudioLeadership("client-a", 1_000)).toBe(true);
    expect(claimAudioLeadership("client-a", 2_500)).toBe(true);
    expect(claimAudioLeadership("client-b", 3_000)).toBe(false);
  });

  it("lets a visible client preempt a hidden leader", () => {
    expect(claimAudioLeadership("hidden-client", 1_000, 0)).toBe(true);
    expect(claimAudioLeadership("visible-client", 1_100, 1)).toBe(true);
    expect(claimAudioLeadership("hidden-client", 1_200, 0)).toBe(false);
  });
});
