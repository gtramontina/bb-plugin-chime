export const EVENT_KINDS = [
  "started",
  "completed",
  "question",
  "approval",
  "failed",
  "cancelled",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const SOUND_IDS = [
  "soft-rise",
  "warm-resolve",
  "clear-question",
  "gentle-knock",
  "low-warning",
  "soft-stop",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];
export type DeliveryMode = "client" | "server";

export interface ChimeConfig {
  enabled: boolean;
  volume: number;
  deliveryMode: DeliveryMode;
  muteVisibleThread: boolean;
  mutedProjectIds: string[];
  eventEnabled: Record<EventKind, boolean>;
  eventSounds: Record<EventKind, SoundId>;
}

export interface ChimeNotification {
  kind: EventKind;
  threadId: string;
  projectId: string;
  interactionId?: string;
  timestamp: number;
}

export interface QueuedChimeNotification {
  seq: number;
  notification: ChimeNotification;
}

export const DEFAULT_CONFIG: ChimeConfig = {
  enabled: true,
  volume: 0.5,
  deliveryMode: "client",
  muteVisibleThread: false,
  mutedProjectIds: [],
  eventEnabled: {
    started: true,
    completed: true,
    question: true,
    approval: true,
    failed: true,
    cancelled: true,
  },
  eventSounds: {
    started: "soft-rise",
    completed: "warm-resolve",
    question: "clear-question",
    approval: "gentle-knock",
    failed: "low-warning",
    cancelled: "soft-stop",
  },
};

const EVENT_PRIORITY: Record<EventKind, number> = {
  started: 0,
  completed: 1,
  cancelled: 2,
  question: 3,
  approval: 4,
  failed: 5,
};

export const EVENT_LABELS: Record<EventKind, string> = {
  started: "Turn started",
  completed: "Turn completed",
  question: "Waiting for an answer",
  approval: "Approval required",
  failed: "Turn failed",
  cancelled: "Turn cancelled",
};

export const SOUND_LABELS: Record<SoundId, string> = {
  "soft-rise": "Soft rise",
  "warm-resolve": "Warm resolve",
  "clear-question": "Clear question",
  "gentle-knock": "Gentle knock",
  "low-warning": "Low warning",
  "soft-stop": "Soft stop",
};

export function normalizeConfig(value: Partial<ChimeConfig> | null | undefined): ChimeConfig {
  const volume = typeof value?.volume === "number" && Number.isFinite(value.volume)
    ? Math.min(1, Math.max(0, value.volume))
    : DEFAULT_CONFIG.volume;
  const deliveryMode = value?.deliveryMode === "server" ? "server" : "client";
  const mutedProjectIds = Array.isArray(value?.mutedProjectIds)
    ? [...new Set(value.mutedProjectIds.filter((id): id is string => typeof id === "string"))]
    : [];

  return {
    enabled: value?.enabled ?? DEFAULT_CONFIG.enabled,
    volume,
    deliveryMode,
    muteVisibleThread: value?.muteVisibleThread ?? DEFAULT_CONFIG.muteVisibleThread,
    mutedProjectIds,
    eventEnabled: Object.fromEntries(
      EVENT_KINDS.map((kind) => [kind, value?.eventEnabled?.[kind] ?? true]),
    ) as Record<EventKind, boolean>,
    eventSounds: Object.fromEntries(
      EVENT_KINDS.map((kind) => {
        const candidate = value?.eventSounds?.[kind];
        return [kind, SOUND_IDS.includes(candidate as SoundId) ? candidate : DEFAULT_CONFIG.eventSounds[kind]];
      }),
    ) as Record<EventKind, SoundId>,
  };
}

function decodedPathSegments(pathname: string): string[] {
  return pathname.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

export function isVisibleThread(threadId: string, pathname: string): boolean {
  return decodedPathSegments(pathname).includes(threadId);
}

export function visibleThreadId(pathname: string): string | null {
  return decodedPathSegments(pathname).find((segment) => segment.startsWith("thr_")) ?? null;
}

export function chooseStormNotification(notifications: ChimeNotification[]): ChimeNotification | null {
  return notifications.reduce<ChimeNotification | null>((chosen, notification) => {
    if (!chosen) return notification;
    const priorityDelta = EVENT_PRIORITY[notification.kind] - EVENT_PRIORITY[chosen.kind];
    return priorityDelta > 0 || (priorityDelta === 0 && notification.timestamp > chosen.timestamp)
      ? notification
      : chosen;
  }, null);
}

export function shouldPlayNotification(
  notification: ChimeNotification,
  config: ChimeConfig,
  now: number,
  pathname: string,
): boolean {
  if (!config.enabled || config.deliveryMode !== "client") return false;
  if (!config.eventEnabled[notification.kind]) return false;
  if (now - notification.timestamp > 5_000) return false;
  if (config.mutedProjectIds.includes(notification.projectId)) return false;
  if (config.muteVisibleThread && isVisibleThread(notification.threadId, pathname)) return false;
  return true;
}
