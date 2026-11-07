import type { EventKind } from "./domain";

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
