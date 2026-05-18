import { Application, Container, Graphics } from 'pixi.js';
import { GameNetwork, getDefaultWebSocketUrl, type NetworkStatus } from '../net/network';
import type {
  MonsterSnapshot,
  MovementKeys,
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
import { ProceduralMeadowRenderer } from '../render/ProceduralMeadowRenderer';
import { getMonsterConfig } from '../assets/monsters';

const INPUT_SEND_HZ = 30;
const DEFAULT_WORLD: WorldInfo = { width: 3000, height: 3000, tickRate: 20 };
const DEFAULT_GAMEPLAY: PublicGameplayConfig = { playerRadius: 18, playerSpeed: 220, gatherRange: 80 };

type MoveDelta = { x: number; y: number };
type CollisionCircle = { x: number; y: number; radius: number };

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
  private meadowRenderer: ProceduralMeadowRenderer | null = null;

  private worldInfo: WorldInfo = DEFAULT_WORLD;
  private gameplayConfig: PublicGameplayConfig = DEFAULT_GAMEPLAY;
  private myPlayerId: string | null = null;
  private localPlayer: PlayerSnapshot | null = null;
  private status: NetworkStatus = 'idle';
  private latestTick = 0;
  private latestPlayers: PlayerSnapshot[] = [];
  private latestResources: ResourceSnapshot[] = [];
  private latestMonsters: MonsterSnapshot[] = [];
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

  private applyLocalMovement(dt: number): void {
    const me = this.findMe();
    if (!me) return;

    this.localPlayer = me;

    const direction = getMoveDirection(this.input.state.keys);

    if (direction) {
      const radius = this.gameplayConfig.playerRadius;
      const speed = this.gameplayConfig.playerSpeed;
      let delta: MoveDelta = {
        x: direction.x * speed * dt,
        y: direction.y * speed * dt,
      };

      delta = this.resolveMonsterSlideDelta(me.x, me.y, delta, radius);

      const nextX = clamp(me.x + delta.x, radius, this.worldInfo.width - radius);
      const nextY = clamp(me.y + delta.y, radius, this.worldInfo.height - radius);

      if (this.canPlayerMoveFromTo(me.x, me.y, nextX, nextY, radius)) {
        me.x = nextX;
        me.y = nextY;
      } else {
        const axisX = clamp(me.x + delta.x, radius, this.worldInfo.width - radius);
        if (this.canPlayerMoveFromTo(me.x, me.y, axisX, me.y, radius)) me.x = axisX;

        const axisY = clamp(me.y + delta.y, radius, this.worldInfo.height - radius);
        if (this.canPlayerMoveFromTo(me.x, me.y, me.x, axisY, radius)) me.y = axisY;
      }

      me.facing = this.input.state.facing;
    }

    this.playerRenderer.sync(this.latestPlayers, this.myPlayerId);
  }

  private resolveMonsterSlideDelta(
    currentX: number,
    currentY: number,
    delta: MoveDelta,
    playerRadius: number,
  ): MoveDelta {
    let resolved = delta;

    for (const monster of this.latestMonsters) {
      const circle = getMonsterCollisionCircle(monster);
      const minDistance = playerRadius + circle.radius;
      const nextX = currentX + resolved.x;
      const nextY = currentY + resolved.y;
      const nextDistanceSq = squaredDistance(nextX, nextY, circle.x, circle.y);

      if (nextDistanceSq >= minDistance * minDistance) continue;

      const normalX = currentX - circle.x;
      const normalY = currentY - circle.y;
      const normalLength = Math.hypot(normalX, normalY);

      if (normalLength <= 0.0001) continue;

      const nx = normalX / normalLength;
      const ny = normalY / normalLength;
      const intoObstacle = resolved.x * -nx + resolved.y * -ny;

      if (intoObstacle <= 0) continue;

      resolved = {
        x: resolved.x + nx * intoObstacle,
        y: resolved.y + ny * intoObstacle,
      };
    }

    return resolved;
  }

  private canPlayerMoveFromTo(
    currentX: number,
    currentY: number,
    nextX: number,
    nextY: number,
    playerRadius: number,
  ): boolean {
    for (const monster of this.latestMonsters) {
      const circle = getMonsterCollisionCircle(monster);
      const minDistance = playerRadius + circle.radius;
      const minDistanceSq = minDistance * minDistance;
      const currentDistanceSq = squaredDistance(currentX, currentY, circle.x, circle.y);
      const nextDistanceSq = squaredDistance(nextX, nextY, circle.x, circle.y);

      if (nextDistanceSq >= minDistanceSq) continue;

      // 이미 충돌체 안에 들어간 상태에서는 완전히 빠져나오기 전이라도
      // 몬스터와의 거리가 증가하는 이동은 허용해야 조작 불능이 생기지 않는다.
      if (currentDistanceSq < minDistanceSq && nextDistanceSq > currentDistanceSq) continue;

      return false;
    }

    return true;
  }

  private sendInputIfDue(dt: number): void {
    this.inputAccumulator += dt;

    if (this.inputAccumulator < 1 / INPUT_SEND_HZ) {
      return;
    }

    this.inputAccumulator = 0;

    const me = this.findMe();

    this.network.send({
      type: 'input',
      seq: ++this.inputSeq,
      keys: { ...this.input.state.keys },
      facing: this.input.state.facing,
      clientX: me?.x,
      clientY: me?.y,
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
        void this.loadWorldMap();
        return;

      case 'snapshot': {
        this.latestTick = message.tick;
        this.latestPlayers = this.mergeServerPlayers(message.players);
        this.latestResources = message.resources;
        this.latestMonsters = message.monsters;
        this.playerRenderer.sync(this.latestPlayers, this.myPlayerId);
        this.resourceRenderer.sync(message.resources);
        this.monsterRenderer.sync(message.monsters);
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

  private mergeServerPlayers(players: PlayerSnapshot[]): PlayerSnapshot[] {
    if (!this.myPlayerId || !this.localPlayer) {
      const serverMe = this.myPlayerId ? players.find((player) => player.id === this.myPlayerId) : null;
      this.localPlayer = serverMe ? { ...serverMe } : null;
      return players.map((player) => (player.id === this.myPlayerId && this.localPlayer ? this.localPlayer : player));
    }

    return players.map((player) => {
      if (player.id !== this.myPlayerId) return player;

      this.localPlayer = {
        ...player,
        x: this.localPlayer?.x ?? player.x,
        y: this.localPlayer?.y ?? player.y,
        facing: this.input.state.facing,
      };

      return this.localPlayer;
    });
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

function getMoveDirection(keys: MovementKeys): { x: number; y: number } | null {
  let x = 0;
  let y = 0;

  if (keys.left) x -= 1;
  if (keys.right) x += 1;
  if (keys.up) y -= 1;
  if (keys.down) y += 1;

  if (x === 0 && y === 0) return null;

  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function getMonsterCollisionCircle(monster: MonsterSnapshot): CollisionCircle {
  const collision = getMonsterConfig(monster.type).collision;
  return {
    x: monster.x + collision.offsetX,
    y: monster.y + collision.offsetY,
    radius: collision.radius,
  };
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
