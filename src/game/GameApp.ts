import { Application, Container, Graphics } from 'pixi.js';
import { GameNetwork, getDefaultWebSocketUrl, type NetworkStatus } from '../net/network';
import type {
  PlayerSnapshot,
  PublicGameplayConfig,
  ServerToClientMessage,
  WorldInfo,
} from '../protocol/messages';
import { InputController } from './InputController';
import { Camera } from './Camera';
import { PlayerRenderer } from '../render/PlayerRenderer';
import { ResourceRenderer } from '../render/ResourceRenderer';
import { MonsterRenderer } from '../render/MonsterRenderer';
import { MobileControls } from '../render/MobileControls';
import { ProceduralMeadowRenderer } from '../render/ProceduralMeadowRenderer';
import { GameHud } from '../ui/GameHud';
import { GameWindows } from '../ui/GameWindows';
import { ClientMovementSystem } from './systems/ClientMovementSystem';
import { InputSendSystem } from './systems/InputSendSystem';
import { SnapshotSystem } from './systems/SnapshotSystem';
import { CameraSystem } from './systems/CameraSystem';

const INPUT_SEND_HZ = 30;
const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const DEFAULT_GAMEPLAY: PublicGameplayConfig = { playerRadius: 18, playerSpeed: 220, gatherRange: 80 };

export class GameApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly network: GameNetwork;
  private readonly hud = new GameHud();
  private readonly windows = new GameWindows();
  private readonly cameraSystem: CameraSystem;
  private readonly playerRenderer: PlayerRenderer;
  private readonly resourceRenderer: ResourceRenderer;
  private readonly monsterRenderer: MonsterRenderer;
  private readonly movementSystem = new ClientMovementSystem();
  private readonly inputSendSystem: InputSendSystem;
  private readonly snapshotSystem = new SnapshotSystem();
  private meadowRenderer: ProceduralMeadowRenderer | null = null;

  private worldInfo: WorldInfo = DEFAULT_WORLD;
  private gameplayConfig: PublicGameplayConfig = DEFAULT_GAMEPLAY;
  private myPlayerId: string | null = null;
  private status: NetworkStatus = 'idle';
  private mobileControls: MobileControls | null = null;

  constructor() {
    this.network = new GameNetwork(getDefaultWebSocketUrl());
    this.inputSendSystem = new InputSendSystem(this.network, INPUT_SEND_HZ);
    this.cameraSystem = new CameraSystem(new Camera(this.world));
    this.world.addChild(this.background);
    this.resourceRenderer = new ResourceRenderer(this.world);
    this.monsterRenderer = new MonsterRenderer(this.world);
    this.playerRenderer = new PlayerRenderer(this.world);
    void this.windows;
  }

  async start(mount: HTMLElement): Promise<void> {
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

    this.network.onStatus((status) => {
      this.status = status;
    });

    this.network.onMessage((message) => this.handleServerMessage(message));
    this.network.connect();

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
  }

  private update(dt: number): void {
    this.applyLocalMovement(dt);

    this.inputSendSystem.update(
      {
        input: this.input.state,
        player: this.findMe(),
      },
      dt,
    );

    this.handleGatherInput();
    this.playerRenderer.update(dt);
    this.monsterRenderer.update(dt);

    const me = this.findMe();

    this.cameraSystem.update({
      player: me,
      world: this.worldInfo,
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
    });

    this.hud.render({
      status: this.status,
      tick: this.snapshotSystem.snapshot.tick,
      player: me,
      latencyMs: this.network.latencyMs,
    });

    this.windows.renderInventory(me?.inventory ?? null);
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
      this.snapshotSystem.snapshot.resources,
      me.x,
      me.y,
      this.gameplayConfig.gatherRange,
    );

    this.inputSendSystem.sendGather(target?.id);
  }

  private handleServerMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case 'welcome':
        this.myPlayerId = message.playerId;
        this.worldInfo = message.world;
        this.gameplayConfig = message.gameplay ?? DEFAULT_GAMEPLAY;
        this.cameraSystem.setWorldSize(message.world);
        this.drawWorldBackground();
        void this.loadWorldMap();
        return;

      case 'snapshot': {
        const snapshot = this.snapshotSystem.apply({
          myPlayerId: this.myPlayerId,
          input: this.input.state,
          players: message.players,
          resources: message.resources,
          monsters: message.monsters,
          tick: message.tick,
        });

        this.playerRenderer.sync(snapshot.players, this.myPlayerId);
        this.resourceRenderer.sync(snapshot.resources);
        this.monsterRenderer.sync(snapshot.monsters);
        return;
      }

      case 'event':
        return;

      case 'pong':
        return;
    }
  }

  private async loadWorldMap(): Promise<void> {
    if (this.meadowRenderer) {
      this.world.removeChild(this.meadowRenderer.layer);
      this.meadowRenderer.layer.destroy({ children: true });
    }

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
