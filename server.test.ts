import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import { NOTIFICATION_CHANNEL, SOUND_IDS } from "./domain";

describe("Chime backend", () => {
  it("serves every themed sound as a WAV asset", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "chime" });
    await plugin(bb);

    for (const soundId of SOUND_IDS) {
      const response = await harness.behavior.fetchHttp("GET", `/sound-${soundId}`);
      expect(response.headers.get("content-type")).toBe("audio/wav");
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("RIFF");
    }
    await harness.lifecycle.dispose();
  });

  it("publishes lifecycle events without message content", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "chime",
      sdk: {
        projects: { list: async () => [] },
        threads: { events: { list: async () => [] } },
      },
    });
    await plugin(bb);

    await harness.behavior.emitThreadEvent("thread.active", {
      thread: makeThreadResponse({ id: "thread-1", projectId: "project-1" }),
    });
    const signals = harness.inspection.realtimeSignals;

    expect(signals).toEqual([{
      channel: NOTIFICATION_CHANNEL,
      payload: expect.objectContaining({
        notification: expect.objectContaining({
          id: expect.any(String),
          kind: "started",
          threadId: "thread-1",
          projectId: "project-1",
        }),
      }),
    }]);
    expect(JSON.stringify(signals)).not.toContain("message");
    await harness.lifecycle.dispose();
  });

  it("honours muted projects before publishing", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "chime" });
    await plugin(bb);
    await harness.behavior.callRpc("updateConfig", {
      enabled: true,
      volume: 0.5,
      deliveryMode: "client",
      muteVisibleThread: false,
      mutedProjectIds: ["project-1"],
      eventEnabled: { started: true, completed: true, question: true, approval: true, failed: true, cancelled: true },
      eventSounds: {
        started: "soft-rise",
        completed: "warm-resolve",
        question: "clear-question",
        approval: "gentle-knock",
        failed: "low-warning",
        cancelled: "soft-stop",
      },
    });
    await harness.behavior.emitThreadEvent("thread.active", {
      thread: makeThreadResponse({ id: "thread-1", projectId: "project-1" }),
    });
    expect(harness.inspection.realtimeSignals).toEqual([]);
    await harness.lifecycle.dispose();
  });

  it("publishes pending questions and approvals only", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "chime" });
    await plugin(bb);
    const thread = makeThreadResponse({ id: "thread-1", projectId: "project-1" });
    const pending = (id: string, kind: string) => ({
      thread,
      interaction: { id, threadId: "thread-1", status: "pending", payload: { kind } } as never,
    });

    await harness.behavior.emitThreadEvent("interaction.pending", pending("interaction-1", "user_question"));
    await harness.behavior.emitThreadEvent("interaction.pending", pending("interaction-2", "approval"));
    await harness.behavior.emitThreadEvent("interaction.pending", pending("interaction-3", "plugin"));

    expect(harness.inspection.realtimeSignals.map(({ payload }) => (payload as { notification: unknown }).notification)).toEqual([
      expect.objectContaining({ kind: "question", interactionId: "interaction-1" }),
      expect.objectContaining({ kind: "approval", interactionId: "interaction-2" }),
    ]);
    await harness.lifecycle.dispose();
  });
});
