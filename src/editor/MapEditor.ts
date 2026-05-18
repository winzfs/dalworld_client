import type { Application, Container } from 'pixi.js';
import { EditorState } from './EditorState';
import { TilesetPanel } from './TilesetPanel';
import { TilePlacementSystem } from './TilePlacementSystem';
import { MapStorage } from './MapStorage';
import { TilePickerWindow } from './TilePickerWindow';
import { WorldMapGrid } from './WorldMapGrid';
import { WorldMapPanel } from './WorldMapPanel';
import type { EditorMapDraft, EditorTilesetAsset } from './types';

export type MapEditorOptions = {
  app: Application;
  world: Container;
  uiRoot?: HTMLElement;
  tileSize?: number;
  mapName?: string;
  worldWidth?: number;
  worldHeight?: number;
  onMoveCameraTo?: (x: number, y: number) => void;
};

export type WorldCellTransition = {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  targetX: number;
  targetY: number;
};

const DIRECT_SELECT_MAX_SIZE = 96;

export class MapEditor {
  readonly state = new EditorState();
  readonly placement: TilePlacementSystem;

  private readonly panel: TilesetPanel;
  private readonly picker: TilePickerWindow;
  private readonly worldMapGrid: WorldMapGrid;
  private readonly worldMapPanel: WorldMapPanel;
  private readonly storage: MapStorage;
  private readonly uiRoot: HTMLElement;
  private readonly cellDrafts = new Map<string, EditorMapDraft>();
  private enabled = false;
  private worldWidth: number;
  private worldHeight: number;
  private transitioning = false;

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (!this.enabled) return;
    if (event.button !== 0) return;
    if (isEditorUiTarget(event.target)) return;

