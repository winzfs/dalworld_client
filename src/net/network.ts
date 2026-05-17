import type { ClientToServerMessage, ServerToClientMessage } from './messages';

type NetworkStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type Listener<T> = (payload: T) => void;

export class GameNetwork {
  private socket: WebSocket | null = null;
  private status: NetworkStatus = 'idle';
  private readonly messageListeners = new Set<Listener<ServerToClientMessage>>();
  private readonly statusListeners = new Set<Listener<NetworkStatus>>();

  constructor(private readonly url: string) {}

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => this.setStatus('open'));
    this.socket.addEventListener('close', () => this.setStatus('closed'));
    this.socket.addEventListener('error', () => this.setStatus('error'));
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  disconnect(): void {
    this.socket?.close(1000, 'Client disconnected');
    this.socket = null;
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

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as ServerToClientMessage;
      this.messageListeners.forEach((listener) => listener(parsed));
    } catch {
      // 잘못된 서버 메시지는 클라이언트 크래시 없이 무시한다.
    }
  }

  private setStatus(next: NetworkStatus): void {
    this.status = next;
    this.statusListeners.forEach((listener) => listener(next));
  }
}

export function getDefaultWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
