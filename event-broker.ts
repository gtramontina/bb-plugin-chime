import type { ChimeNotification, EventKind, QueuedChimeNotification } from "./domain";

const MAX_EVENTS = 200;
const RETENTION_MS = 30_000;

export class EventBroker {
  private events: QueuedChimeNotification[] = [];
  private nextSeq = 1;

  publish(input: Omit<ChimeNotification, "timestamp">, timestamp = Date.now()): QueuedChimeNotification {
    const event = { seq: this.nextSeq++, notification: { ...input, timestamp } };
    this.events.push(event);
    this.prune(timestamp);
    return event;
  }

  after(seq: number, now = Date.now()): { cursor: number; events: QueuedChimeNotification[] } {
    this.prune(now);
    return {
      cursor: this.nextSeq - 1,
      events: this.events.filter((event) => event.seq > seq),
    };
  }

  private prune(now: number): void {
    this.events = this.events
      .filter((event) => now - event.notification.timestamp <= RETENTION_MS)
      .slice(-MAX_EVENTS);
  }
}

export function classifyIdleEvent(
  events: Array<{ type: string; data: unknown; seq: number }>,
): Extract<EventKind, "completed" | "cancelled"> {
  const latestTerminal = [...events]
    .sort((left, right) => right.seq - left.seq)
    .find((event) => event.type === "turn/completed" || event.type === "system/thread/interrupted");

  if (latestTerminal?.type !== "system/thread/interrupted") return "completed";
  const data = latestTerminal.data as { reason?: unknown };
  return data.reason === "manual-stop" ? "cancelled" : "completed";
}

export function classifyPendingInteraction(interaction: {
  status: string;
  payload: { kind: string };
}): Extract<EventKind, "question" | "approval"> | null {
  if (interaction.status !== "pending") return null;
  if (interaction.payload.kind === "user_question") return "question";
  if (interaction.payload.kind === "approval") return "approval";
  return null;
}
