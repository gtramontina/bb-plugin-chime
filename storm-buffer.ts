export class StormBuffer<T> {
  private items: T[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly windowMs: number,
    private readonly choose: (items: T[]) => T | null,
    private readonly flushItem: (item: T) => void,
  ) {}

  push(item: T): void {
    this.items.push(item);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.windowMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.items = [];
  }

  private flush(): void {
    this.timer = undefined;
    const chosen = this.choose(this.items);
    this.items = [];
    if (chosen) this.flushItem(chosen);
  }
}
