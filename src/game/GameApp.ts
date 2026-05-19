import { Application, Container, Graphics } from 'pixi.js';
import { GameNetwork, getDefaultWebSocketUrl, type NetworkStatus } from '../net/network';
import type {
  PlayerSnapshot,
  PublicGameplayConfig,
  ResourceSnapshot,
  WorldInfo,
} from '../protocol/messages';
import { InputController } from './InputController';
import { Camera } from './Camera';
import { PlayerRenderer } from '../render/PlayerRenderer';
import { ResourceRenderer } from '../render/ResourceRenderer';
import { MonsterRenderer } from '../render/MonsterRenderer';
import { MobileControls } from '../render/MobileControls';
import { GameWorldMapRenderer } from '../render/GameWorldMapRenderer';
import { GameHud } from '../ui/GameHud';
import { GameWindows } from '../ui/GameWindows';
import { BuildingGridOverlay } from '../systems/building/BuildingGridOverlay';
import { BuildingModeState } from '../systems/building/BuildingModeState';
import { ClientMovementSystem } from './systems/ClientMovementSystem';
import { InputSendSystem } from './systems/InputSendSystem';
import { SnapshotSystem } from './systems/SnapshotSystem';
import { CameraSystem } from './systems/CameraSystem';
import { HudSystem } from './systems/HudSystem';
import { ServerMessageRouter } from './systems/ServerMessageRouter';
import { CellTransitionSystem } from './systems/CellTransitionSystem';
import { RuntimeWorldSystem } from './systems/RuntimeWorldSystem';
import { RuntimeCellTransitionController } from './systems/RuntimeCellTransitionController';
import { MapEditor } from '../editor/MapEditor';
import { EditorCameraSystem } from '../editor/EditorCameraSystem';
import { EditorMinimap } from '../editor/EditorMinimap';
import { getActiveCell } from '../worldMap/activeCellStore';

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
  private readonly runtimeWorldSystem: RuntimeWorldSystem;
  private readonly buildingModeState = new BuildingModeState();
  private readonly buildingGridOverlay = new BuildingGridOverlay({
    buildingModeState: this.buildingModeState,
    width: 32,
    height: 32,
  });
  private readonly movementSystem = new ClientMovementSystem();
  private readonly cellTransitionSystem = new CellTransitionSystem({
    triggerPadding: CELL_TRANSFER_TRIGGER_PADDING,
    spawnPadding: CELL_EDGE_PADDING,
  });
  private readonly runtimeCellTransitionController: RuntimeCellTransitionController;
  private readonly inputSendSystem: InputSendSystem;
  private readonly snapshotSystem = new SnapshotSystem();
  private readonly editorMode: boolean;
  private readonly mapEditor: MapEditor | null;
  private readonly editorMinimap: EditorMinimap | null;

  private editorTransitioning = false;

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
    this.hudSystem = new HudSystem(
      new GameHud(),
      new GameWindows({
        onSelectBuildPart: (partId) => this.buildingModeState.enter(partId),
        onExitBuildingMode: () => this.buildingModeState.exit(),
        onRotateBuildingPart: () => this.buildingModeState.rotateNext(),
        onSetBuildingLayer: (z) => this.buildingModeState.setCurrentZ(z),
      }),
    );

    this.world.sortableChildren = true;
    this.world.addChild(this.background);
    this.world.addChild(this.buildingGridOverlay.container);
    this.worldMapRenderer = new GameWorldMapRenderer(this.world);
    this.resourceRenderer = new ResourceRenderer(this.world);
    this.monsterRenderer = new MonsterRenderer(this.world);
    this.playerRenderer = new PlayerRenderer(this.world);
    this.runtimeWorldSystem = new RuntimeWorldSystem({
      world: this.world,
      background: this.background,
      getWorldInfo: () => this.worldInfo,
      cameraSystem: this.cameraSystem,
      worldMapRenderer: this.worldMapRenderer,
    });
    this.runtimeCellTransitionController = new RuntimeCellTransitionController({
      cellTransitionSystem: this.cellTransitionSystem,
      snapshotSystem: this.snapshotSystem,
      playerRenderer: this.playerRenderer,
      cameraSystem: this.cameraSystem,
      getMyPlayerId: () => this.myPlayerId,
      getWorldInfo: () => this.worldInfo,
      getScreenSize: () => ({ width: this.app.renderer.width, height: this.app.renderer.height }),
      loadWorldMap: () => this.loadWorldMap(),
    });

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
        this.runtimeWorldSystem.drawBackground(this.worldInfo);
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
    this.runtimeWorldSystem.drawBackground(this.worldInfo);
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
    if (!this.runtimeCellTransitionController.isTransitioning) {
      this.applyLocalMovement(dt);
      this.runtimeCellTransitionController.tryStart(this.findMe());
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
      buildingMode: this.buildingModeState.getSnapshot(),
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

  private handleGatherInput(): void {
    if (!this.input.consumeGather()) return;

    const me = this.findMe();
    if (!me) return;

    const target = this.resourceRenderer.getClosestAlive(
      this.getCurrentCellResources(),
      me.x,
      me.y,
      this.gameplayConfig.gatherRange,
    );

    this.inputSendSystem.sendGather(target?.id);
  }

  private getCurrentCellResources(): ResourceSnapshot[] {
    const active = getActiveCell();
    return this.snapshotSystem.snapshot.resources.filter((resource) => (
      resource.cellX === active.gridX &&
      resource.cellY === active.gridY
    ));
  }

  private async loadWorldMap(): Promise<void> {
    const result = await this.runtimeWorldSystem.load();
    this.worldInfo = result.worldInfo;
  }

  private findMe(): PlayerSnapshot | null {
    return this.snapshotSystem.findMe(this.myPlayerId);
  }
}

function isEditorEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('editor') === '1';
}
