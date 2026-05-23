import type { Application, Container } from 'pixi.js';
import type { EditorMapDraft, EditorTilePlacement, EditorTilesetAsset, EditorWorldMapDraft, EditorWorldSave } from './types';

export type MapEditorBootMinimalOptions = {
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

const DIRECT_SELECT_MAX_SIZE = 96;

export class MapEditorBootMinimal {
  state: any = null;
  placement: any = {
    mapDraft: { version: 1, name: 'dalworld-map', tileSize: 32, placements: [] },
  };

  private panel: any = null;
  private picker: any = createHiddenWindow('tile-picker-window is-fallback');
  private terrainPanel: any = null;
  private worldMapGrid: any = null;
  private worldMapPanel: any = createHiddenWindow('world-map-panel is-fallback');
  private gridOverlay: any = null;
  private minimap: any = null;
  private readonly uiRoot: HTMLElement;
  private readonly toast = createEditorToast();
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly cellSize: number;
  private worldMap = createWorldMapDraft(3000);
  private readonly cellDrafts = new Map<string, EditorMapDraft>();
  private readonly terrainTilesets: EditorTilesetAsset[] = [];
  private enabled = false;
  private paintingPointerId: number | null = null;
  private lastPaintKey: string | null = null;
  private toastTimer: number | null = null;
  private loadingPicker: Promise<any> | null = null;
  private loadingTerrainPanel: Promise<any> | null = null;
  private transitioning = false;
  private readonly minimapTicker = () => this.updateMinimap();

  constructor(private readonly options: MapEditorBootMinimalOptions) {
    this.uiRoot = options.uiRoot ?? document.body;
    this.worldWidth = options.worldWidth ?? 3000;
    this.worldHeight = options.worldHeight ?? 3000;
    this.cellSize = options.worldWidth ?? 3000;
    this.worldMap = createWorldMapDraft(this.cellSize);
    this.placement = {
      mapDraft: {
        version: 1,
        name: this.mapName,
        tileSize: options.tileSize ?? 32,
        placements: [],
      },
    };
  }

  async start(): Promise<void> {
    if (this.enabled) return;

    this.report('MapEditorBootMinimal loading EditorState...');
    const editorState = await import('./EditorState');
    this.report('MapEditorBootMinimal loading server save hooks...');
    const serverSaves = await import('./EditorTabServerSaves');
    this.report('MapEditorBootMinimal loading TilesetPanelLite...');
    const tilesetPanel = await import('./TilesetPanelLite');
    this.report('MapEditorBootMinimal loading TilePlacementSystem...');
    const placementModule = await import('./TilePlacementSystem');
    this.report('MapEditorBootMinimal loading WorldMap modules...');
    const worldGridModule = await import('./WorldMapGrid');
    const worldPanelModule = await import('./WorldMapPanel');
    this.report('MapEditorBootMinimal loading EditorGridOverlay...');
    const gridOverlayModule = await import('./EditorGridOverlay');
    this.report('MapEditorBootMinimal loading EditorMinimap...');
    const minimapModule = await import('./EditorMinimap');

    this.state = new editorState.EditorState();
    this.placement = new placementModule.TilePlacementSystem(this.state, {
      tileSize: this.options.tileSize ?? 32,
      mapName: this.getCellMapName(0, 0),
    });

    this.gridOverlay = new gridOverlayModule.EditorGridOverlay(this.state, {
      width: this.worldWidth,
      height: this.worldHeight,
    });

    this.worldMapGrid = new worldGridModule.WorldMapGrid({ cellSize: this.cellSize });
    this.worldMap = this.worldMapGrid.snapshot;
    this.cellDrafts.set(cellKey(0, 0), this.createCellDraft(0, 0));

    this.worldMapPanel = new worldPanelModule.WorldMapPanel({
      grid: this.worldMapGrid,
      onSelectCell: (gridX: number, gridY: number) => { void this.selectWorldCell(gridX, gridY); },
      onDeleteCurrentCell: () => { void this.deleteCurrentWorldCell(); },
    });

    this.minimap = new minimapModule.EditorMinimap({
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      onMoveTo: (x: number, y: number) => this.options.onMoveCameraTo?.(x, y),
    });

    this.panel = new tilesetPanel.TilesetPanelLite(this.state, {
      onSave: () => { void this.save(); },
      onLoad: () => { void this.load(); },
      onExport: () => this.exportJson(),
      onClear: () => this.clearAll(),
      onPickAsset: (asset: EditorTilesetAsset) => this.pickAsset(asset),
      onFillAll: () => { void this.fillAll(); },
      onRandomFill: (chancePercent: number) => { void this.fillRandom(chancePercent); },
      onAddTerrainBrush: () => this.addTerrainTileset(),
      onGenerateTerrain: () => { void this.openTerrainPanel(); },
      onToggleWorldMap: () => this.worldMapPanel.toggle(),
    });

    serverSaves.installMonsterTabSaveInterceptor({
      panel: this.panel.element,
      getRules: () => this.worldMapGrid?.monsterSpawnRules ?? this.worldMap.monsterSpawnRules ?? [],
      notify: (message: string, kind: ToastKind, durationMs?: number) => this.showToast(message, kind, durationMs),
    });

    this.enabled = true;
    this.options.world.sortableChildren = true;
    this.options.world.addChild(this.gridOverlay.layer);
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(this.uiRoot);
    this.picker.mount(this.uiRoot);
    this.worldMapPanel.mount(this.uiRoot);
    this.minimap.mount(this.uiRoot);
    this.uiRoot.appendChild(this.toast);
    this.attachCanvasHandlers();
    this.options.app.ticker.add(this.minimapTicker);
    void this.loadLocalBackup();
    this.report('MapEditorBootMinimal DOM mounted with grid overlay, world map panel and minimap.');
  }

  stop(): void {
    if (!this.enabled) return;
    this.persistCurrentCellDraft();
    this.enabled = false;
    this.options.app.ticker.remove(this.minimapTicker);
    this.panel?.element.remove();
    this.picker.element.remove();
    this.terrainPanel?.element.remove();
    this.worldMapPanel.element.remove();
    this.minimap?.element.remove();
    this.toast.remove();
    if (this.gridOverlay?.layer?.parent) this.gridOverlay.layer.parent.removeChild(this.gridOverlay.layer);
    if (this.placement?.layer?.parent) this.placement.layer.parent.removeChild(this.placement.layer);
    this.detachCanvasHandlers();
  }

  setWorldSize(width: number, height: number): void {
    this.gridOverlay?.setWorldSize(width, height);
    this.minimap?.setWorldSize(width, height);
  }

  async transitionWorldCell(transition: WorldCellTransition): Promise<void> {
    if (!this.worldMapGrid || this.transitioning) return;
    if (transition.dx === 0 && transition.dy === 0) return;
    this.transitioning = true;
    const current = this.worldMapGrid.current;
    await this.selectWorldCell(current.gridX + transition.dx, current.gridY + transition.dy);
    this.options.onMoveCameraTo?.(transition.targetX, transition.targetY);
    this.transitioning = false;
  }

  private attachCanvasHandlers(): void {
    this.options.app.canvas.addEventListener('pointerdown', this.pointerDown);
    this.options.app.canvas.addEventListener('pointermove', this.pointerMove);
    this.options.app.canvas.addEventListener('pointerup', this.pointerEnd);
    this.options.app.canvas.addEventListener('pointercancel', this.pointerEnd);
  }

  private detachCanvasHandlers(): void {
    this.options.app.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.options.app.canvas.removeEventListener('pointermove', this.pointerMove);
    this.options.app.canvas.removeEventListener('pointerup', this.pointerEnd);
    this.options.app.canvas.removeEventListener('pointercancel', this.pointerEnd);
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0 || isEditorUiTarget(event.target)) return;
    this.paintingPointerId = event.pointerId;
    this.lastPaintKey = null;
    this.options.app.canvas.setPointerCapture(event.pointerId);
    this.paintFromEvent(event);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.paintingPointerId !== event.pointerId || isEditorUiTarget(event.target)) return;
    this.paintFromEvent(event);
  };

  private readonly pointerEnd = (event: PointerEvent): void => {
    if (this.paintingPointerId !== event.pointerId) return;
    this.paintingPointerId = null;
    this.lastPaintKey = null;
    if (this.options.app.canvas.hasPointerCapture(event.pointerId)) this.options.app.canvas.releasePointerCapture(event.pointerId);
  };

  private paintFromEvent(event: PointerEvent): void {
    const point = this.screenToWorld(event.clientX, event.clientY);
    const gridSize = this.state.gridSize ?? 32;
    const x = Math.floor(point.x / gridSize) * gridSize;
    const y = Math.floor(point.y / gridSize) * gridSize;
    const key = `${this.state.activeLayer}:${x}:${y}`;
    if (key === this.lastPaintKey) return;
    this.lastPaintKey = key;
    void this.placement.placeAt(x, y);
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.options.app.canvas.getBoundingClientRect();
    const rendererWidth = this.options.app.renderer.width;
    const rendererHeight = this.options.app.renderer.height;
    const rendererX = ((clientX - rect.left) / Math.max(1, rect.width)) * rendererWidth;
    const rendererY = ((clientY - rect.top) / Math.max(1, rect.height)) * rendererHeight;
    const local = this.options.world.toLocal({ x: rendererX, y: rendererY });
    return { x: local.x, y: local.y };
  }

  private updateMinimap(): void {
    if (!this.minimap || !this.enabled) return;
    const transform = this.options.world.worldTransform;
    const zoom = Math.max(0.001, Math.abs(transform.a || 1));
    const screenWidth = this.options.app.renderer.width;
    const screenHeight = this.options.app.renderer.height;
    const x = (-transform.tx + screenWidth / 2) / zoom;
    const y = (-transform.ty + screenHeight / 2) / zoom;
    this.minimap.setPlacements(this.placement.mapDraft.placements);
    this.minimap.render({ x, y, screenWidth, screenHeight, zoom });
  }

  private async fillAll(): Promise<void> {
    const before = this.placement.mapDraft.placements.length;
    this.showToast('전체 Fill 적용 중...', 'info', 0);
    await this.placement.fillAll({ width: this.worldWidth, height: this.worldHeight });
    this.persistCurrentCellDraft();
    const after = this.placement.mapDraft.placements.length;
    this.showToast(`전체 Fill 완료 · ${Math.max(0, after - before)}개 추가 · 총 ${after}개`, 'success', 3_500);
    this.report(`Fill all completed. before=${before}, after=${after}`);
  }

  private async fillRandom(chancePercent: number): Promise<void> {
    const before = this.placement.mapDraft.placements.length;
    this.showToast(`랜덤 Fill 적용 중... ${chancePercent}%`, 'info', 0);
    await this.placement.fillRandom({ width: this.worldWidth, height: this.worldHeight, chancePercent });
    this.persistCurrentCellDraft();
    const after = this.placement.mapDraft.placements.length;
    this.showToast(`랜덤 Fill 완료 · ${Math.max(0, after - before)}개 추가 · 총 ${after}개`, 'success', 3_500);
    this.report(`Random fill completed. chance=${chancePercent}, before=${before}, after=${after}`);
  }

  private async openTerrainPanel(): Promise<void> {
    try {
      const panel = await this.ensureTerrainPanel();
      panel.open();
    } catch (error) {
      console.warn('[MapEditor] Terrain panel failed.', error);
      this.showToast(`지형 패널 열기 실패 · ${formatError(error)}`, 'error', 4_000);
      this.report(`Terrain panel failed. ${formatError(error)}`);
    }
  }

  private async ensureTerrainPanel(): Promise<any> {
    if (this.terrainPanel?.open) return this.terrainPanel;
    if (!this.loadingTerrainPanel) {
      this.loadingTerrainPanel = import('./generation/TerrainGeneratorPanel').then((module) => {
        this.terrainPanel = new module.TerrainGeneratorPanel({
          getTilesets: () => [...this.terrainTilesets],
          onAddCurrentTileset: () => this.addTerrainTileset(),
          onGenerate: () => { void this.generateTerrain(); },
        });
        this.terrainPanel.mount(this.uiRoot);
        return this.terrainPanel;
      });
    }
    return this.loadingTerrainPanel;
  }

  private addTerrainTileset(): void {
    const asset = this.getSelectedTilesetAsset();
    if (!asset || !isTerrainTilesetAsset(asset)) {
      this.showToast('타일셋 등록 실패 · 이미지 타일셋을 선택하세요.', 'error', 3_000);
      return;
    }

    const key = createTilesetKey(asset);
    if (this.terrainTilesets.some((item) => createTilesetKey(item) === key)) {
      this.showToast(`이미 등록된 타일셋입니다 · ${asset.name}`, 'info', 2_500);
      this.terrainPanel?.render?.();
      return;
    }

    this.terrainTilesets.push(asset);
    this.terrainPanel?.render?.();
    this.showToast(`타일셋 등록 완료 · ${asset.name} · 총 ${this.terrainTilesets.length}개`, 'success', 3_000);
    this.report(`Registered terrain tileset: ${asset.name}. total=${this.terrainTilesets.length}`);
  }

  private async generateTerrain(): Promise<void> {
    const fallbackAsset = this.getSelectedTilesetAsset();
    const tilesets = this.terrainTilesets.length > 0
      ? this.terrainTilesets
      : fallbackAsset && isTerrainTilesetAsset(fallbackAsset)
        ? [fallbackAsset]
        : [];

    if (tilesets.length === 0) {
      this.showToast('지형생성 실패 · 먼저 이미지 타일셋을 등록하거나 선택하세요.', 'error', 3_000);
      return;
    }

    if (!window.confirm(`현재 셀의 ground 레이어를 새 지형으로 교체할까요? 등록 타일셋 ${tilesets.length}개를 사용합니다. Object/Block 레이어는 유지됩니다.`)) return;

    this.showToast('지형 생성 중...', 'info', 0);
    try {
      const generator = await import('./generation/TerrainGenerator');
      const generatedGround = await generator.generateBasicGroundTerrain({
        tilesets,
        width: this.worldWidth,
        height: this.worldHeight,
        gridSize: this.state.gridSize ?? this.options.tileSize ?? 32,
      });
      const currentDraft = this.placement.mapDraft as EditorMapDraft;
      const keptPlacements = currentDraft.placements.filter((placement: EditorTilePlacement) => placement.layer !== 'ground');
      const nextDraft: EditorMapDraft = {
        ...currentDraft,
        tileSize: this.state.gridSize ?? currentDraft.tileSize,
        worldMap: this.worldMapGrid?.snapshot ?? currentDraft.worldMap,
        placements: [...keptPlacements, ...generatedGround],
      };
      await this.placement.replaceDraft(nextDraft);
      this.persistCurrentCellDraft();
      this.showToast(`지형 생성 완료 · 타일셋 ${tilesets.length}개 · ground ${generatedGround.length}개`, 'success', 3_500);
      this.report(`Generated terrain. tilesets=${tilesets.length}, ground=${generatedGround.length}, kept=${keptPlacements.length}`);
    } catch (error) {
      console.warn('[MapEditor] Terrain generation failed.', error);
      this.showToast(`지형 생성 실패 · ${formatError(error)}`, 'error', 5_000);
      this.report(`Terrain generation failed. ${formatError(error)}`);
    }
  }

  private async selectWorldCell(gridX: number, gridY: number): Promise<void> {
    if (!this.worldMapGrid) return;
    this.persistCurrentCellDraft();
    this.worldMapGrid.selectCell(gridX, gridY);
    this.worldMap = this.worldMapGrid.snapshot;
    const key = cellKey(gridX, gridY);
    const draft = this.cellDrafts.get(key) ?? this.createCellDraft(gridX, gridY);
    this.cellDrafts.set(key, draft);
    await this.placement.replaceDraft({ ...draft, worldMap: this.worldMap });
    this.report(`Selected world cell ${gridX},${gridY}`);
  }

  private async deleteCurrentWorldCell(): Promise<void> {
    if (!this.worldMapGrid) return;
    const current = this.worldMapGrid.current;
    if (!window.confirm(`현재 월드맵 셀(${current.gridX}, ${current.gridY})을 삭제할까요?`)) return;
    this.cellDrafts.delete(cellKey(current.gridX, current.gridY));
    this.worldMapGrid.deleteCell(current.gridX, current.gridY);
    this.worldMap = this.worldMapGrid.snapshot;
    const next = this.worldMapGrid.current;
    const nextDraft = this.cellDrafts.get(cellKey(next.gridX, next.gridY)) ?? this.createCellDraft(next.gridX, next.gridY);
    this.cellDrafts.set(cellKey(next.gridX, next.gridY), nextDraft);
    await this.placement.replaceDraft({ ...nextDraft, worldMap: this.worldMap });
    this.report(`Deleted world cell ${current.gridX},${current.gridY}`);
  }

  private persistCurrentCellDraft(): void {
    if (!this.worldMapGrid || !this.placement?.mapDraft) return;
    this.worldMap = this.worldMapGrid.snapshot;
    const current = this.worldMapGrid.current;
    this.cellDrafts.set(cellKey(current.gridX, current.gridY), {
      ...this.placement.mapDraft,
      name: this.getCellMapName(current.gridX, current.gridY),
      worldMap: this.worldMap,
    });
  }

  private createCellDraft(gridX: number, gridY: number): EditorMapDraft {
    return {
      version: 1,
      name: this.getCellMapName(gridX, gridY),
      tileSize: this.state?.gridSize ?? this.options.tileSize ?? 32,
      worldMap: this.worldMapGrid?.snapshot ?? this.worldMap,
      placements: [],
    };
  }

  private pickAsset(asset: EditorTilesetAsset): void {
    this.state.selectAsset(asset);
    this.report(`Selected tile: ${asset.name}`);
    void this.openPickerIfNeeded(asset);
  }

  private async openPickerIfNeeded(asset: EditorTilesetAsset): Promise<void> {
    if (!(await shouldOpenPicker(asset))) return;
    try {
      const picker = await this.ensurePicker();
      picker.setGridSize?.(this.state?.gridSize ?? this.options.tileSize ?? 32);
      picker.open(asset);
      this.report(`TilePicker opened: ${asset.name}`);
    } catch (error) {
      console.warn('[MapEditor] TilePicker failed. Using full asset selection.', error);
      this.report(`TilePicker failed. Full asset selected. ${formatError(error)}`);
    }
  }

  private async ensurePicker(): Promise<any> {
    if (this.picker?.open && !this.picker.element.classList.contains('is-fallback')) return this.picker;
    if (!this.loadingPicker) {
      this.loadingPicker = import('./TilePickerWindow').then((module) => {
        this.picker.element.remove();
        this.picker = new module.TilePickerWindow({
          defaultGridSize: this.state?.gridSize ?? this.options.tileSize ?? 32,
          onPick: (asset: EditorTilesetAsset, sourceRect: any) => {
            this.state.setSourceRect(asset, sourceRect);
            this.report(`Picked source rect ${sourceRect.x},${sourceRect.y},${sourceRect.width}x${sourceRect.height}`);
          },
        });
        this.picker.mount(this.uiRoot);
        return this.picker;
      });
    }
    return this.loadingPicker;
  }

  private getSelectedTilesetAsset(): EditorTilesetAsset | null {
    return this.state?.selectedAsset ?? this.state?.selectedBrush?.asset ?? null;
  }

  private async save(): Promise<void> {
    const world = this.createWorldSave();
    writeLocalJson(worldKey(this.mapName), world);
    writeLocalJson(draftKey(this.mapName), this.placement.mapDraft);

    this.showToast('맵 저장 중... 서버 저장 모듈을 로드합니다.', 'info', 0);
    try {
      const storage = await this.createMapStorage();
      const localSaved = storage.save({ ...this.placement.mapDraft, worldMap: world.worldMap });
      const report = await storage.saveWorld(world);
      this.showToast(
        `${localSaved ? '맵 저장 완료' : '서버 저장 완료'} · 셀 ${report.cells}개 · 배치 ${report.placements}개`,
        'success',
        4_500,
      );
      this.report(`Saved world to server. cells=${report.cells}, placements=${report.placements}`);
    } catch (error) {
      console.warn('[MapEditor] Server save failed. Local backup is kept.', error);
      this.showToast(`서버 저장 실패 · 로컬 백업 저장됨 · 배치 ${this.placement.mapDraft.placements.length}개`, 'error', 5_000);
      this.report(`Server save failed. Local backup kept. ${formatError(error)}`);
    }
  }

  private async load(): Promise<void> {
    this.showToast('맵 불러오는 중... 서버 저장 모듈을 로드합니다.', 'info', 0);
    try {
      const storage = await this.createMapStorage();
      const world = await storage.loadBestWorld();
      if (!world) {
        this.showToast('불러올 서버/로컬 맵이 없습니다.', 'info', 3_000);
        return;
      }
      await this.applyWorldSave(world);
      this.showToast(`맵 불러오기 완료 · 셀 ${world.cells.length}개`, 'success', 3_500);
      this.report(`Loaded world via MapStorage. cells=${world.cells.length}`);
    } catch (error) {
      console.warn('[MapEditor] MapStorage load failed. Trying local fallback.', error);
      const loaded = await this.loadLocalBackup();
      this.showToast(loaded ? '서버 불러오기 실패 · 로컬 백업을 불러왔습니다.' : '맵 불러오기 실패 · 로컬 백업도 없습니다.', loaded ? 'info' : 'error', 4_000);
      this.report(`MapStorage load failed. ${formatError(error)}`);
    }
  }

  private async loadLocalBackup(): Promise<boolean> {
    const world = readLocalJson<EditorWorldSave>(worldKey(this.mapName));
    if (world) {
      await this.applyWorldSave(world);
      return true;
    }

    const draft = readLocalJson<EditorMapDraft>(draftKey(this.mapName));
    if (draft) {
      this.worldMapGrid?.load(draft.worldMap);
      this.worldMap = this.worldMapGrid?.snapshot ?? draft.worldMap ?? createWorldMapDraft(this.cellSize);
      this.cellDrafts.clear();
      const current = this.worldMap.current ?? { gridX: 0, gridY: 0 };
      this.cellDrafts.set(cellKey(current.gridX, current.gridY), { ...draft, worldMap: this.worldMap });
      await this.placement.loadDraft({ ...draft, worldMap: this.worldMap });
      return true;
    }

    return false;
  }

  private async applyWorldSave(world: EditorWorldSave): Promise<void> {
    if (this.worldMapGrid) this.worldMapGrid.load(world.worldMap);
    this.worldMap = this.worldMapGrid?.snapshot ?? world.worldMap ?? createWorldMapDraft(this.cellSize);
    this.cellDrafts.clear();
    for (const cell of world.cells) {
      this.cellDrafts.set(cellKey(cell.gridX, cell.gridY), { ...cell.draft, worldMap: this.worldMap });
    }
    const current = this.worldMap.current ?? { gridX: 0, gridY: 0 };
    const draft = this.cellDrafts.get(cellKey(current.gridX, current.gridY))
      ?? this.cellDrafts.get(cellKey(0, 0))
      ?? world.cells[0]?.draft
      ?? this.createCellDraft(0, 0);
    await this.placement.loadDraft({ ...draft, worldMap: this.worldMap });
  }

  private async createMapStorage(): Promise<any> {
    const module = await import('./MapStorage');
    return new module.MapStorage(this.mapName);
  }

  private exportJson(): void {
    downloadJson(`${this.mapName}-world.json`, this.createWorldSave());
  }

  private clearAll(): void {
    if (!window.confirm('현재 배치된 타일을 전부 삭제할까요?')) return;
    this.placement.clear();
    this.persistCurrentCellDraft();
  }

  private createWorldSave(): EditorWorldSave {
    this.persistCurrentCellDraft();
    const worldMap = this.worldMapGrid?.snapshot ?? this.worldMap;
    const cells: EditorWorldSave['cells'] = [];
    const seen = new Set<string>();

    for (const cell of worldMap.cells) {
      const key = cellKey(cell.gridX, cell.gridY);
      const draft = this.cellDrafts.get(key) ?? this.createCellDraft(cell.gridX, cell.gridY);
      seen.add(key);
      cells.push({ gridX: cell.gridX, gridY: cell.gridY, draft: { ...draft, name: this.getCellMapName(cell.gridX, cell.gridY), worldMap } });
    }

    for (const [key, draft] of this.cellDrafts) {
      if (seen.has(key)) continue;
      const [gridX, gridY] = parseCellKey(key);
      cells.push({ gridX, gridY, draft: { ...draft, name: this.getCellMapName(gridX, gridY), worldMap } });
    }

    return {
      version: 1,
      name: this.mapName,
      tileSize: this.state?.gridSize ?? this.options.tileSize ?? 32,
      worldMap,
      cells,
    };
  }

  private getCellMapName(gridX: number, gridY: number): string {
    return `${this.mapName}-${gridX}-${gridY}`;
  }

  private get mapName(): string {
    return this.options.mapName ?? 'dalworld-map';
  }

  private showToast(message: string, kind: ToastKind, durationMs = 2500): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.dataset.kind = kind;
    this.toast.style.opacity = '1';
    this.toast.style.transform = 'translate(-50%, 0)';
    if (durationMs > 0) {
      this.toastTimer = window.setTimeout(() => {
        this.toast.style.opacity = '0';
        this.toast.style.transform = 'translate(-50%, -8px)';
        this.toastTimer = null;
      }, durationMs);
    }
  }

  private report(message: string): void {
    console.log('[EditorBoot]', message);
    const panel = document.getElementById('editor-stage-panel');
    if (panel) panel.textContent = message;
  }
}

