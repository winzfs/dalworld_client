import { Application, Container, Graphics } from 'pixi.js';
import { GameNetwork, getDefaultWebSocketUrl, type NetworkStatus } from '../net/network';
import type {
  PlayerSnapshot,
  PublicGameplayConfig,
  ResourceSnapshot,
  ServerToClientMessage,
  WorldInfo,
} from '../protocol/messages';
import { InputController } from './InputController';
import { Camera } from './Camera';
import { PlayerRenderer } from '../render/PlayerRenderer';
import { ResourceRenderer } from '../render/ResourceRenderer';
import { MonsterRenderer } from '../render/MonsterRenderer';
import { DebugHud } from '../render/DebugHud';
import { MobileControls } from '../render/MobileControls';

const INPUT_SEND_HZ = 20;
const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const DEFAULT_GAMEPLAY: PublicGameplayConfig = { playerRadius: 18, gatherRange: 80 };

export class GameApp {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly input = new InputController();
  private readonly network: GameNetwork;
  private readonly hud = new DebugHud();
  private readonly camera: Camera;
  private readonly playerRenderer: PlayerRenderer;
  private readonly resourceRenderer: ResourceRenderer;
  private readonly monsterRenderer: MonsterRenderer;

  private worldInfo: WorldInfo = DEFAULT_WORLD;
  private gameplayConfig: PublicGameplayConfig = DEFAULT_GAMEPLAY;
  private myPlayerId: string | null = null;
  private status: NetworkStatus = 'idle';
  private latestTick = 0;
  private latestPlayers: PlayerSnapshot[] = [];
  private latestResources: ResourceSnapshot[] = [];
  private inputSeq = 0;
  private inputAccumulator = 0;
  private mobileControls: MobileControls | null = null;

  constructor() {
    this.network = new GameNetwork(getDefaultWebSocketUrl());
    this.camera = new Camera(this.world);
    this.world.addChild(this.background);
    this.resourceRenderer = new ResourceRenderer(this.world);
    this.monsterRenderer = new MonsterRenderer(this.world);
    this.playerRenderer = new PlayerRenderer(this.world);
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

    this.network.onStatus((status) => {
      this.status = status;
    });
    this.network.onMessage((message) => this.handleServerMessage(message));
    this.network.connect();

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
  }

  private update(dt: number): void {
    this.sendInputIfDue(dt);
    this.handleGatherInput();
    this.playerRenderer.update(dt);
    this.monsterRenderer.update(dt);

    const me = this.findMe();
    if (me) {
      this.camera.follow(me.x, me.y, this.app.renderer.width, this.app.renderer.height);
    } else {
      this.camera.follow(
        this.worldInfo.width / 2,
        this.worldInfo.height / 2,
        this.app.renderer.width,
        this.app.renderer.height,
      );
    }

    const nearbyGather = me
      ? this.resourceRenderer.getClosestAlive(
          this.latestResources,
          me.x,
          me.y,
          this.gameplayConfig.gatherRange,
        )
      : null;

    this.hud.render({
      status: this.status,
      tick: this.latestTick,
      player: me,
      nearbyGather,
      latencyMs: this.network.latencyMs,
    });
  }

  private sendInputIfDue(dt: number): void {
    this.inputAccumulator += dt;
    if (this.inputAccumulator < 1 / INPUT_SEND_HZ) return;
    this.inputAccumulator = 0;

    this.network.send({
      type: 'input',
      seq: ++this.inputSeq,
      keys: { ...this.input.state.keys },
      facing: this.input.state.facing,
    });
  }

  private handleGatherInput(): void {
    if (!this.input.consumeGather()) return;
    const me = this.findMe();
    if (!me) return;
    const target = this.resourceRenderer.getClosestAlive(
      this.latestResources,
      me.x,
      me.y,
      this.gameplayConfig.gatherRange,
    );
    this.network.send({
      type: 'gather',
      seq: ++this.inputSeq,
      resourceId: target?.id,
    });
  }

  private handleServerMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case 'welcome':
        this.myPlayerId = message.playerId;
        this.worldInfo = message.world;
        this.gameplayConfig = message.gameplay ?? DEFAULT_GAMEPLAY;
        this.camera.setWorldSize(message.world.width, message.world.height);
        this.drawWorldBackground();
        return;
      case 'snapshot':
        this.latestTick = message.tick;
        this.latestPlayers = message.players;
        this.latestResources = message.resources;
        this.playerRenderer.sync(message.players, this.myPlayerId);
        this.resourceRenderer.sync(message.resources);
        this.monsterRenderer.sync(message.monsters);
        return;
      case 'event':
        // TODO: toast / sound feedback per event type
        return;
      case 'pong':
        return;
    }
  }

  private findMe(): PlayerSnapshot | null {
    if (!this.myPlayerId) return null;
    for (const player of this.latestPlayers) {
      if (player.id === this.myPlayerId) return player;
    }
    return null;
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
