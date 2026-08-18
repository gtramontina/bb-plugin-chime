import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

describe("Chime backend", () => {
  it("publishes lifecycle events without message content", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "chime",
      sdk: {
        subscribe: () => () => {},
        projects: { list: async () => [] },
        threads: {
          events: { list: async () => [] },
          interactions: { list: async () => [] },
          get: async () => makeThreadResponse({ id: "thread-1", projectId: "project-1" }),
        },
      },
    });
    await plugin(bb);

    await harness.behavior.emitThreadEvent("thread.active", {
      thread: makeThreadResponse({ id: "thread-1", projectId: "project-1" }),
    });
    const response = await harness.behavior.fetchHttp("GET", "/events?after=0");
    const payload = await response.json() as { events: Array<Record<string, unknown>> };

    expect(payload.events).toEqual([expect.objectContaining({
      seq: expect.any(Number),
      notification: expect.objectContaining({
        kind: "started",
        threadId: "thread-1",
        projectId: "project-1",
      }),
    })]);
    expect(JSON.stringify(payload)).not.toContain("message");
    await harness.lifecycle.dispose();
  });

  it("honours muted projects before queueing", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "chime",
      sdk: { subscribe: () => () => {} },
    });
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
    const response = await harness.behavior.fetchHttp("GET", "/events?after=0");
    const payload = await response.json() as { events: unknown[] };
    expect(payload.events).toEqual([]);
    await harness.lifecycle.dispose();
  });

  it("publishes each pending interaction once", async () => {
    let changed: ((event: { id?: string; changes: readonly string[] }) => void) | undefined;
    const interactions = [{
      id: "interaction-1",
      status: "pending",
      payload: { kind: "user_question" },
    }];
    const thread = makeThreadResponse({ id: "thread-1", projectId: "project-1" });
    const { bb, harness } = createFakePluginHost({
      pluginId: "chime",
      sdk: {
        subscribe: ((args: { callback: typeof changed }) => {
          changed = args.callback;
          return () => {};
        }) as never,
        threads: {
          interactions: { list: async () => interactions as never },
          get: async () => thread,
        },
      },
    });
    await plugin(bb);

    changed?.({ id: "thread-1", changes: ["interactions-changed"] });
    changed?.({ id: "thread-1", changes: ["interactions-changed"] });

    await vi.waitFor(async () => {
      const response = await harness.behavior.fetchHttp("GET", "/events?after=0");
      const payload = await response.json() as { events: Array<{ notification: { kind: string; interactionId?: string } }> };
      expect(payload.events.map(({ notification }) => notification)).toEqual([
        expect.objectContaining({ kind: "question", interactionId: "interaction-1" }),
      ]);
    });
    await harness.lifecycle.dispose();
  });
});
