import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../game/Camera';
import { InputController } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';
import { EditorCameraSystem } from './EditorCameraSystem';
import { EditorFallbackPanel } from './EditorFallbackPanel';
import type { LightweightEditorRuntime } from './LightweightEditorRuntime';

const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const EDITOR_MODULE_LOAD_TIMEOUT_MS = 5_000;

export class EditorApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly camera = new Camera(this.world);
  private readonly cameraSystem = new EditorCameraSystem(this.camera);

  private editorRuntime: LightweightEditorRuntime | null = null;
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
    this.fallbackPanel.setStatus('렌더러 준비 완료. 경량 에디터 런타임 로딩 중...');
  }

  private async loadLightweightRuntime(status: (message: string) => void): Promise<void> {
    try {
      status('Loading lightweight editor runtime...');
      this.fallbackPanel?.setStatus('경량 에디터 런타임 로딩 중...');
      const { LightweightEditorRuntime } = await loadEditorModule(
        'LightweightEditorRuntime',
        () => import('./LightweightEditorRuntime'),
        status,
      );

      this.editorRuntime = new LightweightEditorRuntime({
        app: this.app,
        world: this.world,
        worldWidth: DEFAULT_WORLD.width,
        worldHeight: DEFAULT_WORLD.height,
        tileSize: 32,
        mapName: 'dalworld-map-lightweight',
        notify: (message) => {
          this.fallbackPanel?.setStatus(message);
          status(message);
        },
      });
      this.editorRuntime.start(document.body);
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
