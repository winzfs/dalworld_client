import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../game/Camera';
import { InputController } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';
import { EditorCameraSystem } from './EditorCameraSystem';
import { EditorFallbackPanel } from './EditorFallbackPanel';
import type { EditorGridOverlay } from './EditorGridOverlay';
import type { EditorState } from './EditorState';
import type { TilesetPanel } from './TilesetPanel';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorMapDraft, EditorMonsterSpawnRule, EditorTilesetAsset } from './types';

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
  EditorGridOverlay: new (
    state: EditorState,
    options: { width: number; height: number },
  ) => EditorGridOverlay;
  TilesetPanel: new (
    state: EditorState,
    options: {
      onSave: () => void;
      onLoad: () => void;
      onExport: () => void;
      onClear: () => void;
      onPickAsset: (asset: EditorTilesetAsset) => void;
      onFillAll: () => void;
      onRandomFill: (chancePercent: number) => void;
      onToggleWorldMap: () => void;
      getMonsterSpawnRules: () => EditorMonsterSpawnRule[];
      setMonsterSpawnRules: (rules: EditorMonsterSpawnRule[]) => void;
    },
  ) => TilesetPanel;
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
    this.fallbackPanel.setStatus('렌더러 준비 완료. 경량 에디터 의존성 개별 로딩 중...');
  }

  private async loadLightweightRuntime(status: (message: string) => void): Promise<void> {
    try {
      status('Loading lightweight editor dependencies individually...');
      this.fallbackPanel?.setStatus('경량 에디터 의존성 개별 로딩 중...');

      const { EditorState } = await loadEditorModule('EditorState', () => import('./EditorState'), status);
      const { TilesetPanel } = await loadEditorModule('TilesetPanel', () => import('./TilesetPanel'), status);
      const { TilePlacementSystem } = await loadEditorModule('TilePlacementSystem', () => import('./TilePlacementSystem'), status);
      const { EditorGridOverlay } = await loadEditorModule('EditorGridOverlay', () => import('./EditorGridOverlay'), status);

      this.editorRuntime = this.createInlineLightweightRuntime(
        {
          EditorState,
          TilesetPanel,
          TilePlacementSystem,
          EditorGridOverlay,
        },
        status,
      );

      this.fallbackPanel?.element.remove();
      this.fallbackPanel = null;
      this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
      status(`Lightweight editor ready. Panel count: ${document.querySelectorAll('.map-editor-panel').length}`);
      console.log('[EditorBoot] Lightweight editor ready.');
    } catch (error) {
      const message = `Lightweight editor failed: ${formatErrorMessage(error)}`;
      this.fallbackPanel?.setStatus(message);
      status(message);
      console.warn('[EditorBoot] Lightweight editor failed.', error);
    }
  }

  private createInlineLightweightRuntime(modules: RuntimeModules, status: (message: string) => void): LightweightRuntime {
    const state = new modules.EditorState();
    const placement = new modules.TilePlacementSystem(state, {
      tileSize: 32,
      mapName: 'dalworld-map-lightweight',
    });
    const gridOverlay = new modules.EditorGridOverlay(state, {
      width: DEFAULT_WORLD.width,
      height: DEFAULT_WORLD.height,
    });
    const panel = new modules.TilesetPanel(state, {
      onSave: () => status('경량 모드에서는 아직 서버 저장을 지원하지 않습니다. Export를 사용해 주세요.'),
      onLoad: () => status('경량 모드에서는 아직 불러오기를 지원하지 않습니다.'),
      onExport: () => exportJson(placement.mapDraft),
      onClear: () => placement.clear(),
      onPickAsset: (asset) => state.selectAsset(asset),
      onFillAll: () => {
        void placement.fillAll({ width: DEFAULT_WORLD.width, height: DEFAULT_WORLD.height });
      },
      onRandomFill: (chancePercent) => {
        void placement.fillRandom({
          width: DEFAULT_WORLD.width,
          height: DEFAULT_WORLD.height,
          chancePercent,
        });
      },
      onToggleWorldMap: () => status('경량 모드에서는 월드맵 패널을 아직 지원하지 않습니다.'),
      getMonsterSpawnRules: () => [],
      setMonsterSpawnRules: () => undefined,
    });

    this.world.addChild(gridOverlay.layer);
    this.world.addChild(placement.layer);
    panel.mount(document.body);
    this.attachPaintingHandlers(state, placement);
    status('경량 에디터 준비 완료. 타일을 선택하고 맵을 터치/드래그해서 배치할 수 있습니다.');

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
