import type { EditorSourceRect, EditorTilesetAsset } from './types';

export type TilePickerWindowOptions = {
  defaultGridSize?: number;
  onPick: (asset: EditorTilesetAsset, sourceRect: EditorSourceRect) => void;
};

type Point = { x: number; y: number };

/**
 * Lets the editor pick one grid-aligned region from a larger tileset image.
 */
export class TilePickerWindow {
  readonly element: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly imageWrap: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly selection: HTMLDivElement;
  private readonly gridInput: HTMLInputElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly debug: HTMLDivElement;

  private asset: EditorTilesetAsset | null = null;
  private gridSize: number;
  private naturalWidth = 0;
  private naturalHeight = 0;
  private dragStart: Point | null = null;
  private sourceRect: EditorSourceRect | null = null;

  constructor(private readonly options: TilePickerWindowOptions) {
    this.gridSize = options.defaultGridSize ?? 32;

    this.element = document.createElement('div');
    this.element.className = 'tile-picker-window';
    this.element.hidden = true;
    this.element.style.cssText = [
      'position:fixed',
      'left:380px',
      'top:24px',
      'z-index:10001',
      'width:min(720px,calc(100vw - 420px))',
      'max-height:calc(100vh - 48px)',
      'overflow:hidden',
      'display:flex',
      'flex-direction:column',
      'border:1px solid rgba(255,209,102,.4)',
      'border-radius:14px',
      'background:rgba(23,18,15,.97)',
      'color:#f7f1df',
      'box-shadow:0 18px 60px rgba(0,0,0,.45)',
    ].join(';');

    this.header = document.createElement('div');
    this.header.className = 'tile-picker-header';
    this.header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(255,209,102,.14);font-weight:800;';

    const title = document.createElement('strong');
    title.textContent = 'Tile Picker';

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'tile-picker-close';
    this.closeButton.textContent = '×';
    this.closeButton.style.cssText = buttonStyle();
    this.closeButton.onclick = () => this.close();

    this.header.append(title, this.closeButton);

    const controls = document.createElement('div');
    controls.className = 'tile-picker-controls';
    controls.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);';

    const gridLabel = document.createElement('label');
    gridLabel.textContent = 'Grid';

    this.gridInput = document.createElement('input');
    this.gridInput.type = 'number';
    this.gridInput.min = '1';
    this.gridInput.max = '256';
    this.gridInput.step = '1';
    this.gridInput.value = String(this.gridSize);
    this.gridInput.style.cssText = 'width:64px;padding:5px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.28);color:#fff;';
    this.gridInput.onchange = () => {
      const next = Number(this.gridInput.value);
      if (Number.isFinite(next) && next > 0) {
        this.gridSize = Math.round(next);
        this.syncGridBackground();
        this.selectDefaultCell();
      }
    };

    this.confirmButton = document.createElement('button');
    this.confirmButton.className = 'tile-picker-confirm';
    this.confirmButton.textContent = '선택 적용';
    this.confirmButton.disabled = true;
    this.confirmButton.style.cssText = buttonStyle();
    this.confirmButton.onclick = () => this.confirm();

    this.debug = document.createElement('div');
    this.debug.style.cssText = 'margin-left:auto;color:rgba(255,255,255,.64);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';
    this.debug.textContent = 'ready';

    controls.append(gridLabel, this.gridInput, this.confirmButton, this.debug);

    this.body = document.createElement('div');
    this.body.className = 'tile-picker-body';
    this.body.style.cssText = 'min-height:0;overflow:auto;padding:12px;';

    this.imageWrap = document.createElement('div');
    this.imageWrap.className = 'tile-picker-image-wrap';
    this.imageWrap.style.cssText = [
      'position:relative',
      'display:inline-block',
      'min-width:32px',
      'min-height:32px',
      'background-color:rgba(255,255,255,.06)',
      'background-image:linear-gradient(to right, rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.14) 1px, transparent 1px)',
      'background-size:var(--tile-picker-grid,32px) var(--tile-picker-grid,32px)',
      'touch-action:none',
      'user-select:none',
    ].join(';');

    this.image = document.createElement('img');
    this.image.className = 'tile-picker-image';
    this.image.draggable = false;
    this.image.style.cssText = 'display:block;max-width:none;image-rendering:pixelated;user-select:none;pointer-events:none;';

    this.selection = document.createElement('div');
    this.selection.className = 'tile-picker-selection';
    this.selection.hidden = true;
    this.selection.style.cssText = [
      'position:absolute',
      'border:2px solid #ffd166',
      'background:rgba(255,209,102,.22)',
      'box-shadow:0 0 0 1px rgba(0,0,0,.65) inset',
      'pointer-events:none',
      'box-sizing:border-box',
    ].join(';');

    this.imageWrap.append(this.image, this.selection);
    this.body.appendChild(this.imageWrap);
    this.element.append(this.header, controls, this.body);

    this.attachPointerHandlers();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  open(asset: EditorTilesetAsset): void {
    this.asset = asset;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.clearSelection();
    this.element.hidden = false;
    this.debug.textContent = 'loading image...';

    this.image.onload = () => this.handleImageReady();
    this.image.onerror = () => {
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.clearSelection();
      this.debug.textContent = 'image load failed';
    };
    this.image.src = asset.url;

    if (this.image.complete && this.image.naturalWidth > 0 && this.image.naturalHeight > 0) {
      this.handleImageReady();
    }
  }

