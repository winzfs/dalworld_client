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

    this.header = document.createElement('div');
    this.header.className = 'tile-picker-header';

    const title = document.createElement('strong');
    title.textContent = 'Tile Picker';

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'tile-picker-close';
    this.closeButton.textContent = '×';
    this.closeButton.onclick = () => this.close();

    this.header.append(title, this.closeButton);

    const controls = document.createElement('div');
    controls.className = 'tile-picker-controls';

    const gridLabel = document.createElement('label');
    gridLabel.textContent = 'Grid';

    this.gridInput = document.createElement('input');
    this.gridInput.type = 'number';
    this.gridInput.min = '1';
    this.gridInput.max = '256';
    this.gridInput.step = '1';
    this.gridInput.value = String(this.gridSize);
    this.gridInput.onchange = () => {
      const next = Number(this.gridInput.value);
      if (Number.isFinite(next) && next > 0) {
        this.gridSize = Math.round(next);
        this.syncGridBackground();
        this.clearSelection();
      }
    };

    this.confirmButton = document.createElement('button');
    this.confirmButton.className = 'tile-picker-confirm';
    this.confirmButton.textContent = '선택 적용';
    this.confirmButton.disabled = true;
    this.confirmButton.onclick = () => this.confirm();

    controls.append(gridLabel, this.gridInput, this.confirmButton);

    this.body = document.createElement('div');
    this.body.className = 'tile-picker-body';

    this.imageWrap = document.createElement('div');
    this.imageWrap.className = 'tile-picker-image-wrap';

    this.image = document.createElement('img');
    this.image.className = 'tile-picker-image';
    this.image.draggable = false;

    this.selection = document.createElement('div');
    this.selection.className = 'tile-picker-selection';
    this.selection.hidden = true;

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
    this.clearSelection();
    this.image.src = asset.url;
    this.image.onload = () => {
      this.naturalWidth = this.image.naturalWidth;
      this.naturalHeight = this.image.naturalHeight;
      this.syncGridBackground();
    };
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
    this.asset = null;
    this.clearSelection();
  }

  private attachPointerHandlers(): void {
    this.imageWrap.addEventListener('pointerdown', (event) => {
      if (!this.asset) return;
      const point = this.eventToImagePoint(event);
      this.dragStart = snapPoint(point, this.gridSize);
      this.setSelectionFromPoints(this.dragStart, this.dragStart);
      this.imageWrap.setPointerCapture(event.pointerId);
    });

    this.imageWrap.addEventListener('pointermove', (event) => {
      if (!this.dragStart) return;
      const current = snapPoint(this.eventToImagePoint(event), this.gridSize);
      this.setSelectionFromPoints(this.dragStart, current);
    });

    const finish = () => {
      this.dragStart = null;
    };

    this.imageWrap.addEventListener('pointerup', finish);
    this.imageWrap.addEventListener('pointercancel', finish);
  }

  private eventToImagePoint(event: PointerEvent): Point {
    const rect = this.image.getBoundingClientRect();
    const scaleX = this.naturalWidth / rect.width;
    const scaleY = this.naturalHeight / rect.height;

    return {
      x: clamp((event.clientX - rect.left) * scaleX, 0, this.naturalWidth),
      y: clamp((event.clientY - rect.top) * scaleY, 0, this.naturalHeight),
    };
  }

  private setSelectionFromPoints(a: Point, b: Point): void {
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
    if (!this.sourceRect) {
      this.selection.hidden = true;
      return;
    }

    const rect = this.image.getBoundingClientRect();
    const scaleX = rect.width / this.naturalWidth;
    const scaleY = rect.height / this.naturalHeight;

    this.selection.hidden = false;
    this.selection.style.left = `${this.sourceRect.x * scaleX}px`;
    this.selection.style.top = `${this.sourceRect.y * scaleY}px`;
    this.selection.style.width = `${this.sourceRect.width * scaleX}px`;
    this.selection.style.height = `${this.sourceRect.height * scaleY}px`;
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
