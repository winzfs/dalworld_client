import { Application, Container, Graphics } from 'pixi.js';
import { GameNetwork, getDefaultWebSocketUrl, type NetworkStatus } from '../net/network';
import type {
  CraftingServerEvent,
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
import { RuntimeMinimap } from '../ui/RuntimeMinimap';
import { BuildingEditControls } from '../systems/building/BuildingEditControls';
import { BuildingEditCoordinator } from '../systems/building/BuildingEditCoordinator';
import type { BuildingEditDraft } from '../systems/building/BuildingEditTypes';
import { BuildingGridOverlay } from '../systems/building/BuildingGridOverlay';
import { BuildingModeState } from '../systems/building/BuildingModeState';
import { BuildingPlacementRenderer } from '../systems/building/BuildingPlacementRenderer';
import { BuildingGhostPreviewRenderer } from '../systems/building/BuildingGhostPreviewRenderer';
import { ClientBuildingOccupancy } from '../systems/building/ClientBuildingOccupancy';
import { gridToScreen, screenToGridApprox } from '../systems/building/IsoBuildingMath';
import type { BuildPartId, BuildingServerEvent, PlacedBuildPart } from '../systems/building/BuildingTypes';
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
import { getRuntimeWorldMap } from '../worldMap/runtimeMapStore';

const INPUT_SEND_HZ = 30;
const HUD_UPDATE_INTERVAL_SECONDS = 1 / 12;
const MINIMAP_UPDATE_INTERVAL_SECONDS = 1 / 6;
const OCCLUSION_UPDATE_INTERVAL_SECONDS = 1 / 10;
const MAP_VIEWPORT_UPDATE_INTERVAL_SECONDS = 1 / 12;
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
  private readonly runtimeMinimap = new RuntimeMinimap();
  private readonly buildingModeState = new BuildingModeState();
  private readonly buildingGridOverlay = new BuildingGridOverlay({
    buildingModeState: this.buildingModeState,
    width: 32,
    height: 32,
  });
  private readonly buildingPlacementRenderer = new BuildingPlacementRenderer();
  private readonly buildingGhostPreviewRenderer = new BuildingGhostPreviewRenderer();
  private readonly buildingOccupancy = new ClientBuildingOccupancy();
  private readonly buildingEdit = new BuildingEditCoordinator({
    occupancy: this.buildingOccupancy,
    createRequestId: () => crypto.randomUUID(),
  });
  private readonly buildingEditControls = new BuildingEditControls();
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
  private buildingGridVisible = true;
  private hudUpdateAccumulator = HUD_UPDATE_INTERVAL_SECONDS;
  private minimapUpdateAccumulator = MINIMAP_UPDATE_INTERVAL_SECONDS;
  private occlusionUpdateAccumulator = OCCLUSION_UPDATE_INTERVAL_SECONDS;
  private mapViewportUpdateAccumulator = MAP_VIEWPORT_UPDATE_INTERVAL_SECONDS;

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
        onSelectBuildPart: (partId) => {
          this.setBuildingGridVisible(true);
          this.buildingModeState.enter(partId);
          this.beginNewBuildingDraft(partId);
        },
        onEnterRemoveMode: () => {
          this.cancelBuildingDraft();
          this.setBuildingGridVisible(true);
          this.buildingModeState.enterRemoveMode();
        },
        onExitBuildingMode: () => {
          this.cancelBuildingDraft();
          this.buildingModeState.exit();
        },
        onRotateBuildingPart: () => this.rotateBuildingDraftOrMode(),
        onSetBuildingLayer: (z) => {
          this.buildingModeState.setCurrentZ(z);
          const draft = this.buildingEdit.setLayer(z);
          if (draft) this.renderBuildingDraft(draft);
        },
        onCraftRecipe: (recipeId) => {
          this.network.send({
            type: 'CRAFT_REQUEST',
            requestId: crypto.randomUUID(),
            recipeId,
          });
        },
      }),
    );

    this.world.sortableChildren = true;
    this.world.addChild(this.background);
    this.world.addChild(this.buildingGridOverlay.container);
    this.world.addChild(this.buildingPlacementRenderer.container);
    this.world.addChild(this.buildingGhostPreviewRenderer.container);
    this.setBuildingGridVisible(this.buildingGridVisible);
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
      onBuildingEvent: (event) => this.handleBuildingEvent(event),
      onCraftingEvent: (event) => this.handleCraftingEvent(event),
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

  beginStationBuildPlacement(partId: BuildPartId): void {
    this.setBuildingGridVisible(true);
    this.buildingModeState.enter(partId);
    this.beginNewBuildingDraft(partId);
  }

  async start(mount: HTMLElement): Promise<void> {
    document.body.classList.toggle('is-map-editor-mode', this.editorMode);

    await this.app.init({
      background: '#1d2b34',
      antialias: false,
      resizeTo: window,
      autoDensity: true,
      resolution: getRenderResolution(),
    });

    mount.appendChild(this.app.canvas);
    this.input.attach();
    this.mobileControls = new MobileControls(this.input);
    this.buildingEditControls.mount(document.body);
    this.installBuildingEditControls();
    this.app.stage.addChild(this.world);
    this.runtimeWorldSystem.drawBackground(this.worldInfo);
    await this.loadWorldMap();

    if (this.editorMode) {
      this.buildingEditControls.hide();
      this.editorCameraSystem.setWorldSize(this.worldInfo);
      this.mapEditor?.start();
      this.editorMinimap?.mount(document.body);
      this.app.ticker.add((ticker) => this.updateEditor(ticker.deltaMS / 1000));
      return;
    }

    this.runtimeMinimap.mount(document.body);
    this.app.canvas.addEventListener('pointermove', (event) => this.handleCanvasPointerMove(event));
    this.app.canvas.addEventListener('pointerleave', () => {
      if (!this.buildingEdit.hasDraft()) this.buildingGhostPreviewRenderer.hide();
    });
    this.app.canvas.addEventListener('pointerdown', (event) => this.handleCanvasPointerDown(event));
    window.addEventListener('pointermove', (event) => this.handleGlobalPointerMove(event));
    window.addEventListener('pointerup', (event) => this.handleGlobalPointerUp(event));
    window.addEventListener('keydown', (event) => this.handleBuildingHotkey(event));

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
    this.editorMinimap?.setPlacements(this.mapEditor?.placement.mapDraft.placements ?? []);
    this.editorMinimap?.render({ ...view, screenWidth: this.app.renderer.width, screenHeight: this.app.renderer.height });

    if (transition && this.mapEditor && !this.editorTransitioning) {
      this.editorTransitioning = true;
      void this.mapEditor.transitionWorldCell(transition).finally(() => {
        this.editorCameraSystem.setPosition(transition.targetX, transition.targetY);
        this.editorTransitioning = false;
      });
    }
  }

  private update(dt: number): void {
    let me = this.findMe();

    if (!this.runtimeCellTransitionController.isTransitioning) {
      this.applyLocalMovement(dt, me);
      me = this.findMe();
      this.runtimeCellTransitionController.tryStart(me);
      this.inputSendSystem.update({ input: this.input.state, player: me }, dt);
      this.handleGatherInput(me);
    }

    this.playerRenderer.update(dt);
    this.monsterRenderer.update(dt);

    this.updateOcclusion(dt, me);
    this.cameraSystem.update({ player: me, world: this.worldInfo, screenWidth: this.app.renderer.width, screenHeight: this.app.renderer.height });
    this.updateMapViewport(dt, me);
    this.updateRuntimeMinimap(dt, me);
    this.updateHud(dt, me);
    this.syncBuildingControlsPosition();
  }

  private applyLocalMovement(dt: number, me: PlayerSnapshot | null): void {
    if (!me) return;
    this.snapshotSystem.setLocalPlayer(me);
    this.movementSystem.update({
      player: me,
      keys: this.input.state.keys,
      facing: this.input.state.facing,
      monsters: this.snapshotSystem.snapshot.monsters,
      world: this.worldInfo,
      gameplay: this.gameplayConfig,
      buildingOccupancy: this.buildingOccupancy,
    }, dt);
    this.playerRenderer.sync(this.snapshotSystem.snapshot.players, this.myPlayerId);
  }

  private updateOcclusion(dt: number, me: PlayerSnapshot | null): void {
    this.occlusionUpdateAccumulator += dt;
    if (this.occlusionUpdateAccumulator < OCCLUSION_UPDATE_INTERVAL_SECONDS) return;
    this.occlusionUpdateAccumulator = 0;

    this.buildingPlacementRenderer.applyOcclusionFocus(me ? { worldX: me.x, worldY: me.y } : null);
    this.monsterRenderer.applyOcclusion((x, y) => this.buildingPlacementRenderer.isOccludingFocus({ worldX: x, worldY: y }));
  }

  private updateMapViewport(dt: number, me: PlayerSnapshot | null): void {
    this.mapViewportUpdateAccumulator += dt;
    if (this.mapViewportUpdateAccumulator < MAP_VIEWPORT_UPDATE_INTERVAL_SECONDS) return;
    this.mapViewportUpdateAccumulator = 0;

    this.worldMapRenderer.updateViewport({
      centerX: me?.x ?? this.camera.x,
      centerY: me?.y ?? this.camera.y,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
      zoom: this.camera.zoom,
    });
  }

  private updateRuntimeMinimap(dt: number, me: PlayerSnapshot | null): void {
    this.minimapUpdateAccumulator += dt;
    if (this.minimapUpdateAccumulator < MINIMAP_UPDATE_INTERVAL_SECONDS) return;
    this.minimapUpdateAccumulator = 0;

    this.runtimeMinimap.render({
      map: getRuntimeWorldMap(),
      players: this.snapshotSystem.snapshot.players,
      resources: this.snapshotSystem.snapshot.resources,
      monsters: this.snapshotSystem.snapshot.monsters,
      localPlayer: me,
    });
  }

  private updateHud(dt: number, me: PlayerSnapshot | null): void {
    this.hudUpdateAccumulator += dt;
    if (this.hudUpdateAccumulator < HUD_UPDATE_INTERVAL_SECONDS) return;
    this.hudUpdateAccumulator = 0;

    this.hudSystem.update({
      status: this.status,
      tick: this.snapshotSystem.snapshot.tick,
      player: me,
      latencyMs: this.network.latencyMs,
      buildingMode: this.buildingModeState.getSnapshot(),
    });
  }

  private handleCanvasPointerMove(event: PointerEvent): void {
    if (this.buildingEdit.isDragging()) return;
    const mode = this.buildingModeState.getSnapshot();
    if (!mode.enabled || mode.toolMode === 'remove' || !mode.selectedPartId) {
      if (!this.buildingEdit.hasDraft()) this.buildingGhostPreviewRenderer.hide();
      return;
    }

    if (this.buildingEdit.hasDraft()) return;

    const grid = this.pointerToBuildingGrid(event, mode.currentZ);
    const canPlace = this.buildingEdit.canPreviewPlacement(mode.selectedPartId, grid, mode.rotation);
    this.buildingGhostPreviewRenderer.show({ partId: mode.selectedPartId, x: grid.x, y: grid.y, z: grid.z, rotation: mode.rotation, canPlace });
  }

  private handleCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (this.buildingEditControls.contains(event.target)) return;

    const mode = this.buildingModeState.getSnapshot();
    const grid = this.pointerToBuildingGrid(event, mode.currentZ);
    const worldPoint = this.pointerToWorld(event);

    if (mode.enabled && mode.toolMode === 'remove') {
      const target = this.buildingOccupancy.findNearestAtWorld(worldPoint.x, worldPoint.y, mode.currentZ, mode.rotation)
        ?? this.buildingOccupancy.findTopAtCell(grid.x, grid.y, grid.z, mode.rotation);
      if (!target) return;
      this.network.send({ type: 'BUILD_REMOVE_REQUEST', requestId: crypto.randomUUID(), entityId: target.entityId });
      return;
    }

    if (this.buildingEdit.hasDraft()) {
      const draft = this.buildingEdit.moveTo(grid);
      if (draft) this.renderBuildingDraft(draft);
      return;
    }

    const target = this.buildingOccupancy.findTopAtCell(grid.x, grid.y, grid.z, mode.rotation);
    if (target) {
      this.beginExistingBuildingDraft(target);
      return;
    }

    if (!mode.enabled || !mode.selectedPartId) return;
    this.renderBuildingDraft(this.buildingEdit.beginNew(mode.selectedPartId, grid, mode.rotation));
  }

  private handleGlobalPointerMove(event: PointerEvent): void {
    const drag = this.buildingEdit.getDragState();
    if (!drag) return;

    const grid = this.pointerToBuildingGrid(event, drag.z);
    const draft = this.buildingEdit.moveDragged(grid);
    if (draft) this.renderBuildingDraft(draft);
  }

  private handleGlobalPointerUp(event: PointerEvent): void {
    this.buildingEdit.stopDrag(event.pointerId);
  }

  private handleBuildingHotkey(event: KeyboardEvent): void {
    const mode = this.buildingModeState.getSnapshot();
    const draft = this.buildingEdit.getDraft();
    if (!mode.enabled && !draft) return;

    if (event.key === 'Escape') {
      this.cancelBuildingDraft();
      this.buildingModeState.exit();
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter') {
      this.confirmBuildingDraft();
      event.preventDefault();
      return;
    }

    if (event.key === 'g' || event.key === 'G') {
      this.toggleBuildingGridVisible();
      event.preventDefault();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.cancelBuildingDraft();
      this.buildingModeState.enterRemoveMode();
      event.preventDefault();
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      this.rotateBuildingDraftOrMode();
      event.preventDefault();
      return;
    }

    if (event.key === 'PageUp') {
      this.setBuildingDraftOrModeLayer((draft?.z ?? mode.currentZ) + 1);
      event.preventDefault();
      return;
    }

    if (event.key === 'PageDown') {
      this.setBuildingDraftOrModeLayer(Math.max(0, (draft?.z ?? mode.currentZ) - 1));
      event.preventDefault();
    }
  }

  private handleBuildingEvent(event: BuildingServerEvent): void {
    switch (event.type) {
      case 'BUILD_SNAPSHOT':
        this.buildingOccupancy.applySnapshot(event.snapshot);
        this.buildingPlacementRenderer.applySnapshot(event.snapshot);
        return;
      case 'BUILD_PLACED':
        this.buildingOccupancy.addOrUpdate(event.part);
        this.buildingPlacementRenderer.addOrUpdate(event.part);
        this.clearBuildingDraftAfterServerAck(event.part);
        return;
      case 'BUILD_UPDATED':
        this.buildingOccupancy.addOrUpdate(event.part);
        this.buildingPlacementRenderer.addOrUpdate(event.part);
        this.clearBuildingDraftAfterServerAck(event.part);
        return;
      case 'BUILD_REMOVED':
        this.buildingOccupancy.remove(event.entityId);
        this.buildingPlacementRenderer.remove(event.entityId);
        if (this.buildingEdit.getDraft()?.entityId === event.entityId) this.cancelBuildingDraft();
        return;
      case 'BUILD_DOOR_UPDATED':
        this.buildingOccupancy.updateDoor(event.entityId, event.open);
        this.buildingPlacementRenderer.updateDoor(event.entityId, event.open);
        return;
      case 'BUILD_REJECTED':
        console.warn('[Building] request rejected:', event.reason);
        return;
      case 'INVENTORY_SNAPSHOT':
        this.applyInventoryItems(event.items);
        return;
    }
  }

  private handleCraftingEvent(event: CraftingServerEvent): void {
    if (event.type === 'CRAFT_REJECTED') {
      console.warn('[Crafting] request rejected:', event.reason);
      return;
    }

    this.applyInventoryItems(event.inventory.items);
  }

  private applyInventoryItems(items: NonNullable<PlayerSnapshot['inventoryItems']>): void {
    const me = this.findMe();
    if (!me) return;

    const next: PlayerSnapshot = {
      ...me,
      inventory: {
        wood: items.find((item) => item.itemId === 'wood')?.quantity ?? 0,
        stone: items.find((item) => item.itemId === 'stone')?.quantity ?? 0,
      },
      inventoryItems: items.map((item) => ({ ...item })),
    };

    this.snapshotSystem.setLocalPlayer(next);
    this.hudSystem.update({
      status: this.status,
      tick: this.snapshotSystem.snapshot.tick,
      player: next,
      latencyMs: this.network.latencyMs,
      buildingMode: this.buildingModeState.getSnapshot(),
    });
  }

  private beginNewBuildingDraft(partId: BuildPartId): void {
    const me = this.findMe();
    const mode = this.buildingModeState.getSnapshot();
    const center = me ? screenToGridApprox(me.x, me.y, mode.currentZ) : { x: 0, y: 0, z: mode.currentZ };
    this.setBuildingGridVisible(true);
    this.renderBuildingDraft(this.buildingEdit.beginNew(partId, center, mode.rotation));
  }

  private beginExistingBuildingDraft(part: PlacedBuildPart): void {
    this.setBuildingGridVisible(true);
    this.buildingModeState.enter(part.partId);
    this.buildingModeState.setCurrentZ(part.z);
    this.buildingModeState.setRotation(part.rotation);
    this.renderBuildingDraft(this.buildingEdit.beginExisting(part));
  }

  private renderBuildingDraft(draft: BuildingEditDraft): void {
    this.buildingModeState.setCurrentZ(draft.z);
    this.buildingModeState.setRotation(draft.rotation);
    const canPlace = this.buildingEdit.validate(draft).ok;
    this.buildingGhostPreviewRenderer.show({ partId: draft.partId, x: draft.x, y: draft.y, z: draft.z, rotation: draft.rotation, canPlace });
    this.buildingEditControls.setValid(canPlace);
    this.syncBuildingControlsPosition();
  }

  private rotateBuildingDraftOrMode(): void {
    const draft = this.buildingEdit.rotate();
    if (draft) {
      this.renderBuildingDraft(draft);
      return;
    }
    this.buildingModeState.rotateNext();
  }

  private setBuildingDraftOrModeLayer(z: number): void {
    const draft = this.buildingEdit.setLayer(z);
    if (draft) {
      this.renderBuildingDraft(draft);
      return;
    }
    this.buildingModeState.setCurrentZ(Math.max(0, Math.floor(z)));
  }

  private confirmBuildingDraft(): void {
    const command = this.buildingEdit.createConfirmCommand();
    if (!command) return;
    this.network.send(command);
  }

  private cancelBuildingDraft(): void {
    this.buildingEdit.clear();
    this.buildingGhostPreviewRenderer.hide();
    this.buildingEditControls.hide();
  }

  private clearBuildingDraftAfterServerAck(placedPart?: PlacedBuildPart): void {
    const mode = this.buildingModeState.getSnapshot();
    const nextPartId = placedPart?.partId ?? mode.selectedPartId;
    const nextRotation = placedPart?.rotation ?? mode.rotation;
    const nextZ = placedPart?.z ?? mode.currentZ;

    this.buildingEdit.clear();
    this.buildingGhostPreviewRenderer.hide();
    this.buildingEditControls.hide();

    if (!nextPartId || !mode.enabled || mode.toolMode !== 'place') return;

    this.buildingModeState.enter(nextPartId);
    this.buildingModeState.setRotation(nextRotation);
    this.buildingModeState.setCurrentZ(nextZ);
  }

  private syncBuildingControlsPosition(): void {
    const draft = this.buildingEdit.getDraft();
    if (!draft || this.editorMode) {
      this.buildingEditControls.hide();
      return;
    }

    const screen = gridToScreen(draft.x, draft.y, draft.z);
    const global = this.world.toGlobal({ x: screen.x, y: screen.y });
    this.buildingEditControls.showAt(global.x - 74, global.y + 38);
  }

  private installBuildingEditControls(): void {
    this.buildingEditControls.bind({
      onMoveStart: (event) => {
        const draft = this.buildingEdit.getDraft();
        if (!draft) return;
        this.buildingEdit.startDrag({
          pointerId: event.pointerId,
          startGrid: this.pointerToBuildingGrid(event, draft.z),
        });
        this.buildingEditControls.move.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      onToggleGrid: () => this.toggleBuildingGridVisible(),
      onRotate: () => this.rotateBuildingDraftOrMode(),
      onConfirm: () => this.confirmBuildingDraft(),
      onCancel: () => this.cancelBuildingDraft(),
    });
  }

  private toggleBuildingGridVisible(): void {
    this.setBuildingGridVisible(!this.buildingGridVisible);
  }

  private setBuildingGridVisible(visible: boolean): void {
    this.buildingGridVisible = visible;
    this.buildingGridOverlay.container.visible = visible;
    this.buildingEditControls.setGridVisible(visible);
  }

  private pointerToBuildingGrid(event: PointerEvent, z: number): { x: number; y: number; z: number } {
    const local = this.pointerToWorld(event);
    return screenToGridApprox(local.x, local.y, z);
  }

  private pointerToWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return this.world.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  private handleGatherInput(me: PlayerSnapshot | null): void {
    if (!this.input.consumeGather()) return;
    if (!me) return;
    const target = this.resourceRenderer.getClosestAlive(this.getCurrentCellResources(), me.x, me.y, this.gameplayConfig.gatherRange);
    this.inputSendSystem.sendGather(target?.id);
  }

  private getCurrentCellResources(): ResourceSnapshot[] {
    const active = getActiveCell();
    return this.snapshotSystem.snapshot.resources.filter((resource) => resource.cellX === active.gridX && resource.cellY === active.gridY);
  }

  private async loadWorldMap(): Promise<void> {
    const result = await this.runtimeWorldSystem.load();
    this.worldInfo = result.worldInfo;
  }

  private findMe(): PlayerSnapshot | null {
    return this.snapshotSystem.findMe(this.myPlayerId);
  }
}

function getRenderResolution(): number {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const isTouchDevice = navigator.maxTouchPoints > 0;
  const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) <= 900;
  const isMobileLike = isTouchDevice || isSmallScreen;

  return isMobileLike
    ? 1
    : Math.min(devicePixelRatio, 1.5);
}

function isEditorEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('editor') === '1';
}
