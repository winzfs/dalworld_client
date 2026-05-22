import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../game/Camera';
import { InputController } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';
import type { GameWorldMap, WorldMapPlacement } from '../worldMap/types';
import { mountClassicTilesPanelLite } from './ClassicTilesPanelLite';
import { EditorCameraSystem } from './EditorCameraSystem';
import { EditorFallbackPanel } from './EditorFallbackPanel';
import type { EditorState } from './EditorState';
import { MapEditorSession } from './MapEditorSession';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type {
  EditorMapDraft,
  EditorTilePlacement,
  EditorTilesetAsset,
  EditorWorldMapDraft,
  EditorWorldSave,
} from './types';

const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const EDITOR_MODULE_LOAD_TIMEOUT_MS = 5_000;
const DEFAULT_MAP_NAME = 'dalworld-map-lightweight';
const DEFAULT_CELL_SIZE = 3000;

type LightweightRuntime = {
  placement: TilePlacementSystem;
  session: MapEditorSession;
  transitionWorldCell: () => Promise<void>;
};

type RuntimeModules = {
  EditorState: new () => EditorState;
  TilePlacementSystem: new (state: EditorState, options: { tileSize: number; mapName: string }) => TilePlacementSystem;
};

export class EditorApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly camera = new Camera(this.world);
  private readonly cameraSystem = new EditorCameraSystem(this.camera);

  private editorRuntime: LightweightRuntime | null = null;
  private fallbackPanel: EditorFallbackPanel | null = null;
  private transitioning = false;

  async start(mount: HTMLElement): Promise<void> {
    console.log('[EditorBoot] EditorApp.start entered.');
    document.body.classList.add('is-map-editor-mode');

    console.log('[EditorBoot] Calling Pixi app.init before loading editor modules.');
    await this.app.init({
      background: '#1d2b34',
      antialias: false,
      resizeTo: window,
      autoDensity: true,
      resolution: getRenderResolution(),
    });
    console.log('[EditorBoot] Pixi app.init resolved.');

    mount.appendChild(this.app.canvas);
    this.input.attach();
    this.world.sortableChildren = true;
    this.world.addChild(this.background);
    this.app.stage.addChild(this.world);

    this.drawBackground(DEFAULT_WORLD);
    this.cameraSystem.setWorldSize(DEFAULT_WORLD);

    const status = createEditorStagePanel();
    this.showFallbackPanel(status);
    await this.loadLightweightRuntime(status);
  }

  private showFallbackPanel(status: (message: string) => void): void {
    this.fallbackPanel = new EditorFallbackPanel({
      onRetryMapEditor: () => {
        void this.loadLightweightRuntime(status);
      },
    });
    this.fallbackPanel.mount(document.body);
    this.fallbackPanel.setStatus('렌더러 준비 완료. 최소 에디터 로딩 중...');
  }

  private async loadLightweightRuntime(status: (message: string) => void): Promise<void> {
    try {
      status('Loading minimal editor modules...');
      this.fallbackPanel?.setStatus('최소 에디터 모듈 로딩 중...');

      const { EditorState } = await loadEditorModule('EditorState', () => import('./EditorState'), status);
      const { TilePlacementSystem } = await loadEditorModule('TilePlacementSystem', () => import('./TilePlacementSystem'), status);

      this.editorRuntime = this.createInlineLightweightRuntime({ EditorState, TilePlacementSystem }, status);

      this.fallbackPanel?.element.remove();
      this.fallbackPanel = null;
      this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
      status(`Safe editor boot ready. Panel count: ${document.querySelectorAll('.map-editor-panel').length}`);
      console.log('[EditorBoot] Safe editor boot ready.');
    } catch (error) {
      const message = `Minimal editor failed: ${formatErrorMessage(error)}`;
      this.fallbackPanel?.setStatus(message);
      status(message);
      console.warn('[EditorBoot] Minimal editor failed.', error);
    }
  }

  private createInlineLightweightRuntime(modules: RuntimeModules, status: (message: string) => void): LightweightRuntime {
    const state = new modules.EditorState();
    const placement = new modules.TilePlacementSystem(state, {
      tileSize: 32,
      mapName: DEFAULT_MAP_NAME,
    });
    const session = new MapEditorSession({
      state,
      placement,
      status,
      mapName: DEFAULT_MAP_NAME,
      cellSize: DEFAULT_CELL_SIZE,
    });

    this.world.addChild(placement.layer);
    mountSafeBootPanel({ state, placement, session, status });
    this.attachPaintingHandlers(state, placement);
    openClassicEditorUi({ state, placement, session, status });
    document.querySelectorAll<HTMLElement>('.minimal-editor-panel').forEach((panel) => panel.remove());
    status('안전 부팅 완료. 기존 Map Editor 패널을 기본 UI로 표시합니다.');

    return {
      placement,
      session,
      transitionWorldCell: async () => undefined,
    };
  }

  private attachPaintingHandlers(state: EditorState, placement: TilePlacementSystem): void {
    let paintingPointerId: number | null = null;
    let lastPaintKey: string | null = null;

    const paintFromEvent = (event: PointerEvent) => {
      const point = this.screenToWorld(event.clientX, event.clientY);
      const tileSize = state.gridSize;
      const x = Math.floor(point.x / tileSize) * tileSize;
      const y = Math.floor(point.y / tileSize) * tileSize;
      const paintKey = `${state.activeLayer}:${x}:${y}`;
      if (paintKey === lastPaintKey) return;
      lastPaintKey = paintKey;
      void placement.placeAt(point.x, point.y);
    };

    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (isEditorUiTarget(event.target)) return;
      paintingPointerId = event.pointerId;
      lastPaintKey = null;
      this.app.canvas.setPointerCapture(event.pointerId);
      paintFromEvent(event);
    };

    const pointerMove = (event: PointerEvent) => {
      if (paintingPointerId !== event.pointerId) return;
      if (isEditorUiTarget(event.target)) return;
      paintFromEvent(event);
    };

    const pointerEnd = (event: PointerEvent) => {
      if (paintingPointerId !== event.pointerId) return;
      paintingPointerId = null;
      lastPaintKey = null;
      if (this.app.canvas.hasPointerCapture(event.pointerId)) {
        this.app.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.app.canvas.addEventListener('pointerdown', pointerDown);
    this.app.canvas.addEventListener('pointermove', pointerMove);
    this.app.canvas.addEventListener('pointerup', pointerEnd);
    this.app.canvas.addEventListener('pointercancel', pointerEnd);
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const transform = this.world.worldTransform;
    return {
      x: (screenX - transform.tx) / transform.a,
      y: (screenY - transform.ty) / transform.d,
    };
  }

  private update(dt: number): void {
    if (!this.editorRuntime) return;

    const transition = this.cameraSystem.update({
      input: this.input.state,
      world: DEFAULT_WORLD,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
      dt,
    });

    if (transition && !this.transitioning) {
      this.transitioning = true;
      void this.editorRuntime.transitionWorldCell().finally(() => {
        this.cameraSystem.setPosition(transition.targetX, transition.targetY);
        this.transitioning = false;
      });
    }
  }

  private drawBackground(world: WorldInfo): void {
    this.background.clear();
    this.background.rect(0, 0, world.width, world.height).fill({ color: 0x1d2b34 });

    const gridSize = 128;
    for (let x = 0; x <= world.width; x += gridSize) {
      this.background.moveTo(x, 0).lineTo(x, world.height).stroke({ width: 1, color: 0x2d3f4f, alpha: 0.28 });
    }
    for (let y = 0; y <= world.height; y += gridSize) {
      this.background.moveTo(0, y).lineTo(0 + world.width, y).stroke({ width: 1, color: 0x2d3f4f, alpha: 0.28 });
    }
  }
}

