import { describe, expect, it } from "vitest";
import { ClientPresence } from "./client-presence";

describe("ClientPresence", () => {
  it("tracks visible threads for server-side muting", () => {
    const presence = new ClientPresence();
    presence.update("client-1", "thr_visible", 1_000);
    expect(presence.isVisible("thr_visible", 2_000)).toBe(true);
    expect(presence.isVisible("thr_other", 2_000)).toBe(false);
  });

  it("expires clients that stop polling", () => {
    const presence = new ClientPresence();
    presence.update("client-1", "thr_visible", 1_000);
    expect(presence.isVisible("thr_visible", 4_001)).toBe(false);
  });
});
