import type { Application, Container } from 'pixi.js';
import { EditorState, BLACK_SOLID_ASSET } from './EditorState';
import { TilesetPanel } from './TilesetPanel';
import { TilePlacementSystem } from './TilePlacementSystem';
import { MapStorage } from './MapStorage';
import { TilePickerWindow } from './TilePickerWindow';
import { WorldMapGrid } from './WorldMapGrid';
import { WorldMapPanel } from './WorldMapPanel';
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
    const worldPoint = this.screenToWorld(event.clientX, event.clientY);
    const tileSize = this.state.gridSize;
    const x = Math.floor(worldPoint.x / tileSize) * tileSize;
    const y = Math.floor(worldPoint.y / tileSize) * tileSize;
    const paintKey = `${this.state.activeLayer}:${x}:${y}`;

    if (paintKey === this.lastPaintKey) return;

    this.lastPaintKey = paintKey;
    void this.placement.placeAt(worldPoint.x, worldPoint.y);
  }

  private pickBrushFromPointerEvent(event: PointerEvent): void {
    const worldPoint = this.screenToWorld(event.clientX, event.clientY);
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
  ): Promise<void> {
    const previous = this.worldMapGrid.current;

    this.cellDrafts.set(cellKey(previous.gridX, previous.gridY), this.normalizeCellDraft(previous.gridX, previous.gridY, {
      ...this.placement.mapDraft,
      name: this.getCellMapName(previous.gridX, previous.gridY),
      worldMap: this.worldMapGrid.snapshot,
    }));

    this.worldMapGrid.selectCell(gridX, gridY);

    const key = cellKey(gridX, gridY);
    const draft = this.normalizeCellDraft(gridX, gridY, this.cellDrafts.get(key) ?? this.createCellDraft(gridX, gridY));

    this.cellDrafts.set(key, draft);

    await this.placement.replaceDraft(draft);

    this.options.onMoveCameraTo?.(
      cameraTarget.targetX,
      cameraTarget.targetY,
    );
  }

  private async deleteCurrentWorldCell(): Promise<void> {
    const current = this.worldMapGrid.current;
    const ok = window.confirm(`현재 월드맵 셀(${current.gridX}, ${current.gridY})을 삭제할까요?`);
    if (!ok) return;

    this.cellDrafts.delete(cellKey(current.gridX, current.gridY));
    this.worldMapGrid.deleteCell(current.gridX, current.gridY);

    const next = this.worldMapGrid.current;
    const nextDraft = this.normalizeCellDraft(
      next.gridX,
      next.gridY,
      this.cellDrafts.get(cellKey(next.gridX, next.gridY)) ?? this.createCellDraft(next.gridX, next.gridY),
    );

    this.cellDrafts.set(cellKey(next.gridX, next.gridY), nextDraft);
    await this.placement.replaceDraft(nextDraft);
    this.options.onMoveCameraTo?.(this.worldWidth / 2, this.worldHeight / 2);
    void this.save();
  }

  private persistCurrentCellDraft(): void {
    const current = this.worldMapGrid.current;

    this.cellDrafts.set(cellKey(current.gridX, current.gridY), this.normalizeCellDraft(current.gridX, current.gridY, {
      ...this.placement.mapDraft,
      name: this.getCellMapName(current.gridX, current.gridY),
      worldMap: this.worldMapGrid.snapshot,
    }));
  }

  private createCellDraft(gridX: number, gridY: number): EditorMapDraft {
    return this.normalizeCellDraft(gridX, gridY, {
      version: 1,
      name: this.getCellMapName(gridX, gridY),
      tileSize: this.state.gridSize,
      worldMap: this.worldMapGrid.snapshot,
      placements: [],
    });
  }

  private normalizeCellDraft(gridX: number, gridY: number, draft: EditorMapDraft): EditorMapDraft {
    return this.isOriginCell(gridX, gridY)
      ? this.withoutBlackBase(draft)
      : this.withBlackBase(draft);
  }

  private withBlackBase(draft: EditorMapDraft): EditorMapDraft {
    const hasBase = draft.placements.some((placement) => placement.id === BLACK_BASE_PLACEMENT_ID);
    if (hasBase) return draft;

    const basePlacement: EditorTilePlacement = {
      id: BLACK_BASE_PLACEMENT_ID,
      assetId: BLACK_SOLID_ASSET.id,
      assetUrl: BLACK_SOLID_ASSET.url,
      categoryId: BLACK_SOLID_ASSET.categoryId,
      x: 0,
      y: 0,
      layer: 'ground',
      scale: 1,
      sourceRect: {
        x: 0,
        y: 0,
        width: this.worldWidth,
        height: this.worldHeight,
      },
      solidColor: BLACK_SOLID_ASSET.solidColor,
    };

    return {
      ...draft,
      placements: [basePlacement, ...draft.placements],
    };
  }

  private withoutBlackBase(draft: EditorMapDraft): EditorMapDraft {
    return {
      ...draft,
      placements: draft.placements.filter((placement) => placement.id !== BLACK_BASE_PLACEMENT_ID),
    };
  }

  private isOriginCell(gridX: number, gridY: number): boolean {
    return gridX === 0 && gridY === 0;
  }

  private createWorldSave(): EditorWorldSave {
    this.persistCurrentCellDraft();

    const worldMap = this.worldMapGrid.snapshot;
    const seen = new Set<string>();
    const cells: EditorWorldSave['cells'] = [];

    for (const cell of worldMap.cells) {
      const key = cellKey(cell.gridX, cell.gridY);
      const draft = this.normalizeCellDraft(cell.gridX, cell.gridY, this.cellDrafts.get(key) ?? this.createCellDraft(cell.gridX, cell.gridY));
      seen.add(key);
      cells.push({
        gridX: cell.gridX,
        gridY: cell.gridY,
        draft: {
          ...draft,
          name: this.getCellMapName(cell.gridX, cell.gridY),
          worldMap,
        },
      });
    }

    for (const [key, draft] of this.cellDrafts) {
      if (seen.has(key)) continue;
      const [gridX, gridY] = parseCellKey(key);
      cells.push({
        gridX,
        gridY,
        draft: {
          ...this.normalizeCellDraft(gridX, gridY, draft),
          name: this.getCellMapName(gridX, gridY),
          worldMap,
        },
      });
    }

    return {
      version: 1,
      name: this.options.mapName ?? 'dalworld-map',
      tileSize: this.state.gridSize,
      worldMap,
      cells,
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
    if (asset.solidColor !== undefined) return false;

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

  private async save(): Promise<void> {
    this.showToast('저장 중... 서버에 월드맵을 반영하고 있습니다.', 'info', 0);

    const worldSave = this.createWorldSave();
    const mapSaved = this.storage.save({
      ...this.placement.mapDraft,
      worldMap: worldSave.worldMap,
    });

    try {
      const worldSaved = await this.storage.saveWorld(worldSave);
      this.showToast(
        `저장 완료 · 서버 반영됨 · 셀 ${worldSave.cells.length}개`,
        worldSaved && mapSaved ? 'success' : 'error',
      );
      console.info('[MapEditor] Save completed.', {
        worldSaved,
        mapSaved,
        cellCount: worldSave.cells.length,
      });
    } catch (error) {
      console.error('[MapEditor] Local save completed, but server upload failed.', error);
      this.showToast('서버 업로드 실패 · 게임에는 아직 반영되지 않았습니다.', 'error', 5_000);
    }
  }

  private async load(): Promise<void> {
    const worldSave = this.storage.loadWorld();

    if (worldSave) {
      this.worldMapGrid.load(worldSave.worldMap);
      this.cellDrafts.clear();

      for (const cell of worldSave.cells) {
        this.cellDrafts.set(cellKey(cell.gridX, cell.gridY), this.normalizeCellDraft(cell.gridX, cell.gridY, cell.draft));
      }

      const current = this.worldMapGrid.current;
      const currentDraft = this.cellDrafts.get(cellKey(current.gridX, current.gridY))
        ?? this.createCellDraft(current.gridX, current.gridY);

      await this.placement.loadDraft(this.normalizeCellDraft(current.gridX, current.gridY, currentDraft));
      console.info('[MapEditor] Loaded saved world.', {
        cells: worldSave.cells.length,
      });
      return;
    }

    const draft = this.storage.load();
    if (!draft) {
      await this.placement.loadDraft(this.createCellDraft(0, 0));
      return;
    }

    this.worldMapGrid.load(draft.worldMap);
    this.cellDrafts.clear();

    const current = this.worldMapGrid.current;

    this.cellDrafts.set(
      cellKey(current.gridX, current.gridY),
      this.normalizeCellDraft(current.gridX, current.gridY, draft),
    );

    await this.placement.loadDraft(this.normalizeCellDraft(current.gridX, current.gridY, draft));
  }

  private exportJson(): void {
    this.storage.downloadWorldJson(this.createWorldSave());
  }

  private clearAll(): void {
    const ok = window.confirm('현재 배치된 타일을 전부 삭제할까요?');
    if (!ok) return;

    const current = this.worldMapGrid.current;
    const draft = this.createCellDraft(current.gridX, current.gridY);
    this.placement.clear();
    this.cellDrafts.set(cellKey(current.gridX, current.gridY), draft);
    void this.placement.replaceDraft(draft);
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

  private showToast(message: string, kind: ToastKind, durationMs = 2_500): void {
    if (this.toastHideTimeout !== null) {
      window.clearTimeout(this.toastHideTimeout);
      this.toastHideTimeout = null;
    }

    this.toast.textContent = message;
    this.toast.dataset.kind = kind;
    this.toast.style.opacity = '1';
    this.toast.style.transform = 'translateY(0)';

    if (durationMs > 0) {
      this.toastHideTimeout = window.setTimeout(() => {
        this.toast.style.opacity = '0';
        this.toast.style.transform = 'translateY(-8px)';
        this.toastHideTimeout = null;
      }, durationMs);
    }
  }
}

function createEditorToast(): HTMLDivElement {
  const toast = document.createElement('div');
  toast.className = 'map-editor-toast';
  toast.style.position = 'fixed';
  toast.style.top = '18px';
  toast.style.left = '50%';
  toast.style.transform = 'translate(-50%, -8px)';
  toast.style.zIndex = '10000';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '12px';
  toast.style.background = 'rgba(17, 24, 39, 0.94)';
  toast.style.color = '#ffffff';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '700';
  toast.style.letterSpacing = '-0.01em';
  toast.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.35)';
  toast.style.pointerEvents = 'none';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 160ms ease, transform 160ms ease, background 160ms ease';

  const observer = new MutationObserver(() => {
    switch (toast.dataset.kind) {
      case 'success':
        toast.style.background = 'rgba(22, 101, 52, 0.96)';
        break;
      case 'error':
        toast.style.background = 'rgba(185, 28, 28, 0.96)';
        break;
      default:
        toast.style.background = 'rgba(17, 24, 39, 0.94)';
        break;
    }
  });
  observer.observe(toast, { attributes: true, attributeFilter: ['data-kind'] });

  return toast;
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.closest('.map-editor-panel') !== null ||
    target.closest('.tile-picker-window') !== null ||
    target.closest('.world-map-panel') !== null ||
    target.closest('.editor-minimap') !== null
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

function parseCellKey(key: string): [number, number] {
  const [x, y] = key.split(':').map(Number);
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
}