function mountSafeBootPanel(options: {
  state: EditorState;
  placement: TilePlacementSystem;
  session: MapEditorSession;
  status: (message: string) => void;
}): void {
  document.querySelectorAll('.editor-fallback-panel').forEach((element) => element.remove());

  const panel = document.createElement('div');
  panel.className = 'map-editor-panel minimal-editor-panel';
  panel.style.left = '20px';
  panel.style.top = '20px';
  panel.style.zIndex = '2147483646';

  const header = document.createElement('div');
  header.className = 'map-editor-header';
  header.textContent = 'Map Editor - Safe Boot';

  const body = document.createElement('div');
  body.style.cssText = 'padding:12px;display:grid;gap:10px;font-size:12px;line-height:1.45;max-height:min(70vh,620px);overflow:auto;';

  const note = document.createElement('div');
  note.textContent = '모바일 안전 부팅 패널입니다. 저장/불러오기/기존 UI는 MapEditorSession 기준으로 동작합니다.';
  note.style.color = 'rgba(255,255,255,.78)';

  const selected = document.createElement('div');
  selected.style.cssText = 'padding:8px 9px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(0,0,0,.2);color:#ffe4a3;';

  const stateSummary = document.createElement('div');
  stateSummary.style.cssText = 'padding:8px 9px;border:1px solid rgba(85,214,190,.35);border-radius:10px;background:rgba(85,214,190,.08);color:#dffaf5;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

  const toolActions = createButtonGrid(2);
  const paintButton = createPanelButton('페인트 모드', () => options.state.setMode('paint'));
  const eraseButton = createPanelButton('삭제 모드', () => options.state.setMode('erase'));
  toolActions.append(paintButton, eraseButton);

  const layerActions = createButtonGrid(3);
  const groundLayerButton = createPanelButton('Ground', () => options.state.setLayer('ground'));
  const objectLayerButton = createPanelButton('Object', () => options.state.setLayer('object'));
  const collisionLayerButton = createPanelButton('Collision', () => options.state.setLayer('collision'));
  layerActions.append(groundLayerButton, objectLayerButton, collisionLayerButton);

  const actions = createButtonGrid(2);
  const grassButton = createPanelButton('잔디 선택', () => options.state.selectAsset(createFallbackAsset('grass', 0x527a3a)));
  const dirtButton = createPanelButton('흙 선택', () => options.state.selectAsset(createFallbackAsset('dirt', 0x8a6a3d)));
  const saveButton = createPanelButton('서버 저장', () => {
    void options.session.saveWorld().catch((error: unknown) => options.status(`서버 저장 실패: ${formatErrorMessage(error)}`));
  });
  const loadButton = createPanelButton('서버 불러오기', () => {
    void options.session.loadWorld().catch((error: unknown) => options.status(`서버 불러오기 실패: ${formatErrorMessage(error)}`));
  });
  const classicUiButton = createPanelButton('기존 UI 패널 열기', () => {
    openClassicEditorUi(options);
  });
  const exportButton = createPanelButton('JSON Export', () => {
    void options.session.exportWorldJson().catch((error: unknown) => options.status(`JSON Export 실패: ${formatErrorMessage(error)}`));
  });

  const syncSummary = () => {
    const assetName = options.state.selectedBrush?.asset.name ?? '없음';
    const sourceRect = options.state.selectedBrush?.sourceRect;
    const sourceRectText = sourceRect ? ` / rect ${sourceRect.width}x${sourceRect.height}` : '';
    selected.textContent = `선택: ${assetName}${sourceRectText}`;
    stateSummary.textContent = `mode=${options.state.mode} layer=${options.state.activeLayer} grid=${options.state.gridSize} scale=${options.state.brushScale} transparentBlack=${options.state.transparentBlack ? 'on' : 'off'}`;

    setPressed(paintButton, options.state.mode === 'paint');
    setPressed(eraseButton, options.state.mode === 'erase');
    setPressed(groundLayerButton, options.state.activeLayer === 'ground');
    setPressed(objectLayerButton, options.state.activeLayer === 'object');
    setPressed(collisionLayerButton, options.state.activeLayer === 'collision');
  };
  options.state.subscribe(syncSummary);

  actions.append(grassButton, dirtButton, saveButton, loadButton, classicUiButton, exportButton);
  body.append(note, selected, stateSummary, toolActions, layerActions, actions);
  panel.append(header, body);
  document.body.appendChild(panel);

  options.state.selectAsset(createFallbackAsset('grass', 0x527a3a));
  syncSummary();
  options.status('안전 부팅 패널 표시 완료. 기존 UI 형태 패널을 즉시 열 수 있습니다.');
}

