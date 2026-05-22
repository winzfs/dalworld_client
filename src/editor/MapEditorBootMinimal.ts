import { Container as PixiContainer, Graphics } from 'pixi.js';
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

export class MapEditorBootMinimal {
  state: any = null;
  placement: any;

  private panel: any = null;
  private picker = createHiddenWindow('tile-picker-window is-fallback');
  private worldMapPanel = createHiddenWindow('world-map-panel is-fallback');
  private readonly uiRoot: HTMLElement;
  private readonly toast = createEditorToast();
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly cellSize: number;
  private worldMap = createWorldMapDraft(3000);
  private enabled = false;
  private paintingPointerId: number | null = null;
  private lastPaintKey: string | null = null;
  private toastTimer: number | null = null;

  constructor(private readonly options: MapEditorBootMinimalOptions) {
    this.uiRoot = options.uiRoot ?? document.body;
    this.worldWidth = options.worldWidth ?? 3000;
    this.worldHeight = options.worldHeight ?? 3000;
    this.cellSize = options.worldWidth ?? 3000;
    this.worldMap = createWorldMapDraft(this.cellSize);
    this.placement = createPlacementFallback(null, options.mapName ?? 'dalworld-map', options.tileSize ?? 32);
  }

  async start(): Promise<void> {
    if (this.enabled) return;

    this.report('MapEditorBootMinimal loading EditorState...');
    const editorState = await import('./EditorState');
    this.report('MapEditorBootMinimal loading server save hooks...');
    const serverSaves = await import('./EditorTabServerSaves');
    this.report('MapEditorBootMinimal loading TilesetPanel...');
    const tilesetPanel = await import('./TilesetPanel');

    this.state = new editorState.EditorState();
    this.placement = createPlacementFallback(this.state, this.options.mapName ?? 'dalworld-map', this.options.tileSize ?? 32);

    this.panel = new tilesetPanel.TilesetPanel(this.state, {
      onSave: () => this.save(),
      onLoad: () => { void this.load(); },
      onExport: () => this.exportJson(),
      onClear: () => this.clearAll(),
      onPickAsset: (asset: EditorTilesetAsset) => this.pickAsset(asset),
      onFillAll: () => { void this.placement.fillAll({ width: this.worldWidth, height: this.worldHeight }); },
      onRandomFill: (chancePercent: number) => { void this.placement.fillRandom({ width: this.worldWidth, height: this.worldHeight, chancePercent }); },
      onToggleWorldMap: () => this.showToast('월드맵 패널은 임시 비활성화되어 있습니다.', 'info'),
      getMonsterSpawnRules: () => this.worldMap.monsterSpawnRules ?? [],
      setMonsterSpawnRules: (rules: any[]) => { this.worldMap.monsterSpawnRules = cloneRules(rules); },
    });

    serverSaves.installMonsterTabSaveInterceptor({
      panel: this.panel.element,
      getRules: () => this.worldMap.monsterSpawnRules ?? [],
      notify: (message: string, kind: ToastKind, durationMs?: number) => this.showToast(message, kind, durationMs),
    });

    this.enabled = true;
    this.options.world.sortableChildren = true;
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(this.uiRoot);
    this.picker.mount(this.uiRoot);
    this.worldMapPanel.mount(this.uiRoot);
    this.uiRoot.appendChild(this.toast);
    this.attachCanvasHandlers();
    await this.load();
    this.report('MapEditorBootMinimal DOM mounted.');
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.panel?.element.remove();
    this.picker.element.remove();
    this.worldMapPanel.element.remove();
    this.toast.remove();
    if (this.placement?.layer.parent) this.placement.layer.parent.removeChild(this.placement.layer);
    this.detachCanvasHandlers();
  }

  setWorldSize(): void {
    // Grid overlay is intentionally disabled in the minimal boot path.
  }

  async transitionWorldCell(): Promise<void> {
    this.showToast('월드맵 셀 전환은 임시 비활성화되어 있습니다.', 'info');
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
    void this.placement.placeAt(point.x, point.y);
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.options.app.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const transform = this.options.world.worldTransform;
    return { x: (screenX - transform.tx) / transform.a, y: (screenY - transform.ty) / transform.d };
  }

  private pickAsset(asset: EditorTilesetAsset): void {
    this.state.selectAsset(asset);
  }

  private save(): void {
    const world = this.createWorldSave();
    writeLocalJson(worldKey(this.options.mapName ?? 'dalworld-map'), world);
    writeLocalJson(draftKey(this.options.mapName ?? 'dalworld-map'), this.placement.mapDraft);
    this.showToast(`맵 로컬 저장 완료 · 배치 ${this.placement.mapDraft.placements.length}개`, 'success', 3000);
  }

  private async load(): Promise<void> {
    const world = readLocalJson<EditorWorldSave>(worldKey(this.options.mapName ?? 'dalworld-map'));
    if (!world) return;
    this.worldMap = world.worldMap ?? createWorldMapDraft(this.cellSize);
    const cell = world.cells.find((entry) => entry.gridX === 0 && entry.gridY === 0) ?? world.cells[0];
    if (cell) await this.placement.loadDraft(cell.draft);
  }

  private exportJson(): void {
    downloadJson(`${this.options.mapName ?? 'dalworld-map'}-world.json`, this.createWorldSave());
  }

  private clearAll(): void {
    if (!window.confirm('현재 배치된 타일을 전부 삭제할까요?')) return;
    this.placement.clear();
  }

  private createWorldSave(): EditorWorldSave {
    return {
      version: 1,
      name: this.options.mapName ?? 'dalworld-map',
      tileSize: this.state?.gridSize ?? this.options.tileSize ?? 32,
      worldMap: this.worldMap,
      cells: [{ gridX: 0, gridY: 0, draft: { ...this.placement.mapDraft, worldMap: this.worldMap } }],
    };
  }

