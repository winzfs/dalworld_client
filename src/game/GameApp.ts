import { Application, Container, Graphics } from 'pixi.js';
import { GameNetwork, getDefaultWebSocketUrl, type NetworkStatus } from '../net/network';
import type {
  PlayerSnapshot,
  PublicGameplayConfig,
  WorldInfo,
} from '../protocol/messages';
import { InputController } from './InputController';
import { Camera } from './Camera';
import { PlayerRenderer } from '../render/PlayerRenderer';
import { ResourceRenderer } from '../render/ResourceRenderer';
import { MonsterRenderer } from '../render/MonsterRenderer';
import { MobileControls } from '../render/MobileControls';
import { ProceduralMeadowRenderer } from '../render/ProceduralMeadowRenderer';
import { GameWorldMapRenderer } from '../render/GameWorldMapRenderer';
import { GameHud } from '../ui/GameHud';
import { GameWindows } from '../ui/GameWindows';
import { ClientMovementSystem } from './systems/ClientMovementSystem';
import { InputSendSystem } from './systems/InputSendSystem';
import { SnapshotSystem } from './systems/SnapshotSystem';
import { CameraSystem } from './systems/CameraSystem';
import { HudSystem } from './systems/HudSystem';
import { ServerMessageRouter } from './systems/ServerMessageRouter';
import { CellTransitionSystem } from './systems/CellTransitionSystem';
import { MapEditor } from '../editor/MapEditor';
import { EditorCameraSystem } from '../editor/EditorCameraSystem';
import { EditorMinimap } from '../editor/EditorMinimap';
import { getRuntimeWorldMap } from '../worldMap/runtimeMapStore';
import { createActiveCellMapView } from '../worldMap/activeCellMapView';
import { getActiveCell, hasCell, setActiveCell } from '../worldMap/activeCellStore';

const INPUT_SEND_HZ = 30;
const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const DEFAULT_GAMEPLAY: PublicGameplayConfig = { playerRadius: 18, playerSpeed: 220, gatherRange: 80 };
const CELL_TRANSFER_TRIGGER_PADDING = 32;
const CELL_EDGE_PADDING = CELL_TRANSFER_TRIGGER_PADDING + 96;

