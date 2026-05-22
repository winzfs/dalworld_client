import type { Application, Container } from 'pixi.js';
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

type ToastKind = 'info' | 'success' | 'error';

type LoadedModules = {
  EditorState: new () => any;
  BLACK_SOLID_ASSET: EditorTilesetAsset;
  installMonsterTabSaveInterceptor: (options: {
    panel: HTMLElement;
    getRules: () => any[];
    notify: (message: string, kind: ToastKind, durationMs?: number) => void;
  }) => void;
  TilesetPanel: new (state: any, actions: any) => any;
  TilePlacementSystem: new (state: any, options: { tileSize: number; mapName: string }) => any;
  MapStorage: new (mapName: string) => any;
  TilePickerWindow: new (options: { defaultGridSize: number; onPick: (asset: EditorTilesetAsset, sourceRect: any) => void }) => any;
  WorldMapGrid: new (options: { cellSize: number }) => any;
};

const DIRECT_SELECT_MAX_SIZE = 96;
const BLACK_BASE_PLACEMENT_ID = 'editor-black-base';

export class MapEditorOriginal {
  state: any = null;
  placement: any;

  private modules: LoadedModules | null = null;
  private panel: any = null;
  private picker: any = null;
  private worldMapGrid: any = null;
  private worldMapPanel: any = null;
  private storage: any = null;
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

  constructor(private readonly options: MapEditorOptions) {
    this.worldWidth = options.worldWidth ?? 3000;
    this.worldHeight = options.worldHeight ?? 3000;
    this.uiRoot = options.uiRoot ?? document.body;
    this.toast = createEditorToast();
    this.placement = {
      mapDraft: {
        version: 1,
        name: options.mapName ?? 'dalworld-map',
        tileSize: options.tileSize ?? 32,
        placements: [],
      },
    };
  }

  async start(): Promise<void> {
    if (this.enabled) return;

    const modules = await this.loadModules();
    this.modules = modules;

    const mapName = this.options.mapName ?? 'untitled-map';
    this.state = new modules.EditorState();
    this.storage = new modules.MapStorage(mapName);
    this.worldMapGrid = new modules.WorldMapGrid({ cellSize: this.worldWidth });
    this.worldMapPanel = createWorldMapPanelFallback(() => {
      this.showToast('월드맵 패널은 부팅 안정화 후 다시 연결합니다.', 'info', 2_500);
    });
    this.placement = new modules.TilePlacementSystem(this.state, {
      tileSize: this.options.tileSize ?? 32,
      mapName: this.getCellMapName(0, 0),
    });

    this.cellDrafts.set(cellKey(0, 0), this.createCellDraft(0, 0));

    this.picker = new modules.TilePickerWindow({
      defaultGridSize: this.options.tileSize ?? 32,
      onPick: (asset: EditorTilesetAsset, sourceRect: any) => this.state.setSourceRect(asset, sourceRect),
    });

    this.panel = new modules.TilesetPanel(this.state, {
      onSave: () => { void this.save(); },
      onLoad: () => { void this.load(); },
      onExport: () => this.exportJson(),
      onClear: () => this.clearAll(),
      onPickAsset: (asset: EditorTilesetAsset) => this.pickAsset(asset),
      onFillAll: () => { void this.fillAll(); },
      onRandomFill: (chancePercent: number) => { void this.fillRandom(chancePercent); },
      onToggleWorldMap: () => this.worldMapPanel.toggle(),
      getMonsterSpawnRules: () => this.worldMapGrid.monsterSpawnRules,
      setMonsterSpawnRules: (rules: any[]) => this.worldMapGrid.setMonsterSpawnRules(rules),
    });

    modules.installMonsterTabSaveInterceptor({
      panel: this.panel.element,
      getRules: () => this.worldMapGrid.monsterSpawnRules,
      notify: (message, kind, durationMs) => this.showToast(message, kind, durationMs),
    });

    this.enabled = true;
    this.options.world.sortableChildren = true;
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(this.uiRoot);
    this.picker.mount(this.uiRoot);
    this.uiRoot.appendChild(this.toast);

    this.options.app.canvas.addEventListener('pointerdown', this.pointerDownHandler);
    this.options.app.canvas.addEventListener('pointermove', this.pointerMoveHandler);
    this.options.app.canvas.addEventListener('pointerup', this.pointerUpHandler);
    this.options.app.canvas.addEventListener('pointercancel', this.pointerUpHandler);

    this.reportStage('MapEditorOriginal DOM mounted. Loading saved map...');
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
    this.panel?.element.remove();
    this.picker?.element.remove();
    this.worldMapPanel?.element.remove();
    this.toast.remove();
    if (this.placement?.layer.parent) this.placement.layer.parent.removeChild(this.placement.layer);
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  async transitionWorldCell(transition: WorldCellTransition): Promise<void> {
    if (this.transitioning || !this.worldMapGrid) return;
    if (transition.dx === 0 && transition.dy === 0) return;
    this.transitioning = true;
    const current = this.worldMapGrid.current;
    await this.selectWorldCell(current.gridX + transition.dx, current.gridY + transition.dy, {
      targetX: transition.targetX,
      targetY: transition.targetY,
    });
    this.transitioning = false;
  }

  private async loadModules(): Promise<LoadedModules> {
    this.reportStage('MapEditorOriginal loading EditorState...');
    const editorState = await import('./EditorState');
    this.reportStage('MapEditorOriginal loading server save hooks...');
    const serverSaves = await import('./EditorTabServerSaves');
    this.reportStage('MapEditorOriginal loading TilesetPanel...');
    const tilesetPanel = await import('./TilesetPanel');
    this.reportStage('MapEditorOriginal loading TilePlacementSystem...');
    const placement = await import('./TilePlacementSystem');
    this.reportStage('MapEditorOriginal loading MapStorage...');
    const storage = await import('./MapStorage');
    this.reportStage('MapEditorOriginal loading TilePickerWindow...');
    const picker = await import('./TilePickerWindow');
    this.reportStage('MapEditorOriginal loading WorldMapGrid...');
    const grid = await import('./WorldMapGrid');
    this.reportStage('MapEditorOriginal modules loaded. World map panel and grid overlay skipped.');

    return {
      EditorState: editorState.EditorState,
      BLACK_SOLID_ASSET: editorState.BLACK_SOLID_ASSET,
      installMonsterTabSaveInterceptor: serverSaves.installMonsterTabSaveInterceptor,
      TilesetPanel: tilesetPanel.TilesetPanel,
      TilePlacementSystem: placement.TilePlacementSystem,
      MapStorage: storage.MapStorage,
      TilePickerWindow: picker.TilePickerWindow,
      WorldMapGrid: grid.WorldMapGrid,
    };
  }

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
    if (this.options.app.canvas.hasPointerCapture(event.pointerId)) this.options.app.canvas.releasePointerCapture(event.pointerId);
  };