function openClassicEditorUi(options: {
  state: EditorState;
  placement: TilePlacementSystem;
  session: MapEditorSession;
  status: (message: string) => void;
}): void {
  try {
    options.status('기존 UI 형태의 가벼운 Map Editor 패널 여는 중...');
    mountClassicTilesPanelLite({
      state: options.state,
      placement: options.placement,
      session: options.session,
      status: options.status,
      onSave: () => {
        void options.session.saveWorld();
      },
      onLoad: () => {
        void options.session.loadWorld();
      },
      onExport: () => {
        void options.session.exportWorldJson();
      },
      onClear: () => options.placement.clear(),
    });

    void import('./MonsterTabLiteFeature')
      .then(({ installMonsterTabLiteFeature }) => {
        installMonsterTabLiteFeature({ status: options.status });
        options.status('Monsters 탭 경량 편집 기능 연결 완료.');
      })
      .catch((error: unknown) => {
        options.status(`Monsters 탭 기능 로딩 실패: ${formatErrorMessage(error)}`);
      });
  } catch (error) {
    const message = `기존 UI 형태 패널 열기 실패: ${formatErrorMessage(error)}`;
    options.status(message);
    console.warn('[EditorBoot] Classic lite editor UI open failed.', error);
  }
}

async function saveMinimalEditorToServer(placement: TilePlacementSystem, status: (message: string) => void): Promise<void> {
  try {
    status('서버 저장 모듈 로딩 중...');
    const { uploadWorldMap } = await import('../worldMap/uploadWorldMap');
    const draft = placement.mapDraft;
    const world = createSingleCellWorldSave(draft);
    status(`서버 저장 중... placements=${draft.placements.length}`);
    const report = await uploadWorldMap(world);
    status(`서버 저장 완료. cells=${report.cells}, placements=${report.placements}`);
  } catch (error) {
    const message = `서버 저장 실패: ${formatErrorMessage(error)}`;
    status(message);
    console.warn('[EditorBoot] Minimal editor save failed.', error);
  }
}

