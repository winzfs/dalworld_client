import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../game/Camera';
import { InputController } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';
import { MapEditor } from './MapEditor';
import { EditorCameraSystem } from './EditorCameraSystem';
import { EditorMinimap } from './EditorMinimap';

const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const PIXI_INIT_TIMEOUT_MS = 8_000;

type EditorBootStatus = (message: string) => void;

export class EditorApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly camera = new Camera(this.world);
  private readonly cameraSystem = new EditorCameraSystem(this.camera);

  private mapEditor: MapEditor | null = null;
  private minimap: EditorMinimap | null = null;
  private transitioning = false;

  async start(mount: HTMLElement, onStatus: EditorBootStatus = () => undefined): Promise<void> {
    onStatus('EditorApp.start entered');
    document.body.classList.add('is-map-editor-mode');

    onStatus('Waiting one frame before Pixi init...');
    await nextFrame();

    onStatus('Initializing Pixi application...');
    await this.initializePixiApplication(mount, onStatus);
    onStatus('Pixi application initialized');

    this.input.attach();
    this.world.sortableChildren = true;
    this.world.addChild(this.background);
    this.app.stage.addChild(this.world);
    window.addEventListener('resize', () => this.resizeRenderer());

    onStatus('Drawing editor background...');
    this.drawBackground(DEFAULT_WORLD);
    this.cameraSystem.setWorldSize(DEFAULT_WORLD);

    onStatus('Creating MapEditor UI objects...');
    this.mapEditor = new MapEditor({
      app: this.app,
      world: this.world,
      tileSize: 32,
      mapName: 'dalworld-map',
      worldWidth: DEFAULT_WORLD.width,
      worldHeight: DEFAULT_WORLD.height,
      onMoveCameraTo: (x, y) => this.cameraSystem.setPosition(x, y),
    });
    this.minimap = new EditorMinimap({
      worldWidth: DEFAULT_WORLD.width,
      worldHeight: DEFAULT_WORLD.height,
      onMoveTo: (x, y) => this.cameraSystem.setPosition(x, y),
    });
    onStatus('MapEditor UI objects created');

    onStatus('Starting MapEditor UI...');
    this.mapEditor.start();

    onStatus('Mounting editor minimap...');
    this.minimap.mount(document.body);

    onStatus('Starting editor ticker...');
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
    onStatus('EditorApp.start completed');
  }

  private async initializePixiApplication(mount: HTMLElement, onStatus: EditorBootStatus): Promise<void> {
    const size = getViewportSize();

    onStatus(`Mounting canvas (${size.width}x${size.height}) before Pixi init...`);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    mount.appendChild(canvas);

    // Probe WebGL context support manually before calling Pixi.init. If
    // getContext itself hangs synchronously on a buggy mobile driver, the
    // onStatus line just before the call tells us exactly which API is at
    // fault. If WebGL2 returns null but WebGL1 works, we switch Pixi to
    // WebGL1 instead of having Pixi's auto-detection fail silently.
    const webglVersion = await this.probeWebGLSupport(onStatus);

    onStatus(`Calling app.init() with WebGL${webglVersion} (${size.width}x${size.height})...`);
    await withTimeout(
      this.app.init({
        canvas,
        background: '#1d2b34',
        antialias: false,
        width: size.width,
        height: size.height,
        autoDensity: false,
        resolution: 1,
        preference: 'webgl',
        preferWebGLVersion: webglVersion,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'low-power',
      }),
      PIXI_INIT_TIMEOUT_MS,
      'Pixi initialization timed out.',
    );
  }

  private async probeWebGLSupport(onStatus: EditorBootStatus): Promise<1 | 2> {
    const probe = document.createElement('canvas');
    probe.width = 4;
    probe.height = 4;

    onStatus('Probe step 1: requesting WebGL2 context...');
    let gl2: RenderingContext | null = null;
    try {
      gl2 = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false } as WebGLContextAttributes);
    } catch (error) {
      onStatus(`Probe step 1 threw: ${String(error)}`);
    }
    onStatus(`Probe step 1 result: ${gl2 ? 'WebGL2 OK' : 'WebGL2 NOT available'}`);

    if (gl2) {
      // Release the probe context so the renderer can claim a fresh one.
      releaseProbeContext(gl2);
      return 2;
    }

    onStatus('Probe step 2: requesting WebGL1 context...');
    let gl1: RenderingContext | null = null;
    try {
      gl1 =
        probe.getContext('webgl', { failIfMajorPerformanceCaveat: false } as WebGLContextAttributes) ??
        probe.getContext('experimental-webgl' as 'webgl', { failIfMajorPerformanceCaveat: false } as WebGLContextAttributes);
    } catch (error) {
      onStatus(`Probe step 2 threw: ${String(error)}`);
    }
    onStatus(`Probe step 2 result: ${gl1 ? 'WebGL1 OK' : 'WebGL1 NOT available'}`);

    if (gl1) {
      releaseProbeContext(gl1);
      return 1;
    }

    throw new Error('This device does not appear to support WebGL. Map editor cannot start.');
  }

  private resizeRenderer(): void {
    const size = getViewportSize();
    this.app.renderer.resize(size.width, size.height);
  }

  private update(dt: number): void {
    if (!this.mapEditor || !this.minimap) return;

    const transition = this.cameraSystem.update({
      input: this.input.state,
      world: DEFAULT_WORLD,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
      dt,
    });

    const view = this.cameraSystem.getView();
    this.minimap.setPlacements(this.mapEditor.placement.mapDraft.placements);
    this.minimap.render({ ...view, screenWidth: this.app.renderer.width, screenHeight: this.app.renderer.height });

    if (transition && !this.transitioning) {
      this.transitioning = true;
      void this.mapEditor.transitionWorldCell(transition).finally(() => {
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

function getViewportSize(): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(window.innerWidth || document.documentElement.clientWidth || 1)),
    height: Math.max(1, Math.floor(window.innerHeight || document.documentElement.clientHeight || 1)),
  };
}

function releaseProbeContext(context: RenderingContext): void {
  const gl = context as WebGLRenderingContext;
  const ext = gl.getExtension?.('WEBGL_lose_context') as { loseContext?: () => void } | null;
  ext?.loseContext?.();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
