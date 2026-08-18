const PRESENCE_TTL_MS = 3_000;

export class ClientPresence {
  private clients = new Map<string, { threadId: string | null; seenAt: number }>();

  update(clientId: string, threadId: string | null, now = Date.now()): void {
    if (!clientId || clientId.length > 100) return;
    this.clients.set(clientId, { threadId, seenAt: now });
    this.prune(now);
  }

  isVisible(threadId: string, now = Date.now()): boolean {
    this.prune(now);
    return [...this.clients.values()].some((presence) => presence.threadId === threadId);
  }

  private prune(now: number): void {
    for (const [clientId, presence] of this.clients) {
      if (now - presence.seenAt > PRESENCE_TTL_MS) this.clients.delete(clientId);
    }
  }
}