  private canPaintFromEvent(event: PointerEvent): boolean {
    return this.enabled && event.button === 0 && this.paintingPointerId === null && !isEditorUiTarget(event.target);
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
    this.state.setBrush({ asset, sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined });
  }

  private async selectWorldCell(gridX: number, gridY: number, cameraTarget: { targetX: number; targetY: number }): Promise<void> {
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
    this.options.onMoveCameraTo?.(cameraTarget.targetX, cameraTarget.targetY);
  }

  private async deleteCurrentWorldCell(): Promise<void> {
    const current = this.worldMapGrid.current;
    const ok = window.confirm(`현재 월드맵 셀(${current.gridX}, ${current.gridY})을 삭제할까요?`);
    if (!ok) return;
    this.cellDrafts.delete(cellKey(current.gridX, current.gridY));
    this.worldMapGrid.deleteCell(current.gridX, current.gridY);
    const next = this.worldMapGrid.current;
    const nextDraft = this.normalizeCellDraft(next.gridX, next.gridY, this.cellDrafts.get(cellKey(next.gridX, next.gridY)) ?? this.createCellDraft(next.gridX, next.gridY));
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
      tileSize: this.state?.gridSize ?? 32,
      worldMap: this.worldMapGrid?.snapshot,
      placements: [],
    });
  }

  private normalizeCellDraft(gridX: number, gridY: number, draft: EditorMapDraft): EditorMapDraft {
    return this.isOriginCell(gridX, gridY) ? this.withoutBlackBase(draft) : this.withBlackBase(draft);
  }

  private withBlackBase(draft: EditorMapDraft): EditorMapDraft {
    const black = this.modules?.BLACK_SOLID_ASSET;
    if (!black) return draft;
    const hasBase = draft.placements.some((placement) => placement.id === BLACK_BASE_PLACEMENT_ID);
    if (hasBase) return draft;
    const basePlacement: EditorTilePlacement = {
      id: BLACK_BASE_PLACEMENT_ID,
      assetId: black.id,
      assetUrl: black.url,
      categoryId: black.categoryId,
      x: 0,
      y: 0,
      layer: 'ground',
      scale: 1,
      sourceRect: { x: 0, y: 0, width: this.worldWidth, height: this.worldHeight },
      solidColor: black.solidColor,
    };
    return { ...draft, placements: [basePlacement, ...draft.placements] };
  }

  private withoutBlackBase(draft: EditorMapDraft): EditorMapDraft {
    return { ...draft, placements: draft.placements.filter((placement) => placement.id !== BLACK_BASE_PLACEMENT_ID) };
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
      cells.push({ gridX: cell.gridX, gridY: cell.gridY, draft: { ...draft, name: this.getCellMapName(cell.gridX, cell.gridY), worldMap } });
    }
    for (const [key, draft] of this.cellDrafts) {
      if (seen.has(key)) continue;
      const [gridX, gridY] = parseCellKey(key);
      cells.push({ gridX, gridY, draft: { ...this.normalizeCellDraft(gridX, gridY, draft), name: this.getCellMapName(gridX, gridY), worldMap } });
    }
    return { version: 1, name: this.options.mapName ?? 'dalworld-map', tileSize: this.state.gridSize, worldMap, cells };
  }

  private getCellMapName(gridX: number, gridY: number): string {
    return `${this.options.mapName ?? 'dalworld-map'}-${gridX}-${gridY}`;
  }

  private pickAsset(asset: EditorTilesetAsset): void {
    this.state.selectAsset(asset);
    void this.shouldOpenPicker(asset).then((openPicker) => { if (openPicker) this.picker.open(asset); });
  }

  private async shouldOpenPicker(asset: EditorTilesetAsset): Promise<boolean> {
    if (asset.tileWidth && asset.tileHeight) return false;
    if (asset.solidColor !== undefined) return false;
    const size = await loadImageSize(asset.url);
    if (!size) return false;
    return size.width > DIRECT_SELECT_MAX_SIZE || size.height > DIRECT_SELECT_MAX_SIZE;
  }

  private async fillAll(): Promise<void> {
    if (!window.confirm('현재 선택한 타일로 맵 전체를 채울까요?')) return;
    await this.placement.fillAll({ width: this.worldWidth, height: this.worldHeight });
  }

  private async fillRandom(chancePercent: number): Promise<void> {
    if (!window.confirm(`${chancePercent}% 확률로 맵 전체에 랜덤 배치할까요?`)) return;
    await this.placement.fillRandom({ width: this.worldWidth, height: this.worldHeight, chancePercent });
  }

  private async save(): Promise<void> {
    this.showToast('맵 저장 중... 셀 단위로 서버에 바로 반영하고 있습니다.', 'info', 0);
    const worldSave = this.createWorldSave();
    const mapSaved = this.storage.save({ ...this.placement.mapDraft, worldMap: worldSave.worldMap });
    try {
      const report = await this.storage.saveWorld(worldSave);
      const summary = `셀 ${report.cells}개 · 배치 ${report.placements}개 · 자원 ${report.resources.total}개 · 지역스폰 ${report.monsterSpawns.total}개`;
      this.showToast(mapSaved ? `맵 저장 완료 · ${summary}` : `맵 서버 저장 완료 · 로컬 백업은 용량 부족으로 생략 · ${summary}`, 'success', 4_500);
    } catch (error) {
      console.error('[MapEditor] Map server upload failed.', error);
      this.showToast('맵 저장 실패 · 서버에는 아직 반영되지 않았습니다.', 'error', 5_000);
    }
  }

  private async load(): Promise<void> {
    const worldSave = await this.storage.loadBestWorld();
    if (worldSave) {
      this.worldMapGrid.load(worldSave.worldMap);
      this.cellDrafts.clear();
      for (const cell of worldSave.cells) this.cellDrafts.set(cellKey(cell.gridX, cell.gridY), this.normalizeCellDraft(cell.gridX, cell.gridY, cell.draft));
      const current = this.worldMapGrid.current;
      const currentDraft = this.cellDrafts.get(cellKey(current.gridX, current.gridY)) ?? this.createCellDraft(current.gridX, current.gridY);
      await this.placement.loadDraft(this.normalizeCellDraft(current.gridX, current.gridY, currentDraft));
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
    this.cellDrafts.set(cellKey(current.gridX, current.gridY), this.normalizeCellDraft(current.gridX, current.gridY, draft));
    await this.placement.loadDraft(this.normalizeCellDraft(current.gridX, current.gridY, draft));
  }

  private exportJson(): void {
    this.storage.downloadWorldJson(this.createWorldSave());
  }

  private clearAll(): void {
    if (!window.confirm('현재 배치된 타일을 전부 삭제할까요?')) return;
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
    return { x: (screenX - transform.tx) / transform.a, y: (screenY - transform.ty) / transform.d };
  }

  private clampWorldPoint(point: { x: number; y: number }): { x: number; y: number } {
    return { x: clamp(point.x, 0, Math.max(0, this.worldWidth - 1)), y: clamp(point.y, 0, Math.max(0, this.worldHeight - 1)) };
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

  private reportStage(message: string): void {
    console.log('[EditorBoot]', message);
    const panel = document.getElementById('editor-stage-panel');
    if (panel) panel.textContent = message;
  }
}

function createWorldMapPanelFallback(onToggle: () => void): { element: HTMLElement; mount(root: HTMLElement): void; toggle(): void } {
  const element = document.createElement('div');
  element.className = 'world-map-panel is-fallback';
  element.hidden = true;
  return {
    element,
    mount(root: HTMLElement) {
      root.appendChild(element);
    },
    toggle() {
      onToggle();
    },
  };
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
  return toast;
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.map-editor-panel, .tile-picker-window, .world-map-panel'));
}

function cellKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}

function parseCellKey(key: string): [number, number] {
  const [x, y] = key.split(':').map((value) => Number(value));
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