  close(): void {
    this.element.hidden = true;
    this.asset = null;
    this.clearSelection();
  }

  private handleImageReady(): void {
    this.naturalWidth = this.image.naturalWidth;
    this.naturalHeight = this.image.naturalHeight;
    this.syncGridBackground();
    this.selectDefaultCell();
    this.debug.textContent = `image ${this.naturalWidth}x${this.naturalHeight}`;
  }

  private attachPointerHandlers(): void {
    this.imageWrap.addEventListener('pointerdown', (event) => {
      if (!this.asset || !this.hasImageSize()) return;
      event.preventDefault();
      event.stopPropagation();
      const point = this.eventToImagePoint(event);
      this.dragStart = snapPoint(point, this.gridSize);
      this.setSelectionFromPoints(this.dragStart, this.dragStart);
      this.debug.textContent = `down ${Math.round(this.dragStart.x)},${Math.round(this.dragStart.y)}`;
      this.imageWrap.setPointerCapture(event.pointerId);
    });

    this.imageWrap.addEventListener('pointermove', (event) => {
      if (!this.dragStart || !this.hasImageSize()) return;
      event.preventDefault();
      event.stopPropagation();
      const current = snapPoint(this.eventToImagePoint(event), this.gridSize);
      this.setSelectionFromPoints(this.dragStart, current);
      this.debug.textContent = `drag ${Math.round(current.x)},${Math.round(current.y)}`;
    });

    const finish = (event: PointerEvent) => {
      this.dragStart = null;
      if (this.imageWrap.hasPointerCapture(event.pointerId)) this.imageWrap.releasePointerCapture(event.pointerId);
    };

    this.imageWrap.addEventListener('pointerup', finish);
    this.imageWrap.addEventListener('pointercancel', finish);
  }

  private eventToImagePoint(event: PointerEvent): Point {
    const rect = this.image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !this.hasImageSize()) return { x: 0, y: 0 };
    const scaleX = this.naturalWidth / rect.width;
    const scaleY = this.naturalHeight / rect.height;

    return {
      x: clamp((event.clientX - rect.left) * scaleX, 0, Math.max(0, this.naturalWidth - 1)),
      y: clamp((event.clientY - rect.top) * scaleY, 0, Math.max(0, this.naturalHeight - 1)),
    };
  }

  private setSelectionFromPoints(a: Point, b: Point): void {
    if (!this.hasImageSize()) return;

    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x, b.x) + this.gridSize;
    const maxY = Math.max(a.y, b.y) + this.gridSize;

    const sourceRect: EditorSourceRect = {
      x: clamp(minX, 0, this.naturalWidth),
      y: clamp(minY, 0, this.naturalHeight),
      width: clamp(maxX, 0, this.naturalWidth) - clamp(minX, 0, this.naturalWidth),
      height: clamp(maxY, 0, this.naturalHeight) - clamp(minY, 0, this.naturalHeight),
    };

    if (sourceRect.width <= 0 || sourceRect.height <= 0) return;

    this.sourceRect = sourceRect;
    this.confirmButton.disabled = false;
    this.renderSelection();
  }

  private renderSelection(): void {
    if (!this.sourceRect || !this.hasImageSize()) {
      this.selection.hidden = true;
      return;
    }

    const rect = this.image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.selection.hidden = true;
      return;
    }

    const scaleX = rect.width / this.naturalWidth;
    const scaleY = rect.height / this.naturalHeight;

    this.selection.hidden = false;
    this.selection.style.left = `${this.sourceRect.x * scaleX}px`;
    this.selection.style.top = `${this.sourceRect.y * scaleY}px`;
    this.selection.style.width = `${this.sourceRect.width * scaleX}px`;
    this.selection.style.height = `${this.sourceRect.height * scaleY}px`;
  }

  private selectDefaultCell(): void {
    if (!this.hasImageSize()) return;
    const size = Math.min(this.gridSize, this.naturalWidth, this.naturalHeight);
    this.sourceRect = { x: 0, y: 0, width: size, height: size };
    this.confirmButton.disabled = false;
    this.renderSelection();
  }

  private syncGridBackground(): void {
    this.imageWrap.style.setProperty('--tile-picker-grid', `${this.gridSize}px`);
  }

  private confirm(): void {
    if (!this.asset || !this.sourceRect) return;
    this.options.onPick(this.asset, { ...this.sourceRect });
    this.close();
  }

  private clearSelection(): void {
    this.dragStart = null;
    this.sourceRect = null;
    this.selection.hidden = true;
    this.confirmButton.disabled = true;
  }

  private hasImageSize(): boolean {
    return this.naturalWidth > 0 && this.naturalHeight > 0;
  }
}

function snapPoint(point: Point, gridSize: number): Point {
  return {
    x: Math.floor(point.x / gridSize) * gridSize,
    y: Math.floor(point.y / gridSize) * gridSize,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buttonStyle(): string {
  return 'border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(255,255,255,.08);color:#f7f1df;padding:6px 10px;cursor:pointer;font-weight:700;';
}
