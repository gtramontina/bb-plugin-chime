import {
  chooseStormNotification,
  normalizeConfig,
  shouldPlayNotification,
  type ChimeConfig,
  type ChimeNotification,
  type SoundId,
} from "./domain";
import { StormBuffer } from "./storm-buffer";

const STORM_WINDOW_MS = 1_000;
const HIDDEN_CLAIM_DELAY_MS = 300;
const PRESENCE_REFRESH_MS = 30_000;
const PLAYED_KEY = "bb-plugin-chime:played";
const PLAYBACK_LOCK = "bb-plugin-chime:playback";
const AUDIO_STATUS_KEY = "bb-plugin-chime:audio-status";

interface Delivery {
  notification: ChimeNotification;
  config: ChimeConfig;
}

function soundUrl(pluginId: string, soundId: SoundId): string {
  return `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/sound-${soundId}`;
}

export async function playClientSound(pluginId: string, soundId: SoundId, volume: number): Promise<void> {
  const audio = new Audio(soundUrl(pluginId, soundId));
  audio.volume = volume;
  try {
    await audio.play();
    localStorage.setItem(AUDIO_STATUS_KEY, "active");
  } catch (error) {
    localStorage.setItem(AUDIO_STATUS_KEY, "blocked");
    throw error;
  }
}

export function audioActivationStatus(): "active" | "blocked" | "unknown" {
  const status = localStorage.getItem(AUDIO_STATUS_KEY);
  return status === "active" || status === "blocked" ? status : "unknown";
}

const VISIBLE_LOCK_PREFIX = "bb-plugin-chime:visible:";

function parseDelivery(payload: unknown): Delivery | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { notification, config } = payload as Partial<Delivery>;
  if (typeof notification?.id !== "string" || typeof notification.threadId !== "string") return null;
  return { notification, config: normalizeConfig(config) };
}

export function claimNotification(id: string): boolean {
  let played: string[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PLAYED_KEY) ?? "[]");
    played = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    played = [];
  }
  if (played.includes(id)) return false;
  localStorage.setItem(PLAYED_KEY, JSON.stringify([...played.slice(-49), id]));
  return true;
}

export function createAudioClient(pluginId: string) {
  const clientId = crypto.randomUUID();
  const abort = new AbortController();
  let threadId: string | null = null;
  let visibleLock: { threadId: string; release: () => void } | null = null;
  let reportedThreadId: string | null | undefined = null;
  let presenceTimer: ReturnType<typeof setTimeout> | undefined;

  function visibleThreadHere(): string | null {
    return document.visibilityState === "visible" ? threadId : null;
  }

  function reportPresence(visibleThread: string | null, keepalive = false): void {
    reportedThreadId = visibleThread;
    void fetch(
      `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/presence?client=${encodeURIComponent(clientId)}&visibleThread=${encodeURIComponent(visibleThread ?? "")}`,
      { cache: "no-store", keepalive },
    ).catch(() => undefined);
  }

  function syncPresence(): void {
    const visibleThread = abort.signal.aborted ? null : visibleThreadHere();
    if (visibleThread !== reportedThreadId) {
      if (presenceTimer) clearTimeout(presenceTimer);
      presenceTimer = undefined;
      reportPresence(visibleThread, abort.signal.aborted);
    }
    if (visibleThread !== null && !presenceTimer) {
      presenceTimer = setTimeout(() => {
        presenceTimer = undefined;
        reportedThreadId = undefined;
        syncPresence();
      }, PRESENCE_REFRESH_MS);
    }

    if (visibleLock?.threadId === visibleThread) return;
    visibleLock?.release();
    visibleLock = null;
    if (visibleThread === null || !navigator.locks) return;
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    visibleLock = { threadId: visibleThread, release };
    void navigator.locks
      .request(`${VISIBLE_LOCK_PREFIX}${visibleThread}`, { mode: "shared" }, () => held)
      .catch(() => undefined);
  }

  async function visibleThreadIds(): Promise<Set<string>> {
    const here = visibleThreadHere();
    const ids = new Set<string>(here ? [here] : []);
    if (!navigator.locks) return ids;
    const { held = [] } = await navigator.locks.query();
    for (const lock of held) {
      if (lock.name?.startsWith(VISIBLE_LOCK_PREFIX)) ids.add(lock.name.slice(VISIBLE_LOCK_PREFIX.length));
    }
    return ids;
  }

  async function play({ notification, config }: Delivery): Promise<void> {
    if (document.visibilityState !== "visible") {
      await new Promise((resolve) => setTimeout(resolve, HIDDEN_CLAIM_DELAY_MS));
    }
    if (abort.signal.aborted) return;
    const claim = async () => {
      if (abort.signal.aborted || !claimNotification(notification.id)) return;
      await playClientSound(pluginId, config.eventSounds[notification.kind], config.volume);
    };
    if (navigator.locks) await navigator.locks.request(PLAYBACK_LOCK, claim);
    else await claim();
  }

  const storm = new StormBuffer<Delivery>(
    STORM_WINDOW_MS,
    (deliveries) => {
      const chosen = chooseStormNotification(deliveries.map(({ notification }) => notification));
      return chosen ? deliveries.find(({ notification }) => notification === chosen) ?? null : null;
    },
    (delivery) => void play(delivery).catch(() => {
      // Autoplay restrictions are surfaced in the settings status.
    }),
  );

  async function receive(payload: unknown): Promise<void> {
    const delivery = parseDelivery(payload);
    if (!delivery || abort.signal.aborted) return;
    const visible = await visibleThreadIds();
    if (shouldPlayNotification(delivery.notification, delivery.config, Date.now(), visible)) storm.push(delivery);
  }

  const attemptAudioActivation = () => {
    if (audioActivationStatus() === "active") return;
    const audio = new Audio(soundUrl(pluginId, "soft-rise"));
    audio.volume = 0;
    void audio.play()
      .then(() => localStorage.setItem(AUDIO_STATUS_KEY, "active"))
      .catch(() => localStorage.setItem(AUDIO_STATUS_KEY, "blocked"));
  };
  document.addEventListener("pointerdown", attemptAudioActivation, { once: true, signal: abort.signal });
  document.addEventListener("keydown", attemptAudioActivation, { once: true, signal: abort.signal });
  document.addEventListener("visibilitychange", syncPresence, { signal: abort.signal });
  window.addEventListener("pagehide", () => reportPresence(null, true), { signal: abort.signal });
  window.addEventListener("pageshow", () => {
    reportedThreadId = undefined;
    syncPresence();
  }, { signal: abort.signal });

  return {
    receive,
    setThreadId(next: string | null): void {
      threadId = next;
      syncPresence();
    },
    dispose(): void {
      abort.abort();
      if (presenceTimer) clearTimeout(presenceTimer);
      storm.dispose();
      syncPresence();
    },
  };
}
