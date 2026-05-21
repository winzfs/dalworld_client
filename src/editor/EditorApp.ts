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
    await this.initializePixiApplication(onStatus);
    onStatus('Pixi application initialized');

    onStatus('Mounting canvas...');
    mount.appendChild(this.app.canvas);
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

  private async initializePixiApplication(onStatus: EditorBootStatus): Promise<void> {
    // Diagnostic probe: tells us at status-message level whether WebGL2/1
    // works on this device. Game uses no explicit preference so we don't
    // pass the probe result to Pixi; previous attempts that did so
    // (preferWebGLVersion / powerPreference / failIfMajorPerformanceCaveat)
    // appear to trigger a buggy Pixi code path on certain mobile GPUs
    // that blocks the main thread and prevents the timeout below from
    // firing. Game runs fine with the bare options below, so we match
    // them exactly.
    await probeWebGLSupport(onStatus);

    onStatus('Calling app.init() with game-app options...');
    await withTimeout(
      this.app.init({
        background: '#1d2b34',
        antialias: false,
        resizeTo: window,
        autoDensity: true,
        resolution: getRenderResolution(),
      }),
      PIXI_INIT_TIMEOUT_MS,
      'Pixi initialization timed out.',
    );
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

function getRenderResolution(): number {
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, raw));
}

async function probeWebGLSupport(onStatus: EditorBootStatus): Promise<void> {
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
    releaseProbeContext(gl2);
    return;
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
    return;
  }

  throw new Error('This device does not appear to support WebGL. Map editor cannot start.');
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