async function shouldOpenPicker(asset: EditorTilesetAsset): Promise<boolean> {
  if (asset.tileWidth && asset.tileHeight) return false;
  if (asset.solidColor !== undefined) return false;
  if (!isImageAssetUrl(asset.url)) return false;
  const size = await loadImageSize(asset.url);
  if (!size) return false;
  return size.width > DIRECT_SELECT_MAX_SIZE || size.height > DIRECT_SELECT_MAX_SIZE;
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function isTerrainTilesetAsset(asset: EditorTilesetAsset): boolean {
  return asset.solidColor === undefined && isImageAssetUrl(asset.url);
}

function createTilesetKey(asset: EditorTilesetAsset): string {
  return `${asset.id}:${asset.url}`;
}

function isImageAssetUrl(url: string): boolean {
  return !url.startsWith('solid://') && !url.startsWith('editor://');
}

function createWorldMapDraft(cellSize: number): EditorWorldMapDraft {
  return { version: 1, cellSize, current: { gridX: 0, gridY: 0 }, cells: [{ id: 'cell-0-0', name: 'Map 0,0', gridX: 0, gridY: 0 }], monsterSpawnRules: [] };
}

function createHiddenWindow(className: string): { element: HTMLElement; mount(root: HTMLElement): void; toggle(): void; open(): void } {
  const element = document.createElement('div');
  element.className = className;
  element.hidden = true;
  return { element, mount(root) { root.appendChild(element); }, toggle() {}, open() {} };
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
  toast.style.pointerEvents = 'none';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 160ms ease, transform 160ms ease';
  return toast;
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.map-editor-panel, .tile-picker-window, .world-map-panel, .editor-minimap, .terrain-generator-panel'));
}

function cellKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}

function parseCellKey(key: string): [number, number] {
  const [x, y] = key.split(':').map((value) => Number(value));
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
}

function draftKey(name: string): string { return `dalworld:editor-map:${name}`; }
function worldKey(name: string): string { return `dalworld:editor-world:${name}`; }

function writeLocalJson(key: string, value: unknown): boolean {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function readLocalJson<T>(key: string): T | null {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
