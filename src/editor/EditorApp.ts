import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../game/Camera';
import { InputController } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';
import { EditorCameraSystem } from './EditorCameraSystem';
import { EditorFallbackPanel } from './EditorFallbackPanel';
import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorMapDraft, EditorTilesetAsset } from './types';

const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const EDITOR_MODULE_LOAD_TIMEOUT_MS = 5_000;

type LightweightRuntime = {
  placement: TilePlacementSystem;
  transitionWorldCell: () => Promise<void>;
};

type RuntimeModules = {
  EditorState: new () => EditorState;
  TilePlacementSystem: new (
    state: EditorState,
    options: { tileSize: number; mapName: string },
  ) => TilePlacementSystem;
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

      this.editorRuntime = this.createInlineLightweightRuntime(
        {
          EditorState,
          TilePlacementSystem,
        },
        status,
      );

      this.fallbackPanel?.element.remove();
      this.fallbackPanel = null;
      this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
      status(`Minimal editor ready. Panel count: ${document.querySelectorAll('.map-editor-panel').length}`);
      console.log('[EditorBoot] Minimal editor ready.');
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
      mapName: 'dalworld-map-lightweight',
    });

    this.world.addChild(placement.layer);
    mountMinimalEditorPanel({
      state,
      placement,
      status,
    });
    this.attachPaintingHandlers(state, placement);
    status('최소 에디터 준비 완료. 기본 타일을 맵에 터치/드래그해서 배치할 수 있습니다.');

    return {
      placement,
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
    this.background
      .rect(0, 0, world.width, world.height)
      .fill({ color: 0x1d2b34 });

    const gridSize = 128;
    for (let x = 0; x <= world.width; x += gridSize) {
      this.background
        .moveTo(x, 0)
        .lineTo(x, world.height)
        .stroke({ width: 1, color: 0x2d3f4f, alpha: 0.28 });
    }
    for (let y = 0; y <= world.height; y += gridSize) {
      this.background
        .moveTo(0, y)
        .lineTo(world.width, y)
        .stroke({ width: 1, color: 0x2d3f4f, alpha: 0.28 });
    }
  }
}

function mountMinimalEditorPanel(options: {
  state: EditorState;
  placement: TilePlacementSystem;
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
  header.textContent = 'Map Editor - Minimal';

  const body = document.createElement('div');
  body.style.cssText = 'padding:12px;display:grid;gap:10px;font-size:12px;line-height:1.45;';

  const note = document.createElement('div');
  note.textContent = '모바일 안정화용 최소 에디터입니다. 기본 타일 배치, 전체 채우기, 지우기, JSON 내보내기를 지원합니다.';
  note.style.color = 'rgba(255,255,255,.78)';

  const selected = document.createElement('div');
  selected.style.cssText = 'padding:8px 9px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(0,0,0,.2);color:#ffe4a3;';
  selected.textContent = '선택: 기본 잔디 타일';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

  const grassButton = createPanelButton('잔디 선택', () => {
    options.state.selectAsset(createFallbackAsset('grass', 0x527a3a));
    selected.textContent = '선택: 기본 잔디 타일';
  });
  const dirtButton = createPanelButton('흙 선택', () => {
    options.state.selectAsset(createFallbackAsset('dirt', 0x8a6a3d));
    selected.textContent = '선택: 기본 흙 타일';
  });
  const fillButton = createPanelButton('전체 채우기', () => {
    void options.placement.fillAll({ width: DEFAULT_WORLD.width, height: DEFAULT_WORLD.height });
  });
  const clearButton = createPanelButton('지우기', () => options.placement.clear());
  const exportButton = createPanelButton('JSON Export', () => exportJson(options.placement.mapDraft));

  actions.append(grassButton, dirtButton, fillButton, clearButton, exportButton);
  body.append(note, selected, actions);
  panel.append(header, body);
  document.body.appendChild(panel);

  options.state.selectAsset(createFallbackAsset('grass', 0x527a3a));
  options.status('최소 에디터 패널 표시 완료.');
}

function createPanelButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-editor-action';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

function createFallbackAsset(id: string, color: number): EditorTilesetAsset {
  return {
    id: `fallback.${id}`,
    name: id,
    categoryId: 'fallback',
    url: '',
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

async function loadEditorModule<T>(
  name: string,
  loader: () => Promise<T>,
  status: (message: string) => void,
): Promise<T> {
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
  anchor.download = `${draft.name || 'dalworld-map-lightweight'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
