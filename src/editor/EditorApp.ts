import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../game/Camera';
import { InputController } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';
import { MapEditor } from './MapEditor';
import { EditorCameraSystem } from './EditorCameraSystem';
import { EditorMinimap } from './EditorMinimap';

const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };

export class EditorApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly camera = new Camera(this.world);
  private readonly cameraSystem = new EditorCameraSystem(this.camera);
  private readonly mapEditor = new MapEditor({
    app: this.app,
    world: this.world,
    tileSize: 32,
    mapName: 'dalworld-map',
    worldWidth: DEFAULT_WORLD.width,
    worldHeight: DEFAULT_WORLD.height,
    onMoveCameraTo: (x, y) => this.cameraSystem.setPosition(x, y),
  });
  private readonly minimap = new EditorMinimap({
    worldWidth: DEFAULT_WORLD.width,
    worldHeight: DEFAULT_WORLD.height,
    onMoveTo: (x, y) => this.cameraSystem.setPosition(x, y),
  });

  private transitioning = false;

  async start(mount: HTMLElement): Promise<void> {
    document.body.classList.add('is-map-editor-mode');

    await this.app.init({
      background: '#1d2b34',
      antialias: false,
      resizeTo: window,
      autoDensity: true,
      resolution: getRenderResolution(),
    });

    mount.appendChild(this.app.canvas);
    this.input.attach();
    this.world.sortableChildren = true;
    this.world.addChild(this.background);
    this.app.stage.addChild(this.world);
    this.drawBackground(DEFAULT_WORLD);
    this.cameraSystem.setWorldSize(DEFAULT_WORLD);

    this.mapEditor.start();
    this.minimap.mount(document.body);
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
  }

  private update(dt: number): void {
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
    this.background.rect(0, 0, world.width, world.height);
    this.background.fill({ color: 0x1d2b34 });

    const gridSize = 128;
    this.background.setStrokeStyle({ width: 1, color: 0x2d3f4f, alpha: 0.28 });
    for (let x = 0; x <= world.width; x += gridSize) {
      this.background.moveTo(x, 0);
      this.background.lineTo(x, world.height);
    }
    for (let y = 0; y <= world.height; y += gridSize) {
      this.background.moveTo(0, y);
      this.background.lineTo(world.width, y);
    }
    this.background.stroke();
  }
}

function getRenderResolution(): number {
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, raw));
}