export class GameApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly network: GameNetwork;
  private readonly camera: Camera;
  private readonly cameraSystem: CameraSystem;
  private readonly editorCameraSystem: EditorCameraSystem;
  private readonly hudSystem: HudSystem;
  private readonly messageRouter: ServerMessageRouter;
  private readonly playerRenderer: PlayerRenderer;
  private readonly resourceRenderer: ResourceRenderer;
  private readonly monsterRenderer: MonsterRenderer;
  private readonly worldMapRenderer: GameWorldMapRenderer;
  private readonly movementSystem = new ClientMovementSystem();
  private readonly cellTransitionSystem = new CellTransitionSystem({
    triggerPadding: CELL_TRANSFER_TRIGGER_PADDING,
    spawnPadding: CELL_EDGE_PADDING,
  });
  private readonly inputSendSystem: InputSendSystem;
  private readonly snapshotSystem = new SnapshotSystem();
  private readonly editorMode: boolean;
  private readonly mapEditor: MapEditor | null;
  private readonly editorMinimap: EditorMinimap | null;

  private meadowRenderer: ProceduralMeadowRenderer | null = null;
  private editorTransitioning = false;
  private cellTransitioning = false;

  private worldInfo: WorldInfo = DEFAULT_WORLD;
  private gameplayConfig: PublicGameplayConfig = DEFAULT_GAMEPLAY;
  private myPlayerId: string | null = null;
  private status: NetworkStatus = 'idle';
  private mobileControls: MobileControls | null = null;

  constructor() {
    this.editorMode = isEditorEnabled();
    this.network = new GameNetwork(getDefaultWebSocketUrl());
    this.inputSendSystem = new InputSendSystem(this.network, INPUT_SEND_HZ);
    this.camera = new Camera(this.world);
    this.cameraSystem = new CameraSystem(this.camera);
    this.editorCameraSystem = new EditorCameraSystem(this.camera);
    this.hudSystem = new HudSystem(new GameHud(), new GameWindows());

    this.world.addChild(this.background);
    this.worldMapRenderer = new GameWorldMapRenderer(this.world);
    this.resourceRenderer = new ResourceRenderer(this.world);
    this.monsterRenderer = new MonsterRenderer(this.world);
    this.playerRenderer = new PlayerRenderer(this.world);

    this.messageRouter = new ServerMessageRouter({
      input: this.input.state,
      snapshotSystem: this.snapshotSystem,
      cameraSystem: this.cameraSystem,
      playerRenderer: this.playerRenderer,
      resourceRenderer: this.resourceRenderer,
      monsterRenderer: this.monsterRenderer,
      getMyPlayerId: () => this.myPlayerId,
      setMyPlayerId: (playerId) => {
        this.myPlayerId = playerId;
      },
      setWorldInfo: (world) => {
        this.worldInfo = world;
        this.mapEditor?.setWorldSize(world.width, world.height);
        this.editorCameraSystem.setWorldSize(world);
        this.editorMinimap?.setWorldSize(world.width, world.height);
      },
      setGameplayConfig: (gameplay) => {
        this.gameplayConfig = gameplay ?? DEFAULT_GAMEPLAY;
      },
      redrawWorld: () => {
        this.drawWorldBackground();
      },
      reloadWorldMap: () => {
        void this.loadWorldMap();
      },
    });

    this.mapEditor = this.editorMode
      ? new MapEditor({
          app: this.app,
          world: this.world,
          tileSize: 32,
          mapName: 'dalworld-map',
          worldWidth: this.worldInfo.width,
          worldHeight: this.worldInfo.height,
          onMoveCameraTo: (x, y) => this.editorCameraSystem.setPosition(x, y),
        })
      : null;

    this.editorMinimap = this.editorMode
      ? new EditorMinimap({
          worldWidth: this.worldInfo.width,
          worldHeight: this.worldInfo.height,
          onMoveTo: (x, y) => this.editorCameraSystem.setPosition(x, y),
        })
      : null;
  }

  async start(mount: HTMLElement): Promise<void> {
    document.body.classList.toggle('is-map-editor-mode', this.editorMode);

    await this.app.init({
      background: '#1d2b34',
      antialias: false,
      resizeTo: window,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    mount.appendChild(this.app.canvas);
    this.input.attach();
    this.mobileControls = new MobileControls(this.input);
    this.app.stage.addChild(this.world);
    this.drawWorldBackground();
    await this.loadWorldMap();

    if (this.editorMode) {
      this.editorCameraSystem.setWorldSize(this.worldInfo);
      this.mapEditor?.start();
      this.editorMinimap?.mount(document.body);
      this.app.ticker.add((ticker) => this.updateEditor(ticker.deltaMS / 1000));
      return;
    }

    this.network.onStatus((status) => {
      this.status = status;
    });

    this.network.onMessage((message) => this.messageRouter.handle(message));
    this.network.connect();

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
  }

  private updateEditor(dt: number): void {
    const transition = this.editorCameraSystem.update({
      input: this.input.state,
      world: this.worldInfo,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
      dt,
    });

    const view = this.editorCameraSystem.getView();
    this.editorMinimap?.setPlacements(
      this.mapEditor?.placement.mapDraft.placements ?? [],
    );
    this.editorMinimap?.render({
      ...view,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
    });

    if (transition && this.mapEditor && !this.editorTransitioning) {
      this.editorTransitioning = true;
      void this.mapEditor.transitionWorldCell(transition).finally(() => {
        this.editorCameraSystem.setPosition(transition.targetX, transition.targetY);
        this.editorTransitioning = false;
      });
    }
  }

  private update(dt: number): void {
    if (!this.cellTransitioning) {
      this.applyLocalMovement(dt);
      this.handleRuntimeCellTransition();
      this.inputSendSystem.update(
        {
          input: this.input.state,
          player: this.findMe(),
        },
        dt,
      );
      this.handleGatherInput();
    }

    this.playerRenderer.update(dt);
    this.monsterRenderer.update(dt);

    const me = this.findMe();

    this.cameraSystem.update({
      player: me,
      world: this.worldInfo,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
    });

    this.hudSystem.update({
      status: this.status,
      tick: this.snapshotSystem.snapshot.tick,
      player: me,
      latencyMs: this.network.latencyMs,
    });
  }

  private applyLocalMovement(dt: number): void {
    const me = this.findMe();
    if (!me) return;

    this.snapshotSystem.setLocalPlayer(me);

    this.movementSystem.update(
      {
        player: me,
        keys: this.input.state.keys,
        facing: this.input.state.facing,
        monsters: this.snapshotSystem.snapshot.monsters,
        world: this.worldInfo,
        gameplay: this.gameplayConfig,
      },
      dt,
    );

    this.playerRenderer.sync(this.snapshotSystem.snapshot.players, this.myPlayerId);
  }

  private handleRuntimeCellTransition(): void {
    const map = getRuntimeWorldMap();
    const me = this.findMe();
    if (!map || !me || this.cellTransitioning) return;

    const active = getActiveCell();
    const transition = this.cellTransitionSystem.resolve({
      map,
      player: me,
      activeCell: active,
      hasCell: (gridX, gridY) => hasCell(map, gridX, gridY),
    });

    if (!transition.changed) return;

    console.info('[GameApp] Runtime cell transition', {
      active,
      target: { gridX: transition.nextGridX, gridY: transition.nextGridY },
      player: { x: me.x, y: me.y },
      spawn: { x: transition.nextX, y: transition.nextY },
      availableCells: map.cells.map((cell) => `${cell.gridX}:${cell.gridY}`),
    });

    this.cellTransitioning = true;
    setActiveCell(transition.nextGridX, transition.nextGridY);
    const transitionedPlayer: PlayerSnapshot = {
      ...me,
      x: transition.nextX,
      y: transition.nextY,
      cellX: transition.nextGridX,
      cellY: transition.nextGridY,
    };
    this.snapshotSystem.setLocalPlayer(transitionedPlayer);

    void this.loadWorldMap()
      .then(() => {
        this.playerRenderer.sync(this.snapshotSystem.snapshot.players, this.myPlayerId);
        this.cameraSystem.update({
          player: transitionedPlayer,
          world: this.worldInfo,
          screenWidth: this.app.renderer.width,
          screenHeight: this.app.renderer.height,
        });
      })
      .finally(() => {
        this.cellTransitioning = false;
      });
  }

  private handleGatherInput(): void {
    if (!this.input.consumeGather()) return;

    const me = this.findMe();
    if (!me) return;

    const target = this.resourceRenderer.getClosestAlive(
      this.snapshotSystem.snapshot.resources,
      me.x,
      me.y,
      this.gameplayConfig.gatherRange,
    );

    this.inputSendSystem.sendGather(target?.id);
  }

  private async loadWorldMap(): Promise<void> {
    const runtimeMap = getRuntimeWorldMap();

    if (this.meadowRenderer) {
      this.world.removeChild(this.meadowRenderer.layer);
      this.meadowRenderer.layer.destroy({ children: true });
      this.meadowRenderer = null;
    }

    if (runtimeMap) {
      this.worldInfo = {
        ...this.worldInfo,
        width: runtimeMap.cellSize,
        height: runtimeMap.cellSize,
      };
      this.cameraSystem.setWorldSize(this.worldInfo);
      this.drawWorldBackground();
      this.background.visible = true;

      try {
        await this.worldMapRenderer.render(createActiveCellMapView(runtimeMap));
      } catch (error) {
        console.error('[GameApp] Failed to render active world cell.', error);
      }
      return;
    }

    await this.worldMapRenderer.render(null);

    this.meadowRenderer = new ProceduralMeadowRenderer(this.world, {
      worldWidth: this.worldInfo.width,
      worldHeight: this.worldInfo.height,
      seed: 20260518,
    });

    try {
      await this.meadowRenderer.load();
      this.world.setChildIndex(this.meadowRenderer.layer, 1);
      this.background.visible = false;
    } catch (error) {
      console.warn('Failed to load procedural meadow map. Using fallback background.', error);
      this.background.visible = true;
    }
  }

  private findMe(): PlayerSnapshot | null {
    return this.snapshotSystem.findMe(this.myPlayerId);
  }

  private drawWorldBackground(): void {
    this.background.removeChildren().forEach((child) => child.destroy());
    this.background.clear();

    this.background
      .rect(0, 0, this.worldInfo.width, this.worldInfo.height)
      .fill({ color: 0x223843 });

    const step = 200;

    for (let x = 0; x <= this.worldInfo.width; x += step) {
      this.background
        .moveTo(x, 0)
        .lineTo(x, this.worldInfo.height)
        .stroke({ color: 0x2c4a55, width: 1 });
    }

    for (let y = 0; y <= this.worldInfo.height; y += step) {
      this.background
        .moveTo(0, y)
        .lineTo(this.worldInfo.width, y)
        .stroke({ color: 0x2c4a55, width: 1 });
    }
  }
}

function isEditorEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('editor') === '1';
}
