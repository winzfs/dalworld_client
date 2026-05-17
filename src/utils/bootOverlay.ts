const BOOT_OVERLAY_ID = 'dalworld-boot-overlay';

type ErrorLike = Error | PromiseRejectionEvent | ErrorEvent | unknown;

export class BootOverlay {
  private readonly root: HTMLDivElement;
  private readonly pre: HTMLPreElement;

  constructor() {
    const existing = document.getElementById(BOOT_OVERLAY_ID);
    if (existing) {
      existing.remove();
    }

    this.root = document.createElement('div');
    this.root.id = BOOT_OVERLAY_ID;
    this.root.setAttribute('role', 'status');
    this.root.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'box-sizing:border-box',
      'padding:16px',
      'background:#101820',
      'color:#e0e6ed',
      'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'overflow:auto',
      'white-space:pre-wrap',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'dalworld booting...';
    title.style.cssText = 'font-weight:700;color:#55d6be;margin-bottom:8px';

    this.pre = document.createElement('pre');
    this.pre.textContent = 'Initializing Pixi.js client...';
    this.pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word';

    this.root.append(title, this.pre);
    document.body.appendChild(this.root);
  }

  setMessage(message: string): void {
    this.pre.textContent = message;
  }

  showError(error: ErrorLike): void {
    this.root.style.background = '#1b1014';
    this.root.style.color = '#ffe8ef';
    this.pre.textContent = formatError(error);

    const title = this.root.firstElementChild as HTMLElement | null;
    if (title) {
      title.textContent = 'dalworld failed to boot';
      title.style.color = '#ff6b8a';
    }
  }

  remove(): void {
    this.root.remove();
  }
}

export function installGlobalErrorOverlay(overlay: BootOverlay): void {
  window.addEventListener('error', (event) => {
    overlay.showError(event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    overlay.showError(event);
  });
}

function formatError(error: ErrorLike): string {
  if (error instanceof PromiseRejectionEvent) {
    return `Unhandled promise rejection:\n${formatError(error.reason)}`;
  }

  if (error instanceof ErrorEvent) {
    const details = [
      error.message,
      error.filename ? `at ${error.filename}:${error.lineno}:${error.colno}` : '',
      error.error ? formatError(error.error) : '',
    ].filter(Boolean);
    return details.join('\n');
  }

  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}
