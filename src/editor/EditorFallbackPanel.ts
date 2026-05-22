export type EditorFallbackPanelOptions = {
  onRetryMapEditor: () => void;
};

export class EditorFallbackPanel {
  readonly element: HTMLDivElement;
  private readonly status: HTMLDivElement;

  constructor(options: EditorFallbackPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'map-editor-panel editor-fallback-panel';
    this.element.style.left = '20px';
    this.element.style.top = '20px';
    this.element.style.zIndex = '2147483646';

    const header = document.createElement('div');
    header.className = 'map-editor-header';
    header.textContent = 'Map Editor';

    const body = document.createElement('div');
    body.style.cssText = [
      'padding:12px',
      'display:grid',
      'gap:10px',
      'font-size:12px',
      'line-height:1.45',
    ].join(';');

    const title = document.createElement('strong');
    title.textContent = '기본 에디터 패널';
    title.style.color = '#ffe4a3';

    const description = document.createElement('div');
    description.textContent = '렌더러와 그리드는 정상입니다. 전체 MapEditor 모듈 로딩이 지연되어 최소 패널로 진입했습니다.';
    description.style.color = 'rgba(255,255,255,.78)';

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'map-editor-action';
    retry.textContent = '전체 에디터 다시 로드';
    retry.onclick = () => options.onRetryMapEditor();

    this.status = document.createElement('div');
    this.status.style.cssText = [
      'padding:8px 9px',
      'border:1px solid rgba(255,255,255,.12)',
      'border-radius:10px',
      'background:rgba(0,0,0,.2)',
      'color:rgba(255,255,255,.72)',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'white-space:pre-wrap',
    ].join(';');
    this.status.textContent = 'MapEditor import 대기 중...';

    body.append(title, description, retry, this.status);
    this.element.append(header, body);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }
}
