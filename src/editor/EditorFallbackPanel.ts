export type EditorFallbackPanelOptions = {
  onRetryMapEditor: () => void;
};

export class EditorFallbackPanel {
  readonly element: HTMLDivElement;
  private readonly status: HTMLDivElement;

  constructor(options: EditorFallbackPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'editor-fallback-panel';
    this.element.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483646',
      'width:min(320px,calc(100vw - 32px))',
      'max-height:220px',
      'overflow:auto',
      'border:1px solid rgba(85,214,190,.55)',
      'border-radius:14px',
      'background:rgba(8,14,20,.86)',
      'color:#eafff9',
      'box-shadow:0 12px 36px rgba(0,0,0,.32)',
      'font:12px/1.45 system-ui,sans-serif',
    ].join(';');

    const header = document.createElement('div');
    header.textContent = 'Editor fallback';
    header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:8px',
      'padding:8px 10px',
      'font-weight:800',
      'color:#9ff5e5',
      'background:rgba(85,214,190,.12)',
    ].join(';');

    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.textContent = '접기';
    collapse.style.cssText = smallButtonStyle();

    const body = document.createElement('div');
    body.style.cssText = [
      'padding:10px',
      'display:grid',
      'gap:8px',
    ].join(';');

    collapse.onclick = () => {
      const hidden = body.hidden;
      body.hidden = !hidden;
      collapse.textContent = hidden ? '접기' : '열기';
      this.element.style.width = hidden ? 'min(320px,calc(100vw - 32px))' : 'auto';
    };

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '기존 UI 다시 로드';
    retry.style.cssText = smallButtonStyle();
    retry.onclick = () => options.onRetryMapEditor();

    this.status = document.createElement('div');
    this.status.style.cssText = [
      'padding:7px 8px',
      'border:1px solid rgba(255,255,255,.12)',
      'border-radius:9px',
      'background:rgba(0,0,0,.2)',
      'color:rgba(234,255,249,.82)',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'white-space:pre-wrap',
    ].join(';');
    this.status.textContent = 'MapEditor import 대기 중...';

    const title = document.createElement('span');
    title.textContent = 'Editor fallback';
    header.append(title, collapse);
    body.append(retry, this.status);
    this.element.append(header, body);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }
}

function smallButtonStyle(): string {
  return [
    'border:1px solid rgba(85,214,190,.42)',
    'border-radius:8px',
    'background:rgba(85,214,190,.1)',
    'color:#eafff9',
    'padding:5px 8px',
    'font:inherit',
    'font-weight:700',
    'cursor:pointer',
  ].join(';');
}