  private showToast(message: string, kind: ToastKind, durationMs = 2500): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.dataset.kind = kind;
    this.toast.style.opacity = '1';
    this.toast.style.transform = 'translate(-50%, 0)';
    this.toastTimer = window.setTimeout(() => {
      this.toast.style.opacity = '0';
      this.toast.style.transform = 'translate(-50%, -8px)';
      this.toastTimer = null;
    }, durationMs);
  }

  private report(message: string): void {
    console.log('[EditorBoot]', message);
    const panel = document.getElementById('editor-stage-panel');
    if (panel) panel.textContent = message;
  }
}

function createPlacementFallback(state: any, mapName: string, tileSize: number): any {
  const layer = new PixiContainer();
  const draft: EditorMapDraft = { version: 1, name: mapName, tileSize, placements: [] };
  const displays = new Map<string, Graphics>();

  const getGridSize = () => state?.gridSize ?? tileSize;
  const redraw = () => {
    layer.removeChildren();
    displays.clear();
    for (const placement of draft.placements) {
      const display = createDisplay(placement, getGridSize());
      displays.set(placement.id, display);
      layer.addChild(display);
    }
  };

  const removeAt = (x: number, y: number) => {
    const gridSize = getGridSize();
    const sx = Math.floor(x / gridSize) * gridSize;
    const sy = Math.floor(y / gridSize) * gridSize;
    const index = draft.placements.findIndex((p) => p.x === sx && p.y === sy && p.layer === state.activeLayer);
    if (index >= 0) {
      draft.placements.splice(index, 1);
      redraw();
    }
  };

  const placeAt = (x: number, y: number) => {
    if (!state?.selectedBrush) return;
    if (state.mode === 'erase') {
      removeAt(x, y);
      return;
    }
    if (state.mode === 'picker') return;
    const gridSize = getGridSize();
    const asset = state.selectedBrush.asset as EditorTilesetAsset;
    const sx = Math.floor(x / gridSize) * gridSize;
    const sy = Math.floor(y / gridSize) * gridSize;
    removeAt(sx, sy);
    const placement: EditorTilePlacement = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetUrl: asset.url,
      categoryId: asset.categoryId,
      x: sx,
      y: sy,
      layer: state.activeLayer,
      scale: state.brushScale ?? 1,
      displayWidth: asset.tileWidth ?? gridSize,
      displayHeight: asset.tileHeight ?? gridSize,
      solidColor: asset.solidColor,
    };
    draft.placements.push(placement);
    const display = createDisplay(placement, gridSize);
    displays.set(placement.id, display);
    layer.addChild(display);
  };

  return {
    layer,
    get mapDraft() { return { ...draft, placements: draft.placements.map((p) => ({ ...p, sourceRect: p.sourceRect ? { ...p.sourceRect } : undefined })) }; },
    pickAt() { return null; },
    async placeAt(x: number, y: number) { placeAt(x, y); },
    async fillAll(options: { width: number; height: number }) {
      const gridSize = getGridSize();
      for (let y = 0; y < options.height; y += gridSize) for (let x = 0; x < options.width; x += gridSize) placeAt(x, y);
    },
    async fillRandom(options: { width: number; height: number; chancePercent: number }) {
      const gridSize = getGridSize();
      const chance = Math.max(0, Math.min(100, options.chancePercent)) / 100;
      for (let y = 0; y < options.height; y += gridSize) for (let x = 0; x < options.width; x += gridSize) if (Math.random() < chance) placeAt(x, y);
    },
    async loadDraft(next: EditorMapDraft) { draft.name = next.name; draft.tileSize = next.tileSize; draft.worldMap = next.worldMap; draft.placements = next.placements.map((p) => ({ ...p, sourceRect: p.sourceRect ? { ...p.sourceRect } : undefined })); redraw(); },
    async replaceDraft(next: EditorMapDraft) { await this.loadDraft(next); },
    clear() { draft.placements.length = 0; redraw(); },
  };
}

function createDisplay(placement: EditorTilePlacement, gridSize: number): Graphics {
  const display = new Graphics();
  const scale = placement.scale ?? 1;
  const width = (placement.displayWidth ?? placement.sourceRect?.width ?? gridSize) * scale;
  const height = (placement.displayHeight ?? placement.sourceRect?.height ?? gridSize) * scale;
  display.x = placement.x;
  display.y = placement.y;
  display.zIndex = placement.layer === 'collision' ? 100 : placement.layer === 'object' ? 10 + placement.y / 1000 : 1;
  display.rect(0, 0, width, height).fill({ color: placement.solidColor ?? fallbackColor(placement.categoryId), alpha: placement.layer === 'collision' ? 0.36 : 1 });
  return display;
}

function fallbackColor(categoryId: string): number {
  if (categoryId === 'nature') return 0x47b881;
  if (categoryId === 'buildings') return 0xc69054;
  if (categoryId === 'monsters') return 0x7bdff2;
  return 0x55d6be;
}

function createWorldMapDraft(cellSize: number): EditorWorldMapDraft {
  return { version: 1, cellSize, current: { gridX: 0, gridY: 0 }, cells: [{ id: 'cell-0-0', name: 'Cell 0,0', gridX: 0, gridY: 0 }], monsterSpawnRules: [] };
}

function cloneRules(rules: any[]): any[] {
  return rules.map((rule) => ({ ...rule, spec: rule.spec ? { ...rule.spec } : undefined }));
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
  return target instanceof Element && Boolean(target.closest('.map-editor-panel, .tile-picker-window, .world-map-panel'));
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
