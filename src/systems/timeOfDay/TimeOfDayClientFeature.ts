import type { ClientToServerMessage, ServerToClientMessage } from '../../protocol/messages';
import { TimeOfDayToggle } from '../../ui/TimeOfDayToggle';
import { normalizeTimeOfDay, type TimeOfDayState } from './TimeOfDayTypes';

let installed = false;
let activeSocket: WebSocket | null = null;
let toggle: TimeOfDayToggle | null = null;
let overlay: HTMLDivElement | null = null;
let currentState: TimeOfDayState = { mode: 'day' };

/**
 * Lightweight UI/visual feature for day/night until the Pixi lighting renderer
 * is wired into GameApp directly.
 *
 * The authoritative state still comes from the server through welcome/snapshot
 * messages. The button only sends a request; it never changes the visual state
 * optimistically.
 */
export function installTimeOfDayClientFeature(parent: HTMLElement = document.body): void {
  if (installed) return;
  installed = true;

  installSocketObserver();
  overlay = createNightOverlay();
  parent.appendChild(overlay);

  toggle = new TimeOfDayToggle({
    onToggle: () => sendTimeOfDayToggleRequest(),
  });
  toggle.mount(parent);
  applyTimeOfDayState(currentState);
}

function installSocketObserver(): void {
  const NativeWebSocket = window.WebSocket;

  const WrappedWebSocket = function WebSocketWrapper(
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[],
  ): WebSocket {
    const socket = protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);

    activeSocket = socket;
    socket.addEventListener('message', (event) => handleSocketMessage(event.data));
    socket.addEventListener('close', () => {
      if (activeSocket === socket) activeSocket = null;
    });

    return socket;
  } as unknown as typeof WebSocket;

  Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);
  WrappedWebSocket.prototype = NativeWebSocket.prototype;
  window.WebSocket = WrappedWebSocket;
}

function handleSocketMessage(raw: unknown): void {
  if (typeof raw !== 'string') return;

  let message: ServerToClientMessage;
  try {
    message = JSON.parse(raw) as ServerToClientMessage;
  } catch {
    return;
  }

  if ((message.type === 'welcome' || message.type === 'snapshot') && message.timeOfDay) {
    applyTimeOfDayState(normalizeTimeOfDay(message.timeOfDay));
  }
}

function sendTimeOfDayToggleRequest(): void {
  const message: ClientToServerMessage = {
    type: 'TIME_OF_DAY_TOGGLE_REQUEST',
    requestId: crypto.randomUUID(),
  };

  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
  activeSocket.send(JSON.stringify(message));
}

function applyTimeOfDayState(state: TimeOfDayState): void {
  currentState = state;
  toggle?.setState(state);

  if (!overlay) return;
  overlay.hidden = state.mode !== 'night';
}

function createNightOverlay(): HTMLDivElement {
  const element = document.createElement('div');
  element.id = 'dalworld-night-overlay';
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;
  return element;
}