async function loadMinimalEditorFromServer(placement: TilePlacementSystem, status: (message: string) => void): Promise<void> {
  try {
    status('서버 불러오기 모듈 로딩 중...');
    const { getServerHttpPath } = await import('../net/serverHttp');
    const url = getServerHttpPath('/maps/default');
    status('서버 맵 불러오는 중...');
    const response = await fetch(withCacheBuster(url), {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!response.ok) throw new Error(`GET /maps/default failed: ${response.status}`);

    const map = await response.json() as GameWorldMap | null;
    if (!map) throw new Error('서버에 저장된 맵이 없습니다.');

    const draft = createDraftFromServerMap(map);
    await placement.replaceDraft(draft);
    status(`서버 불러오기 완료. placements=${draft.placements.length}`);
  } catch (error) {
    const message = `서버 불러오기 실패: ${formatErrorMessage(error)}`;
    status(message);
    console.warn('[EditorBoot] Minimal editor load failed.', error);
  }
}

function createSingleCellWorldSave(draft: EditorMapDraft): EditorWorldSave {
  const worldMap: EditorWorldMapDraft = draft.worldMap ?? {
    version: 1,
    cellSize: DEFAULT_CELL_SIZE,
    current: { gridX: 0, gridY: 0 },
    cells: [{ id: 'cell-0-0', name: 'Cell 0,0', gridX: 0, gridY: 0 }],
  };

  return {
    version: 1,
    name: draft.name || DEFAULT_MAP_NAME,
    tileSize: draft.tileSize || 32,
    worldMap,
    cells: [
      {
        gridX: worldMap.current.gridX,
        gridY: worldMap.current.gridY,
        draft: { ...draft, worldMap },
      },
    ],
  };
}

function createDraftFromServerMap(map: GameWorldMap): EditorMapDraft {
  const currentCell = map.cells.find((cell) => cell.gridX === 0 && cell.gridY === 0) ?? map.cells[0];
  const worldMap: EditorWorldMapDraft = {
    version: 1,
    cellSize: map.cellSize || DEFAULT_CELL_SIZE,
    current: currentCell ? { gridX: currentCell.gridX, gridY: currentCell.gridY } : { gridX: 0, gridY: 0 },
    cells: map.cells.map((cell) => ({
      id: `cell-${cell.gridX}-${cell.gridY}`,
      name: `Cell ${cell.gridX},${cell.gridY}`,
      gridX: cell.gridX,
      gridY: cell.gridY,
    })),
    monsterSpawnRules: map.monsterSpawnRules,
    itemOverrides: map.itemOverrides,
  };

  return {
    version: 1,
    name: map.name || DEFAULT_MAP_NAME,
    tileSize: map.tileSize || 32,
    worldMap,
    placements: (currentCell?.placements ?? []).map(convertWorldPlacementToEditorPlacement),
  };
}

function convertWorldPlacementToEditorPlacement(placement: WorldMapPlacement): EditorTilePlacement {
  return {
    id: placement.id || crypto.randomUUID(),
    assetId: placement.assetId,
    assetUrl: placement.assetUrl,
    categoryId: placement.categoryId,
    x: placement.x,
    y: placement.y,
    layer: placement.layer,
    scale: placement.scale || 1,
    displayWidth: placement.displayWidth,
    displayHeight: placement.displayHeight,
    sourceRect: placement.sourceRect,
    solidColor: placement.solidColor,
    transparentBlack: placement.transparentBlack,
    gameplay: placement.gameplay,
  };
}

function createButtonGrid(columns: number): HTMLDivElement {
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:8px;`;
  return grid;
}

function createPanelButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-editor-action';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.style.outline = pressed ? '2px solid rgba(85,214,190,.8)' : '';
  button.style.background = pressed ? 'rgba(85,214,190,.18)' : '';
}

function createFallbackAsset(id: string, color: number): EditorTilesetAsset {
  return {
    id: `fallback.${id}`,
    name: id,
    categoryId: 'fallback',
    url: `solid://fallback-${id}`,
    tileWidth: 32,
    tileHeight: 32,
    solidColor: color,
  };
}

