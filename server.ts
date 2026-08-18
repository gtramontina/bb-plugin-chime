import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  EVENT_KINDS,
  SOUND_IDS,
  chooseStormNotification,
  normalizeConfig,
  type ChimeConfig,
  type ChimeNotification,
  type EventKind,
} from "./domain";
import { EventBroker, classifyIdleEvent, classifyPendingInteraction } from "./event-broker";
import { ClientPresence } from "./client-presence";
import { isServerPlaybackAvailable, playServerSound, readSoundAsset } from "./server-audio";
import { StormBuffer } from "./storm-buffer";

const eventKindSchema = z.enum(EVENT_KINDS);
const soundIdSchema = z.enum(SOUND_IDS);
const configSchema = z.object({
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
  deliveryMode: z.enum(["client", "server"]),
  muteVisibleThread: z.boolean(),
  mutedProjectIds: z.array(z.string()),
  eventEnabled: z.record(eventKindSchema, z.boolean()),
  eventSounds: z.record(eventKindSchema, soundIdSchema),
});
export const rpcContract = defineRpcContract({
  getConfig: {
    input: z.null(),
    output: z.object({
      config: configSchema,
      projects: z.array(z.object({ id: z.string(), name: z.string() })),
      serverPlaybackAvailable: z.boolean(),
    }),
  },
  updateConfig: {
    input: configSchema,
    output: z.object({ config: configSchema }),
  },
  previewServer: {
    input: z.object({ soundId: soundIdSchema }),
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
  },
});

async function loadConfig(bb: BbPluginApi): Promise<ChimeConfig> {
  return normalizeConfig(await bb.storage.kv.get<Partial<ChimeConfig>>("config"));
}

export default async function plugin(bb: BbPluginApi) {
  const broker = new EventBroker();
  const seenInteractionsByThread = new Map<string, Set<string>>();
  const scanningThreads = new Set<string>();
  const pendingRescans = new Set<string>();
  const clientPresence = new ClientPresence();
  const serverPlaybackAvailable = isServerPlaybackAvailable();
  const serverStorm = new StormBuffer<{ notification: ChimeNotification; config: ChimeConfig }>(
    1_000,
    (entries) => {
      const chosen = chooseStormNotification(entries.map(({ notification }) => notification));
      return chosen ? entries.find(({ notification }) => notification === chosen) ?? null : null;
    },
    ({ notification, config }) => void playServerSound(
      config.eventSounds[notification.kind],
      config.volume,
    ).catch((error: unknown) => {
      bb.log.warn(`server playback failed: ${error instanceof Error ? error.message : String(error)}`);
    }),
  );

  async function publishChimeNotification(
    kind: EventKind,
    thread: { id: string; projectId: string },
    interactionId?: string,
  ): Promise<void> {
    const config = await loadConfig(bb);
    if (!config.enabled || !config.eventEnabled[kind] || config.mutedProjectIds.includes(thread.projectId)) {
      return;
    }
    const queued = broker.publish({ kind, threadId: thread.id, projectId: thread.projectId, interactionId });
    if (config.deliveryMode === "server" && serverPlaybackAvailable) {
      if (config.muteVisibleThread && clientPresence.isVisible(thread.id)) return;
      serverStorm.push({ notification: queued.notification, config });
    }
  }

  async function scanPendingInteractions(threadId: string): Promise<void> {
    if (scanningThreads.has(threadId)) {
      pendingRescans.add(threadId);
      return;
    }
    scanningThreads.add(threadId);
    try {
      do {
        pendingRescans.delete(threadId);
        const interactions = await bb.sdk.threads.interactions.list({ threadId });
        const thread = await bb.sdk.threads.get({ threadId });
        const previouslySeen = seenInteractionsByThread.get(threadId) ?? new Set<string>();
        const pendingIds = new Set<string>();
        for (const interaction of interactions) {
          const kind = classifyPendingInteraction(interaction);
          if (!kind) continue;
          pendingIds.add(interaction.id);
          if (!previouslySeen.has(interaction.id)) {
            await publishChimeNotification(kind, thread, interaction.id);
          }
        }
        if (pendingIds.size > 0) seenInteractionsByThread.set(threadId, pendingIds);
        else seenInteractionsByThread.delete(threadId);
      } while (pendingRescans.has(threadId));
    } finally {
      scanningThreads.delete(threadId);
    }
  }

  bb.events.on("thread.active", ({ thread }) => publishChimeNotification("started", thread));
  bb.events.on("thread.idle", async ({ thread }) => {
    try {
      const events = await bb.sdk.threads.events.list({ threadId: thread.id, limit: "30" });
      await publishChimeNotification(classifyIdleEvent(events), thread);
    } catch (error) {
      bb.log.warn(`cancellation detection failed; using completion: ${error instanceof Error ? error.message : String(error)}`);
      await publishChimeNotification("completed", thread);
    }
  });
  bb.events.on("thread.failed", ({ thread }) => publishChimeNotification("failed", thread));
  bb.events.on("thread.archived", ({ thread }) => {
    seenInteractionsByThread.delete(thread.id);
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    seenInteractionsByThread.delete(thread.id);
  });

  const unsubscribe = bb.sdk.subscribe({
    event: "thread:changed",
    callback: (event) => {
      if (!event.id || !event.changes.includes("interactions-changed")) return;
      void scanPendingInteractions(event.id).catch((error: unknown) => {
        bb.log.warn(`interaction scan failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
  });
  bb.onDispose(unsubscribe);
  bb.onDispose(() => serverStorm.dispose());

  bb.rpc.register(rpcContract, {
    async getConfig() {
      const projects = await bb.sdk.projects.list({ includePersonal: true });
      return {
        config: await loadConfig(bb),
        projects: projects.map(({ id, name }) => ({ id, name })),
        serverPlaybackAvailable,
      };
    },
    async updateConfig(input) {
      const config = normalizeConfig(input);
      await bb.storage.kv.set("config", config);
      return { config };
    },
    async previewServer({ soundId }) {
      if (!serverPlaybackAvailable) return { ok: false, error: "Server playback requires macOS and /usr/bin/afplay." };
      const config = await loadConfig(bb);
      try {
        await playServerSound(soundId, config.volume);
        return { ok: true, error: null };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  bb.http.route("GET", "/events", async (context) => {
    const afterText = context.req.query("after") ?? "0";
    const after = /^\d+$/.test(afterText) ? Number(afterText) : 0;
    const result = broker.after(after);
    return context.json({ ...result, config: await loadConfig(bb) });
  });

  bb.http.route("GET", "/presence", (context) => {
    const clientId = context.req.query("client");
    if (clientId) clientPresence.update(clientId, context.req.query("visibleThread") || null);
    return new Response(null, { status: 204 });
  });

  for (const soundId of SOUND_IDS) {
    bb.http.route("GET", `/sound-${soundId}`, () => new Response(new Uint8Array(readSoundAsset(soundId)), {
      headers: { "content-type": "audio/wav", "cache-control": "public, max-age=31536000, immutable" },
    }));
  }

  bb.log.info(`loaded; server playback ${serverPlaybackAvailable ? "available" : "unavailable"}`);
}
