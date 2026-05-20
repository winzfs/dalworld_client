import type { Application, Container } from 'pixi.js';
import { EditorState, BLACK_SOLID_ASSET } from './EditorState';
import { TilesetPanel } from './TilesetPanel';
import { TilePlacementSystem } from './TilePlacementSystem';
import { MapStorage } from './MapStorage';
import { TilePickerWindow } from './TilePickerWindow';
import { WorldMapGrid } from './WorldMapGrid';
import { WorldMapPanel } from './WorldMapPanel';
import { GlobalMonsterSpawnPanel } from './GlobalMonsterSpawnPanel';
import { EditorGridOverlay } from './EditorGridOverlay';
import type { EditorMapDraft, EditorTilePlacement, EditorTilesetAsset, EditorWorldSave } from './types';

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
const BLACK_BASE_PLACEMENT_ID = 'editor-black-base';

type ToastKind = 'info' | 'success' | 'error';

export class MapEditor {
  readonly state = new EditorState();
  readonly placement: TilePlacementSystem;

  private readonly panel: TilesetPanel;
  private readonly picker: TilePickerWindow;
  private readonly worldMapGrid: WorldMapGrid;
  private readonly worldMapPanel: WorldMapPanel;
  private readonly globalMonsterSpawnPanel: GlobalMonsterSpawnPanel;
  private readonly gridOverlay: EditorGridOverlay;
  private readonly storage: MapStorage;
  private readonly uiRoot: HTMLElement;
  private readonly toast: HTMLDivElement;
  private readonly cellDrafts = new Map<string, EditorMapDraft>();
  private enabled = false;
  private worldWidth: number;
  private worldHeight: number;
  private transitioning = false;
  private paintingPointerId: number | null = null;
  private lastPaintKey: string | null = null;
  private toastHideTimeout: ReturnType<typeof window.setTimeout> | null = null;

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (!this.canPaintFromEvent(event)) return;

    if (this.state.mode === 'picker') {
      this.pickBrushFromPointerEvent(event);
      return;
    }

    this.paintingPointerId = event.pointerId;
    this.lastPaintKey = null;
    this.options.app.canvas.setPointerCapture(event.pointerId);
    this.paintFromPointerEvent(event);
  };

  private readonly pointerMoveHandler = (event: PointerEvent) => {
    if (!this.enabled) return;
    if (this.paintingPointerId !== event.pointerId) return;
    if (isEditorUiTarget(event.target)) return;

    this.paintFromPointerEvent(event);
  };

  private readonly pointerUpHandler = (event: PointerEvent) => {
    if (this.paintingPointerId !== event.pointerId) return;

    this.paintingPointerId = null;
    this.lastPaintKey = null;

    if (this.options.app.canvas.hasPointerCapture(event.pointerId)) {
      this.options.app.canvas.releasePointerCapture(event.pointerId);
    }
  };

  constructor(private readonly options: MapEditorOptions) {
    const mapName = options.mapName ?? 'untitled-map';

    this.worldWidth = options.worldWidth ?? 3000;
    this.worldHeight = options.worldHeight ?? 3000;
    this.uiRoot = options.uiRoot ?? document.body;
    this.toast = createEditorToast();
    this.storage = new MapStorage(mapName);
    this.worldMapGrid = new WorldMapGrid({ cellSize: this.worldWidth });
    this.gridOverlay = new EditorGridOverlay(this.state, {
      width: this.worldWidth,
      height: this.worldHeight,
    });

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
      onDeleteCurrentCell: () => {
        void this.deleteCurrentWorldCell();
      },
    });

    this.globalMonsterSpawnPanel = new GlobalMonsterSpawnPanel(this.worldMapGrid);

    this.panel = new TilesetPanel(this.state, {
      onSave: () => {
        void this.save();
      },
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
    this.options.world.sortableChildren = true;
    this.options.world.addChild(this.gridOverlay.layer);
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(this.uiRoot);
    this.picker.mount(this.uiRoot);
    this.worldMapPanel.mount(this.uiRoot);
    this.globalMonsterSpawnPanel.mount(this.uiRoot);
    this.uiRoot.appendChild(this.toast);
    this.options.app.canvas.addEventListener('pointerdown', this.pointerDownHandler);
    this.options.app.canvas.addEventListener('pointermove', this.pointerMoveHandler);
    this.options.app.canvas.addEventListener('pointerup', this.pointerUpHandler);
    this.options.app.canvas.addEventListener('pointercancel', this.pointerUpHandler);
    void this.load();
  }

  stop(): void {
    if (!this.enabled) return;

    this.persistCurrentCellDraft();
    this.enabled = false;
    this.paintingPointerId = null;
    this.lastPaintKey = null;
    if (this.toastHideTimeout !== null) {
      window.clearTimeout(this.toastHideTimeout);
      this.toastHideTimeout = null;
    }
    this.options.app.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    this.options.app.canvas.removeEventListener('pointermove', this.pointerMoveHandler);
    this.options.app.canvas.removeEventListener('pointerup', this.pointerUpHandler);
    this.options.app.canvas.removeEventListener('pointercancel', this.pointerUpHandler);
    this.panel.element.remove();
    this.picker.element.remove();
    this.worldMapPanel.element.remove();
    this.globalMonsterSpawnPanel.remove();
    this.toast.remove();

    if (this.gridOverlay.layer.parent) {
      this.gridOverlay.layer.parent.removeChild(this.gridOverlay.layer);
    }

    if (this.placement.layer.parent) {
      this.placement.layer.parent.removeChild(this.placement.layer);
    }
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
    this.gridOverlay.setWorldSize(width, height);
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

  private canPaintFromEvent(event: PointerEvent): boolean {
    return (
      this.enabled &&
      event.button === 0 &&
      this.paintingPointerId === null &&
      !isEditorUiTarget(event.target)
    );
  }

  private paintFromPointerEvent(event: PointerEvent): void {
    const worldPoint = this.clampWorldPoint(this.screenToWorld(event.clientX, event.clientY));
    const tileSize = this.state.gridSize;
    const x = Math.floor(worldPoint.x / tileSize) * tileSize;
    const y = Math.floor(worldPoint.y / tileSize) * tileSize;
    const paintKey = `${this.state.activeLayer}:${x}:${y}`;

    if (paintKey === this.lastPaintKey) return;

    this.lastPaintKey = paintKey;
    void this.placement.placeAt(worldPoint.x, worldPoint.y);
  }

  private pickBrushFromPointerEvent(event: PointerEvent): void {
    const worldPoint = this.clampWorldPoint(this.screenToWorld(event.clientX, event.clientY));
    const picked = this.placement.pickAt(worldPoint.x, worldPoint.y);
    if (!picked) return;

    this.applyPickedPlacement(picked);
  }

  private applyPickedPlacement(placement: EditorTilePlacement): void {
    if (placement.layer === 'collision') {
      this.state.setLayer('collision');
      this.state.setBrushScale(1);
      this.state.setTransparentBlack(false);
      this.state.setMode('paint');
      return;
    }

    const asset: EditorTilesetAsset = {
      id: placement.assetId,
      name: placement.assetId,
      categoryId: placement.categoryId,
      url: placement.assetUrl,
      solidColor: placement.solidColor,
    };

    this.state.setLayer(placement.layer);
    this.state.setBrushScale(placement.scale);
    this.state.setTransparentBlack(placement.transparentBlack === true);
    this.state.setBrush({
      asset,
      sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
    });
  }

  private async selectWorldCell(
    gridX: number,
    gridY: number,
    cameraTarget: { targetX: number; targetY: number },