function getRenderResolution(): number {
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, raw));
}

function createEditorStagePanel(): (message: string) => void {
  document.getElementById('editor-stage-panel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'editor-stage-panel';
  panel.style.cssText = [
    'position:fixed',
    'left:10px',
    'bottom:10px',
    'z-index:2147483647',
    'max-width:min(520px,calc(100vw - 20px))',
    'padding:8px 10px',
    'border:1px solid rgba(85,214,190,.85)',
    'border-radius:10px',
    'background:rgba(8,14,20,.92)',
    'color:#eafff9',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'white-space:pre-wrap',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(panel);
  return (message: string) => {
    panel.textContent = message;
    console.log('[EditorBoot]', message);
  };
}

async function loadEditorModule<T>(name: string, loader: () => Promise<T>, status: (message: string) => void): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      status(`${name} import timed out after ${EDITOR_MODULE_LOAD_TIMEOUT_MS}ms.`);
      reject(new Error(`${name} import timed out.`));
    }, EDITOR_MODULE_LOAD_TIMEOUT_MS);
  });

  try {
    status(`${name} import started...`);
    const module = await Promise.race([loader(), timeout]);
    status(`${name} import resolved.`);
    return module;
  } catch (error) {
    status(`${name} import failed: ${formatErrorMessage(error)}`);
    throw error;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.map-editor-panel, .tile-picker-window, .world-map-panel'));
}

function exportJson(draft: EditorMapDraft): void {
  const json = JSON.stringify(draft, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${draft.name || DEFAULT_MAP_NAME}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
