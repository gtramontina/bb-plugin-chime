import { describe, expect, it } from "vitest";
import { EventBroker, classifyIdleEvent, classifyPendingInteraction } from "./event-broker";

describe("EventBroker", () => {
  it("uses cursors without persisting history", () => {
    const broker = new EventBroker();
    broker.publish({ kind: "started", threadId: "t1", projectId: "p1" }, 1_000);
    const second = broker.publish({ kind: "completed", threadId: "t1", projectId: "p1" }, 1_100);

    expect(broker.after(0, 1_200).events).toHaveLength(2);
    expect(broker.after(second.seq, 1_200).events).toEqual([]);
  });

  it("expires transient events", () => {
    const broker = new EventBroker();
    broker.publish({ kind: "started", threadId: "t1", projectId: "p1" }, 1_000);
    expect(broker.after(0, 31_001).events).toEqual([]);
  });
});

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