    const worldPoint = this.screenToWorld(event.clientX, event.clientY);
    void this.placement.placeAt(worldPoint.x, worldPoint.y);
  };

  constructor(private readonly options: MapEditorOptions) {
    const mapName = options.mapName ?? 'untitled-map';

    this.worldWidth = options.worldWidth ?? 3000;
    this.worldHeight = options.worldHeight ?? 3000;
    this.uiRoot = options.uiRoot ?? document.body;
    this.storage = new MapStorage(mapName);
    this.worldMapGrid = new WorldMapGrid({ cellSize: this.worldWidth });

    this.placement = new TilePlacementSystem(this.state, {
      tileSize: options.tileSize ?? 32,
      mapName: this.getCellMapName(0, 0),
    });

    this.cellDrafts.set(cellKey(0, 0), this.createCellDraft(0, 0));

    this.picker = new TilePickerWindow({
      defaultGridSize: options.tileSize ?? 32,
      onPick: (asset, sourceRect) => {
        this.state.setSourceRect(asset, sourceRect);
      },
    });

    this.worldMapPanel = new WorldMapPanel({
      grid: this.worldMapGrid,
      onSelectCell: (gridX, gridY) => {
        void this.selectWorldCell(gridX, gridY, {
          targetX: this.worldWidth / 2,
          targetY: this.worldHeight / 2,
        });
      },
    });

    this.panel = new TilesetPanel(this.state, {
      onSave: () => this.save(),
      onLoad: () => {
        void this.load();
      },
      onExport: () => this.exportJson(),
      onClear: () => this.clearAll(),
      onPickAsset: (asset) => this.pickAsset(asset),
      onFillAll: () => {
        void this.fillAll();
      },
      onRandomFill: (chancePercent) => {
        void this.fillRandom(chancePercent);
      },
      onToggleWorldMap: () => this.worldMapPanel.toggle(),
    });
  }

  start(): void {
    if (this.enabled) return;

    this.enabled = true;
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(this.uiRoot);
    this.picker.mount(this.uiRoot);
    this.worldMapPanel.mount(this.uiRoot);
    this.options.app.canvas.addEventListener('pointerdown', this.pointerDownHandler);
  }

  stop(): void {
    if (!this.enabled) return;

    this.persistCurrentCellDraft();
    this.enabled = false;
    this.options.app.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    this.panel.element.remove();
    this.picker.element.remove();
    this.worldMapPanel.element.remove();

    if (this.placement.layer.parent) {
      this.placement.layer.parent.removeChild(this.placement.layer);
    }
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  async transitionWorldCell(transition: WorldCellTransition): Promise<void> {
    if (this.transitioning) return;
    if (transition.dx === 0 && transition.dy === 0) return;

    this.transitioning = true;

    const current = this.worldMapGrid.current;
    const nextX = current.gridX + transition.dx;
    const nextY = current.gridY + transition.dy;

    await this.selectWorldCell(nextX, nextY, {
      targetX: transition.targetX,
      targetY: transition.targetY,
    });

    this.transitioning = false;
  }

  private async selectWorldCell(
    gridX: number,
    gridY: number,
    cameraTarget: { targetX: number; targetY: number },
  ): Promise<void> {
    const previous = this.worldMapGrid.current;

    this.cellDrafts.set(cellKey(previous.gridX, previous.gridY), {
      ...this.placement.mapDraft,
      name: this.getCellMapName(previous.gridX, previous.gridY),
      worldMap: this.worldMapGrid.snapshot,
    });

    this.worldMapGrid.selectCell(gridX, gridY);

    const key = cellKey(gridX, gridY);
    const draft = this.cellDrafts.get(key) ?? this.createCellDraft(gridX, gridY);

    this.cellDrafts.set(key, draft);

    await this.placement.replaceDraft(draft);

    this.options.onMoveCameraTo?.(
      cameraTarget.targetX,
      cameraTarget.targetY,
    );
  }

  private persistCurrentCellDraft(): void {
    const current = this.worldMapGrid.current;

    this.cellDrafts.set(cellKey(current.gridX, current.gridY), {
      ...this.placement.mapDraft,
      name: this.getCellMapName(current.gridX, current.gridY),
      worldMap: this.worldMapGrid.snapshot,
    });
  }

  private createCellDraft(gridX: number, gridY: number): EditorMapDraft {
    return {
      version: 1,
      name: this.getCellMapName(gridX, gridY),
      tileSize: this.options.tileSize ?? 32,
      worldMap: this.worldMapGrid.snapshot,
      placements: [],
    };
  }

  private getCellMapName(gridX: number, gridY: number): string {
    const baseName = this.options.mapName ?? 'dalworld-map';
    return `${baseName}-${gridX}-${gridY}`;
  }

  private pickAsset(asset: EditorTilesetAsset): void {
    this.state.selectAsset(asset);

    void this.shouldOpenPicker(asset).then((openPicker) => {
      if (openPicker) {
        this.picker.open(asset);
      }
    });
  }

  private async shouldOpenPicker(asset: EditorTilesetAsset): Promise<boolean> {
    if (asset.tileWidth && asset.tileHeight) return false;

    const size = await loadImageSize(asset.url);
    if (!size) return false;

    return size.width > DIRECT_SELECT_MAX_SIZE || size.height > DIRECT_SELECT_MAX_SIZE;
  }

  private async fillAll(): Promise<void> {
    const ok = window.confirm('현재 선택한 타일로 맵 전체를 채울까요?');
    if (!ok) return;

    await this.placement.fillAll({
      width: this.worldWidth,
      height: this.worldHeight,
    });
  }

  private async fillRandom(chancePercent: number): Promise<void> {
    const ok = window.confirm(`${chancePercent}% 확률로 맵 전체에 랜덤 배치할까요?`);
    if (!ok) return;

    await this.placement.fillRandom({
      width: this.worldWidth,
      height: this.worldHeight,
      chancePercent,
    });
  }

  private save(): void {
    this.persistCurrentCellDraft();

    this.storage.save({
      ...this.placement.mapDraft,
      worldMap: this.worldMapGrid.snapshot,
    });
  }

  private async load(): Promise<void> {
    const draft = this.storage.load();
    if (!draft) return;

    this.worldMapGrid.load(draft.worldMap);
    this.cellDrafts.clear();

    const current = this.worldMapGrid.current;

    this.cellDrafts.set(
      cellKey(current.gridX, current.gridY),
      draft,
    );

    await this.placement.loadDraft(draft);
  }

  private exportJson(): void {
    this.persistCurrentCellDraft();

    this.storage.downloadJson({
      ...this.placement.mapDraft,
      worldMap: this.worldMapGrid.snapshot,
    });
  }

  private clearAll(): void {
    const ok = window.confirm('현재 배치된 타일을 전부 삭제할까요?');
    if (!ok) return;

    this.placement.clear();
    this.persistCurrentCellDraft();
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.options.app.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const transform = this.options.world.worldTransform;

    return {
      x: (screenX - transform.tx) / transform.a,
      y: (screenY - transform.ty) / transform.d,
    };
  }
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.closest('.map-editor-panel') !== null ||
    target.closest('.tile-picker-window') !== null ||
    target.closest('.world-map-panel') !== null
  );
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
    });

    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function cellKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}
