// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { claimNotification } from "./client-audio";

describe("audio client claims", () => {
  beforeEach(() => localStorage.clear());

  it("lets one window or tab claim each notification", () => {
    expect(claimNotification("notification-1")).toBe(true);
    expect(claimNotification("notification-1")).toBe(false);
    expect(claimNotification("notification-2")).toBe(true);
  });

  it("recovers from a corrupt claim list", () => {
    localStorage.setItem("bb-plugin-chime:played", "{");
    expect(claimNotification("notification-1")).toBe(true);
    expect(claimNotification("notification-1")).toBe(false);
  });
});
