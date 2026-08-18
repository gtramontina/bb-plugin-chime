import {
  chooseStormNotification,
  normalizeConfig,
  shouldPlayNotification,
  visibleThreadId,
  type ChimeConfig,
  type ChimeNotification,
  type QueuedChimeNotification,
  type SoundId,
} from "./domain";
import { StormBuffer } from "./storm-buffer";

const POLL_MS = 500;
const STORM_WINDOW_MS = 1_000;
const LEASE_MS = 2_000;
const LEASE_KEY = "bb-plugin-chime:leader";
const AUDIO_STATUS_KEY = "bb-plugin-chime:audio-status";

interface PollResponse {
  cursor: number;
  events: QueuedChimeNotification[];
  config: ChimeConfig;
}

interface Lease {
  owner: string;
  expiresAt: number;
  priority: number;
}

function readLease(): Lease | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEASE_KEY) ?? "null") as Partial<Lease> | null;
    return parsed && typeof parsed.owner === "string" && typeof parsed.expiresAt === "number"
      ? { owner: parsed.owner, expiresAt: parsed.expiresAt, priority: typeof parsed.priority === "number" ? parsed.priority : 0 }
      : null;
  } catch {
    return null;
  }
}

export function claimAudioLeadership(clientId: string, now = Date.now(), priority = 0): boolean {
  const lease = readLease();
  if (lease && lease.owner !== clientId && lease.expiresAt > now && lease.priority >= priority) return false;
  localStorage.setItem(LEASE_KEY, JSON.stringify({ owner: clientId, expiresAt: now + LEASE_MS, priority }));
  return readLease()?.owner === clientId;
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

export function startAudioClient(pluginId: string, signal: AbortSignal): () => void {
  const clientId = crypto.randomUUID();
  let cursor = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestConfig = normalizeConfig(null);

  const storm = new StormBuffer<ChimeNotification>(
    STORM_WINDOW_MS,
    (notifications) => chooseStormNotification(notifications.filter((notification) =>
      shouldPlayNotification(notification, latestConfig, Date.now(), window.location.pathname),
    )),
    (notification) => void playClientSound(
      pluginId,
      latestConfig.eventSounds[notification.kind],
      latestConfig.volume,
    ).catch(() => {
      // Autoplay restrictions are surfaced in the settings status.
    }),
  );

  const poll = async () => {
    if (signal.aborted) return;
    try {
      const visibleThread = document.visibilityState === "visible"
        ? visibleThreadId(window.location.pathname) ?? ""
        : "";
      await fetch(
        `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/presence?client=${encodeURIComponent(clientId)}&visibleThread=${encodeURIComponent(visibleThread)}`,
        { cache: "no-store", signal },
      );
      if (claimAudioLeadership(clientId, Date.now(), document.visibilityState === "visible" ? 1 : 0)) {
        const response = await fetch(
          `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/events?after=${cursor}`,
          { cache: "no-store", signal },
        );
        if (response.ok) {
          const payload = await response.json() as PollResponse;
          cursor = payload.cursor;
          latestConfig = normalizeConfig(payload.config);
          for (const event of payload.events) storm.push(event.notification);
        }
      }
    } catch (error) {
      if (!signal.aborted) console.warn("[plugin:chime] event poll failed", error);
    } finally {
      if (!signal.aborted) timer = setTimeout(() => void poll(), POLL_MS);
    }
  };

  const attemptAudioActivation = () => {
    if (audioActivationStatus() === "active") return;
    const audio = new Audio(soundUrl(pluginId, "soft-rise"));
    audio.volume = 0;
    void audio.play()
      .then(() => localStorage.setItem(AUDIO_STATUS_KEY, "active"))
      .catch(() => localStorage.setItem(AUDIO_STATUS_KEY, "blocked"));
  };
  document.addEventListener("pointerdown", attemptAudioActivation, { once: true, signal });
  document.addEventListener("keydown", attemptAudioActivation, { once: true, signal });
  void poll();

  return () => {
    if (timer) clearTimeout(timer);
    storm.dispose();
    const lease = readLease();
    if (lease?.owner === clientId) localStorage.removeItem(LEASE_KEY);
  };
}
