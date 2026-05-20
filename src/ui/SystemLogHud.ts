export type SystemLogKind = 'info' | 'success' | 'warning';

export type SystemLogEntry = {
  message: string;
  kind?: SystemLogKind;
};

type RenderedLogEntry = Required<SystemLogEntry> & {
  id: number;
  createdAt: number;
};

export type SystemLogEvent = CustomEvent<SystemLogEntry>;

const MAX_LOGS = 3;
const LOG_TTL_MS = 6_000;
const SYSTEM_LOG_EVENT = 'dalworld:system-log';

export class SystemLogHud {
  readonly element: HTMLDivElement;

  private readonly list: HTMLDivElement;
  private readonly entries: RenderedLogEntry[] = [];
  private nextId = 1;
  private pruneTimer: ReturnType<typeof window.setInterval> | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'dalworld-system-log';
    this.element.setAttribute('aria-live', 'polite');

    this.list = document.createElement('div');
    this.list.className = 'system-log-list';
    this.element.appendChild(this.list);
  }

  mount(parent: HTMLElement): void {
    if (!this.element.parentElement) {
      parent.appendChild(this.element);
    }

    if (this.pruneTimer === null) {
      this.pruneTimer = window.setInterval(() => this.pruneExpired(), 750);
    }
  }

  destroy(): void {
    if (this.pruneTimer !== null) {
      window.clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.element.remove();
    this.entries.length = 0;
  }

  push(entry: SystemLogEntry): void {
    const message = entry.message.trim();
    if (!message) return;

    const now = Date.now();
    const latest = this.entries[this.entries.length - 1];
    if (latest && latest.message === message && now - latest.createdAt < 1_200) {
      latest.createdAt = now;
      this.render();
      return;
    }

    this.entries.push({
      id: this.nextId,
      message,
      kind: entry.kind ?? 'info',
      createdAt: now,
    });
    this.nextId += 1;

    while (this.entries.length > MAX_LOGS) {
      this.entries.shift();
    }

    this.render();
  }

  private pruneExpired(): void {
    const now = Date.now();
    const before = this.entries.length;

    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      if (now - this.entries[i].createdAt > LOG_TTL_MS) {
        this.entries.splice(i, 1);
      }
    }

    if (before !== this.entries.length) this.render();
  }

  private render(): void {
    this.list.innerHTML = '';

    for (const entry of this.entries) {
      const item = document.createElement('div');
      item.className = `system-log-entry is-${entry.kind}`;
      item.textContent = entry.message;
      this.list.appendChild(item);
    }
  }
}

export function emitSystemLog(entry: SystemLogEntry): void {
  window.dispatchEvent(new CustomEvent<SystemLogEntry>(SYSTEM_LOG_EVENT, { detail: entry }));
}

export function installSystemLogHud(parent: HTMLElement = document.body): SystemLogHud {
  const hud = new SystemLogHud();
  hud.mount(parent);

  window.addEventListener(SYSTEM_LOG_EVENT, (event) => {
    const logEvent = event as SystemLogEvent;
    hud.push(logEvent.detail);
  });

  return hud;
}
