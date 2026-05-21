import type { ClientToServerMessage, ServerToClientMessage } from '../protocol/messages';

type NetworkStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type Listener<T> = (payload: T) => void;

export type GameConnectionProfile = {
  sessionToken?: string;
  accountId?: string;
  characterName?: string;
};

const RECONNECT_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
const PING_INTERVAL_MS = 5_000;
const CLIENT_ID_STORAGE_KEY = 'dalworld:client-id';

export class GameNetwork {
  private socket: WebSocket | null = null;
  private status: NetworkStatus = 'idle';
  private readonly messageListeners = new Set<Listener<ServerToClientMessage>>();
  private readonly statusListeners = new Set<Listener<NetworkStatus>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingSentAt = 0;
  private destroyed = false;

  /** Round-trip latency in ms; 0 until first pong received. */
  latencyMs = 0;

  constructor(private readonly url: string) {}

  get currentStatus(): NetworkStatus {
    return this.status;
  }

  connect(): void {
    if (this.destroyed) return;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.cleanupSocket();
    this.setStatus('connecting');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.setStatus('open');
      this.startPing();
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.stopPing();
      this.setStatus('closed');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.stopPing();
      this.setStatus('error');
      // close event follows; scheduleReconnect called there
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
    });
  }

  disconnect(): void {
    this.destroyed = true;
    this.cancelReconnect();
    this.stopPing();
    this.cleanupSocket();
    this.setStatus('closed');
  }

  send(message: ClientToServerMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  onMessage(listener: Listener<ServerToClientMessage>): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: Listener<NetworkStatus>): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private cleanupSocket(): void {
    if (!this.socket) return;
    const old = this.socket;
    this.socket = null;
    try {
      old.close(1000, 'reconnecting');
    } catch {
      // already closed
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.cancelReconnect();
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.lastPingSentAt = Date.now();
      this.send({ type: 'ping', now: this.lastPingSentAt });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: ServerToClientMessage;
    try {
      parsed = JSON.parse(raw) as ServerToClientMessage;
    } catch {
      return;
    }
    if (parsed.type === 'pong' && this.lastPingSentAt > 0) {
      this.latencyMs = Date.now() - this.lastPingSentAt;
    }
    this.messageListeners.forEach((listener) => listener(parsed));
  }

  private setStatus(next: NetworkStatus): void {
    this.status = next;
    this.statusListeners.forEach((listener) => listener(next));
  }
}

export function getDefaultWebSocketUrl(profile: GameConnectionProfile = {}): string {
  const envUrl = import.meta.env.VITE_DALWORLD_WS_URL;
  const clientId = getOrCreateClientId();

  if (typeof envUrl === 'string' && envUrl.length > 0) {
    return appendConnectionParams(envUrl, clientId, profile);
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return appendConnectionParams(`${protocol}//${window.location.host}/ws`, clientId, profile);
}

function appendConnectionParams(rawUrl: string, clientId: string, profile: GameConnectionProfile): string {
  const url = new URL(rawUrl, window.location.href);
  url.searchParams.set('clientId', clientId);
  if (profile.sessionToken) url.searchParams.set('sessionToken', profile.sessionToken);
  if (profile.accountId) url.searchParams.set('accountId', profile.accountId);
  if (profile.characterName) url.searchParams.set('name', profile.characterName);
  return url.toString();
}

function getOrCreateClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && isValidClientId(existing)) return existing;

    const next = `client_${crypto.randomUUID()}`;
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return `client_${crypto.randomUUID()}`;
  }
}

function isValidClientId(value: string): boolean {
  return /^client_[0-9a-fA-F-]{36}$/.test(value);
}

export type { NetworkStatus };
