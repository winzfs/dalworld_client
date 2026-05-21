const EDITOR_BOOT_PROBE_ID = 'dalworld-editor-boot-probe';

export class EditorBootProbe {
  private readonly root: HTMLDivElement;
  private readonly lines: string[] = [];

  constructor() {
    document.getElementById(EDITOR_BOOT_PROBE_ID)?.remove();

    this.root = document.createElement('div');
    this.root.id = EDITOR_BOOT_PROBE_ID;
    this.root.style.cssText = [
      'position:fixed',
      'right:8px',
      'top:8px',
      'z-index:2147483647',
      'max-width:min(520px,calc(100vw - 16px))',
      'max-height:70vh',
      'overflow:auto',
      'box-sizing:border-box',
      'padding:10px 12px',
      'border:2px solid #55d6be',
      'border-radius:10px',
      'background:rgba(8,14,20,0.96)',
      'color:#eafff9',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'white-space:pre-wrap',
      'word-break:break-word',
      'pointer-events:auto',
    ].join(';');
    document.body.appendChild(this.root);
    this.log('editor boot probe mounted');
    this.log(`url=${window.location.href}`);
  }

  log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    this.lines.push(`[${timestamp}] ${message}`);
    this.root.textContent = this.lines.join('\n');
  }

  error(error: unknown): void {
    this.root.style.borderColor = '#ff6b8a';
    this.root.style.color = '#ffe8ef';
    this.log(formatError(error));
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}
