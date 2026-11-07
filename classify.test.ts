import { describe, expect, it } from "vitest";
import { classifyIdleEvent, classifyPendingInteraction } from "./classify";

describe("classifyPendingInteraction", () => {
  it("recognizes pending questions and approvals only", () => {
    expect(classifyPendingInteraction({ status: "pending", payload: { kind: "user_question" } })).toBe("question");
    expect(classifyPendingInteraction({ status: "pending", payload: { kind: "approval" } })).toBe("approval");
    expect(classifyPendingInteraction({ status: "resolved", payload: { kind: "user_question" } })).toBeNull();
    expect(classifyPendingInteraction({ status: "pending", payload: { kind: "plugin" } })).toBeNull();
  });
});

describe("classifyIdleEvent", () => {
  it("detects a latest manual stop", () => {
    expect(classifyIdleEvent([
      { type: "turn/completed", data: {}, seq: 8 },
      { type: "system/thread/interrupted", data: { reason: "manual-stop" }, seq: 9 },
    ])).toBe("cancelled");
  });

  it("falls back to completion for other interruption reasons", () => {
    expect(classifyIdleEvent([
      { type: "system/thread/interrupted", data: { reason: "provider-turn-idle" }, seq: 9 },
    ])).toBe("completed");
  });
});
