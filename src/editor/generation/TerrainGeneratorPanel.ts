import type { EditorTilesetAsset } from '../types';

export type TerrainGeneratorPanelOptions = {
  getTilesets: () => EditorTilesetAsset[];
  onAddCurrentTileset: () => void;
  onGenerate: () => void;
};

export class TerrainGeneratorPanel {
  readonly element: HTMLDivElement;

  private readonly header = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private isOpen = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(private readonly options: TerrainGeneratorPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'terrain-generator-panel';
    this.element.hidden = true;
    this.element.style.cssText = [
      'position:fixed',
      'left:420px',
      'top:72px',
      'z-index:10002',
      'width:320px',
      'max-height:calc(100vh - 96px)',
      'display:none',
      'flex-direction:column',
      'overflow:hidden',
      'border:1px solid rgba(125,211,252,.42)',
      'border-radius:14px',
      'background:rgba(15,23,42,.97)',
      'color:#f8fafc',
      'box-shadow:0 18px 60px rgba(0,0,0,.45)',
      'font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    ].join(';');

    this.header.className = 'terrain-generator-header';
    this.header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:8px',
      'padding:10px 12px',
      'background:rgba(125,211,252,.16)',
      'border-bottom:1px solid rgba(255,255,255,.1)',
      'font-weight:800',
      'cursor:move',
      'user-select:none',
    ].join(';');

    const title = document.createElement('strong');
    title.textContent = '지형 생성기';

    this.closeButton.type = 'button';
    this.closeButton.textContent = '×';
    this.closeButton.style.cssText = buttonStyle();
    this.closeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.dragging = false;
    });
    this.closeButton.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.dragging = false;
    });
    this.closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });

    this.header.append(title, this.closeButton);

    this.body.className = 'terrain-generator-body';
    this.body.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px;overflow:auto;';

    const help = document.createElement('div');
    help.style.cssText = 'line-height:1.45;color:rgba(248,250,252,.72);';
    help.textContent = '등록한 이미지 타일셋 전체를 현재 그리드 기준으로 분할해 ground 레이어를 생성합니다. Object/Block은 유지됩니다.';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = '현재 타일셋 등록';
    addButton.style.cssText = buttonStyle();
    addButton.onclick = () => {
      this.options.onAddCurrentTileset();
      this.render();
    };

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.textContent = '등록 타일셋으로 지형 생성';
    generateButton.style.cssText = primaryButtonStyle();
    generateButton.onclick = this.options.onGenerate;

    this.list.className = 'terrain-generator-list';
    this.list.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-height:32px;';

    this.body.append(help, addButton, this.list, generateButton);
    this.element.append(this.header, this.body);
    this.attachDragHandlers();
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  open(): void {
    this.isOpen = true;
    this.element.hidden = false;
    this.element.style.display = 'flex';
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.dragging = false;
    this.element.hidden = true;
    this.element.style.display = 'none';
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  render(): void {
    this.list.innerHTML = '';
    const tilesets = this.options.getTilesets();

    const summary = document.createElement('div');
    summary.style.cssText = 'font-weight:800;color:#bae6fd;';
    summary.textContent = `등록된 타일셋: ${tilesets.length}개`;
    this.list.appendChild(summary);

    if (tilesets.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px;border:1px dashed rgba(255,255,255,.16);border-radius:10px;color:rgba(248,250,252,.58);';
      empty.textContent = '아직 등록된 타일셋이 없습니다.';
      this.list.appendChild(empty);
      return;
    }

    for (const asset of tilesets) {
      const item = document.createElement('div');
      item.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:7px',
        'border:1px solid rgba(255,255,255,.12)',
        'border-radius:10px',
        'background:rgba(255,255,255,.05)',
      ].join(';');

      const preview = document.createElement('span');
      preview.style.cssText = [
        'display:inline-block',
        'width:28px',
        'height:28px',
        'flex:0 0 28px',
        'border-radius:6px',
        'background-color:rgba(255,255,255,.08)',
        `background-image:url(${asset.url})`,
        'background-position:center',
        'background-repeat:no-repeat',
        'background-size:contain',
        'image-rendering:pixelated',
      ].join(';');

      const label = document.createElement('span');
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      label.textContent = asset.name;

      item.append(preview, label);
      this.list.appendChild(item);
    }
  }

  private attachDragHandlers(): void {
    this.header.addEventListener('pointerdown', (event) => {
      if (event.target === this.closeButton) return;
      this.dragging = true;
      this.dragOffsetX = event.clientX - this.element.offsetLeft;
      this.dragOffsetY = event.clientY - this.element.offsetTop;
      this.header.setPointerCapture(event.pointerId);
    });

    this.header.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.element.style.left = `${Math.max(8, event.clientX - this.dragOffsetX)}px`;
      this.element.style.top = `${Math.max(8, event.clientY - this.dragOffsetY)}px`;
    });

    const stopDrag = (event: PointerEvent) => {
      this.dragging = false;
      if (this.header.hasPointerCapture(event.pointerId)) this.header.releasePointerCapture(event.pointerId);
    };

    this.header.addEventListener('pointerup', stopDrag);
    this.header.addEventListener('pointercancel', stopDrag);
  }
}

function buttonStyle(): string {
  return 'border:1px solid rgba(255,255,255,.18);border-radius:9px;background:rgba(255,255,255,.08);color:#f8fafc;padding:7px 10px;cursor:pointer;font-weight:800;';
}

function primaryButtonStyle(): string {
  return 'border:1px solid rgba(56,189,248,.42);border-radius:10px;background:rgba(14,165,233,.22);color:#f8fafc;padding:9px 10px;cursor:pointer;font-weight:900;';
}
