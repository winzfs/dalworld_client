import type { EditorTilePlacement } from './types';

export type EditorMinimapView = {
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  zoom: number;
};

export type EditorMinimapOptions = {
  worldWidth: number;
  worldHeight: number;
  onMoveTo: (x: number, y: number) => void;
};

const MINIMAP_SIZE = 180;

export class EditorMinimap {
  readonly element: HTMLDivElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private worldWidth: number;
  private worldHeight: number;
  private dragging = false;
  private placements: EditorTilePlacement[] = [];

  constructor(private readonly options: EditorMinimapOptions) {
    this.worldWidth = options.worldWidth;
    this.worldHeight = options.worldHeight;

    this.element = document.createElement('div');
    this.element.className = 'editor-minimap';

    const title = document.createElement('div');
    title.className = 'editor-minimap-title';
    title.textContent = 'Minimap';

    this.canvas = document.createElement('canvas');
    this.canvas.width = MINIMAP_SIZE;
    this.canvas.height = MINIMAP_SIZE;
    this.canvas.className = 'editor-minimap-canvas';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create editor minimap canvas context.');
    this.ctx = ctx;

    this.element.append(title, this.canvas);
    this.attachPointerHandlers();
    this.render({ x: this.worldWidth / 2, y: this.worldHeight / 2, screenWidth: 1, screenHeight: 1, zoom: 1 });
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  setPlacements(placements: EditorTilePlacement[]): void {
    this.placements = placements.map((placement) => ({ ...placement }));
  }

  render(view: EditorMinimapView): void {
    const ctx = this.ctx;
    const rect = this.worldToMinimapRect(view);

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fillStyle = 'rgba(20, 32, 38, 0.94)';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    ctx.strokeStyle = 'rgba(255, 232, 180, 0.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, MINIMAP_SIZE - 2, MINIMAP_SIZE - 2);

    ctx.fillStyle = 'rgba(71, 184, 129, 0.22)';
    ctx.fillRect(6, 6, MINIMAP_SIZE - 12, MINIMAP_SIZE - 12);

    this.renderPlacements(ctx);

    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(rect.centerX, rect.centerY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderPlacements(ctx: CanvasRenderingContext2D): void {
    const scaleX = MINIMAP_SIZE / this.worldWidth;
    const scaleY = MINIMAP_SIZE / this.worldHeight;

    for (const placement of this.placements) {
      const x = clamp(placement.x * scaleX, 0, MINIMAP_SIZE - 1);
      const y = clamp(placement.y * scaleY, 0, MINIMAP_SIZE - 1);
      const size = Math.max(2, Math.min(6, (placement.sourceRect?.width ?? 32) * placement.scale * scaleX));

      ctx.fillStyle = colorForLayer(placement.layer);
      ctx.fillRect(x, y, size, size);
    }
  }

  private attachPointerHandlers(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
      this.moveToEvent(event);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.moveToEvent(event);
    });

    const stop = () => {
      this.dragging = false;
    };

    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }

  private moveToEvent(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, 0, rect.width);
    const localY = clamp(event.clientY - rect.top, 0, rect.height);
    const worldX = (localX / rect.width) * this.worldWidth;
    const worldY = (localY / rect.height) * this.worldHeight;
    this.options.onMoveTo(worldX, worldY);
  }

  private worldToMinimapRect(view: EditorMinimapView): {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } {
    const visibleWidth = view.screenWidth / Math.max(0.001, view.zoom);
    const visibleHeight = view.screenHeight / Math.max(0.001, view.zoom);
    const scaleX = MINIMAP_SIZE / this.worldWidth;
    const scaleY = MINIMAP_SIZE / this.worldHeight;
    const width = clamp(visibleWidth * scaleX, 6, MINIMAP_SIZE);
    const height = clamp(visibleHeight * scaleY, 6, MINIMAP_SIZE);
    const centerX = clamp(view.x * scaleX, 0, MINIMAP_SIZE);
    const centerY = clamp(view.y * scaleY, 0, MINIMAP_SIZE);

    return {
      x: clamp(centerX - width / 2, 0, MINIMAP_SIZE - width),
      y: clamp(centerY - height / 2, 0, MINIMAP_SIZE - height),
      width,
      height,
      centerX,
      centerY,
    };
  }
}

function colorForLayer(layer: EditorTilePlacement['layer']): string {
  switch (layer) {
    case 'ground':
      return 'rgba(123, 220, 142, 0.9)';
    case 'object':
      return 'rgba(255, 209, 102, 0.95)';
    case 'collision':
      return 'rgba(239, 71, 111, 0.95)';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
