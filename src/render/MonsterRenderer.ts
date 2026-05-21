import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Facing, MonsterSnapshot, MonsterStateName, MonsterType } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';
import {
  getMonsterConfig,
  MONSTER_CONFIGS,
  type MonsterRenderConfig,
  type MonsterSpriteSheetConfig,
} from '../assets/monsters';
import { getWorldEntityZIndex } from '../systems/building/IsoBuildingMath';

const MONSTER_DEPTH_OFFSET = 130;
const MONSTER_LAYER_Z_INDEX = 110;
const MONSTER_NORMAL_ALPHA = 1;
const MONSTER_OCCLUDED_ALPHA = 0.42;
const MONSTER_Z_INDEX_BUCKET_SIZE = 4;

type MonsterView = {
  container: Container;
  body: Graphics;
  sprite: Sprite | null;
  type: MonsterSnapshot['type'];
  state: MonsterSnapshot['state'];
  facing: Facing;
  interp: Interpolator2D;
  previousX: number;
  previousY: number;
  animTime: number;
  frame: number;
  animationKey: string;
  attackPlaying: boolean;
  attackFacing: Facing;
  attackCooldownMs: number;
  lastAttackSeq: number;
  lastZIndex: number;
};

type DirectionalFrames = Record<Facing, Texture[]>;

type ActionFrames = {
  idle: Texture[];
  walk: DirectionalFrames;
  attack?: DirectionalFrames;
};

type SpriteFrameGrid = {
  frameWidth: number;
  frameHeight: number;
};

type LoadedSpriteSheet = {
  config: MonsterSpriteSheetConfig;
  frameGrid: SpriteFrameGrid;
  frames: DirectionalFrames;
  actionFrames?: ActionFrames;
};

type SpriteMonsterConfig = MonsterRenderConfig & {
  spriteSheet: MonsterSpriteSheetConfig;
};

export class MonsterRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, MonsterView>();
  private readonly spriteSheets = new Map<MonsterType, LoadedSpriteSheet>();
  private readonly failedSpriteSheets = new Set<MonsterType>();

  constructor(parent: Container) {
    this.layer.sortableChildren = true;
    this.layer.zIndex = MONSTER_LAYER_Z_INDEX;
    parent.addChild(this.layer);
    void this.loadConfiguredSpriteSheets();
  }

  sync(monsters: MonsterSnapshot[]): void {
    const seen = new Set<string>();

    for (const monster of monsters) {
      seen.add(monster.id);
      let view = this.views.get(monster.id);
      if (!view) {
        view = this.createView(monster);
        this.views.set(monster.id, view);
      }

      view.interp.setTarget(monster.x, monster.y);
      view.attackCooldownMs = resolveAttackCooldownMs(monster);

      const serverFacing = resolveFacing(monster.facing, view.facing);
      if (!view.attackPlaying && serverFacing !== view.facing) {
        view.facing = serverFacing;
        view.frame = -1;
        view.animationKey = '';
      }

      const attackSeq = resolveAttackSeq(monster);
      if (attackSeq > view.lastAttackSeq) {
        view.lastAttackSeq = attackSeq;
        view.facing = serverFacing;
        this.startAttackAnimation(view);
      }

      if (view.state !== monster.state) {
        view.state = monster.state;
        if (!view.attackPlaying) {
          view.frame = -1;
          view.animationKey = '';
        }
        this.drawFallback(view);
      }

      if (view.type !== monster.type) {
        view.type = monster.type;
        view.attackCooldownMs = resolveAttackCooldownMs(monster);
        view.lastAttackSeq = attackSeq;
        view.facing = serverFacing;
        view.frame = -1;
        view.animationKey = '';
        view.attackPlaying = false;
        this.applyMonsterVisual(view);
      }
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.layer.removeChild(view.container);
        view.container.destroy({ children: true });
        this.views.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (const view of this.views.values()) {
      const pos = view.interp.update(dt);
      view.container.position.set(Math.round(pos.x), Math.round(pos.y));
      const zIndex = getQuantizedMonsterZIndex(pos.y);
      if (zIndex !== view.lastZIndex) {
        view.lastZIndex = zIndex;
        view.container.zIndex = zIndex;
      }

      const dx = pos.x - view.previousX;
      const dy = pos.y - view.previousY;
      view.previousX = pos.x;
      view.previousY = pos.y;

      const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      this.updateSpriteAnimation(view, dt, moving);
    }
  }

  applyOcclusion(isOccluded: (x: number, y: number) => boolean): void {
    for (const view of this.views.values()) {
      view.container.alpha = isOccluded(view.container.x, view.container.y)
        ? MONSTER_OCCLUDED_ALPHA
        : MONSTER_NORMAL_ALPHA;
    }
  }

  private async loadConfiguredSpriteSheets(): Promise<void> {
    const entries = Object.values(MONSTER_CONFIGS).filter(hasSpriteSheet);

    await Promise.all(
      entries.map(async (config) => {
        const sheetConfig = config.spriteSheet;

        try {
          const loaded = await loadMonsterSpriteSheet(sheetConfig);
          this.spriteSheets.set(config.type, loaded);
        } catch (error) {
          this.failedSpriteSheets.add(config.type);
          console.warn(`Failed to load ${config.type} monster sprite. Using fallback shape.`, error);
        }
      }),
    );

    for (const view of this.views.values()) {
      this.applyMonsterVisual(view);
    }
  }

  private createView(monster: MonsterSnapshot): MonsterView {
    const container = new Container();
    const body = new Graphics();
    const attackCooldownMs = resolveAttackCooldownMs(monster);
    const attackSeq = resolveAttackSeq(monster);
    const facing = resolveFacing(monster.facing, 'down');
    const zIndex = getQuantizedMonsterZIndex(monster.y);
    container.position.set(monster.x, monster.y);
    container.zIndex = zIndex;

    const view: MonsterView = {
      container,
      body,
      sprite: null,
      type: monster.type,
      state: monster.state,
      facing,
      interp: new Interpolator2D(monster.x, monster.y, 10),
      previousX: monster.x,
      previousY: monster.y,
      animTime: Math.random(),
      frame: -1,
      animationKey: '',
      attackPlaying: false,
      attackFacing: facing,
      attackCooldownMs,
      lastAttackSeq: attackSeq,
      lastZIndex: zIndex,
    };

    container.addChild(body);
    this.layer.addChild(container);
    this.applyMonsterVisual(view);
    return view;
  }

  private startAttackAnimation(view: MonsterView): void {
    view.attackPlaying = true;
    view.attackFacing = view.facing;
    view.frame = -1;
    view.animationKey = '';
    view.animTime = 0;
  }

  private stopAttackAnimation(view: MonsterView): void {
    view.attackPlaying = false;
    view.frame = -1;
    view.animationKey = '';
    view.animTime = 0;
  }

  private applyMonsterVisual(view: MonsterView): void {
    const loaded = this.spriteSheets.get(view.type);

    if (loaded) {
      if (!view.sprite) {
        view.sprite = new Sprite(getInitialTexture(loaded));
        view.container.addChild(view.sprite);
      }

      view.sprite.anchor.set(loaded.config.anchor.x, loaded.config.anchor.y);
      view.sprite.scale.set(loaded.config.scale);
      view.sprite.visible = true;
      view.body.visible = false;
      view.frame = -1;
      view.animationKey = '';
      this.updateSpriteAnimation(view, 0, false);
      return;
    }

    if (view.sprite) {
      view.sprite.visible = false;
    }
    view.body.visible = true;
    this.drawFallback(view);
  }

  private updateSpriteAnimation(view: MonsterView, dt: number, moving: boolean): void {
    const loaded = this.spriteSheets.get(view.type);
    if (!loaded || !view.sprite) return;

    const animationFacing = view.attackPlaying ? view.attackFacing : view.facing;
    const selection = selectAnimationFrames(loaded, view.state, animationFacing, moving, view.attackPlaying);
    const nextAnimationKey = selection.key;

    if (nextAnimationKey !== view.animationKey) {
      view.animationKey = nextAnimationKey;
      view.frame = -1;
      view.animTime = 0;
    }

    if (selection.animate) {
      view.animTime += dt;
    }

    const frame = getAnimationFrame(view, loaded, selection.once);

    if (selection.once && view.animTime >= getAnimationDurationSeconds(loaded)) {
      this.stopAttackAnimation(view);
      this.updateSpriteAnimation(view, 0, moving);
      return;
    }

    if (frame !== view.frame) {
      view.frame = frame;
      view.sprite.texture = selection.frames[frame] ?? selection.frames[0];
    }
  }

  private drawFallback(view: MonsterView): void {
    const config = getMonsterConfig(view.type);
    view.body.clear();

    if (view.type === 'sheep') {
      drawSheepFallback(view.body, view.state === 'chase' || view.attackPlaying);
      return;
    }

    view.body
      .circle(0, 0, config.fallback.radius)
      .fill({ color: view.state === 'chase' || view.attackPlaying ? config.fallback.chaseColor : config.fallback.idleColor });
  }
}

function hasSpriteSheet(config: MonsterRenderConfig): config is SpriteMonsterConfig {
  return config.spriteSheet !== undefined;
}

async function loadMonsterSpriteSheet(config: MonsterSpriteSheetConfig): Promise<LoadedSpriteSheet> {
  const image = await loadImage(config.src);
  const sheet = Texture.from(image);
  sheet.source.scaleMode = 'nearest';
  const frameGrid = resolveFrameGrid(image, config);

  const directionalFrames = {
    down: makeRowTextures(sheet, config.rows.down, config, frameGrid),
    up: makeRowTextures(sheet, config.rows.up, config, frameGrid),
    left: makeRowTextures(sheet, config.rows.left, config, frameGrid),
    right: makeRowTextures(sheet, config.rows.right, config, frameGrid),
  };

  if (!config.actionRows) {
    return { config, frameGrid, frames: directionalFrames };
  }

  const actionFrames: ActionFrames = {
    idle: makeRowTextures(sheet, config.actionRows.idle, config, frameGrid),
    walk: {
      down: makeRowTextures(sheet, config.actionRows.walk.down, config, frameGrid),
      up: makeRowTextures(sheet, config.actionRows.walk.up, config, frameGrid),
      left: makeRowTextures(sheet, config.actionRows.walk.left, config, frameGrid),
      right: makeRowTextures(sheet, config.actionRows.walk.right, config, frameGrid),
    },
    attack: config.actionRows.attack
      ? {
          down: makeRowTextures(sheet, config.actionRows.attack.down, config, frameGrid),
          up: makeRowTextures(sheet, config.actionRows.attack.up, config, frameGrid),
          left: makeRowTextures(sheet, config.actionRows.attack.left, config, frameGrid),
          right: makeRowTextures(sheet, config.actionRows.attack.right, config, frameGrid),
        }
      : undefined,
  };

  return { config, frameGrid, frames: directionalFrames, actionFrames };
}

function resolveFrameGrid(image: HTMLImageElement, config: MonsterSpriteSheetConfig): SpriteFrameGrid {
  const frameWidth = config.frameWidth ?? Math.floor(image.naturalWidth / (config.columns ?? config.frameCount));
  const frameHeight = config.frameHeight ?? Math.floor(image.naturalHeight / (config.rowsCount ?? 1));

  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new Error(`Invalid monster sprite frame size: ${image.naturalWidth}x${image.naturalHeight}`);
  }

  return { frameWidth, frameHeight };
}

function makeRowTextures(
  sheet: Texture,
  row: number,
  config: MonsterSpriteSheetConfig,
  frameGrid: SpriteFrameGrid,
): Texture[] {
  return Array.from({ length: config.frameCount }, (_, index) => {
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(
        index * frameGrid.frameWidth,
        row * frameGrid.frameHeight,
        frameGrid.frameWidth,
        frameGrid.frameHeight,
      ),
    });
  });
}

function getInitialTexture(loaded: LoadedSpriteSheet): Texture {
  return loaded.actionFrames?.idle[0] ?? loaded.frames.down[0];
}

function getAnimationDurationSeconds(loaded: LoadedSpriteSheet): number {
  return loaded.config.frameCount / loaded.config.fps;
}

function getAnimationFrame(view: MonsterView, loaded: LoadedSpriteSheet, once: boolean): number {
  const frame = Math.floor(view.animTime * loaded.config.fps);
  if (once) return Math.min(loaded.config.frameCount - 1, frame);
  return frame % loaded.config.frameCount;
}

function selectAnimationFrames(
  loaded: LoadedSpriteSheet,
  state: MonsterStateName,
  facing: Facing,
  moving: boolean,
  attackActive: boolean,
): { key: string; frames: Texture[]; animate: boolean; once: boolean } {
  if (loaded.actionFrames) {
    if (attackActive && loaded.actionFrames.attack) {
      return { key: `attack:${facing}`, frames: loaded.actionFrames.attack[facing], animate: true, once: true };
    }

    if (moving || state === 'chase') {
      return { key: `walk:${facing}`, frames: loaded.actionFrames.walk[facing], animate: true, once: false };
    }

    return { key: 'idle', frames: loaded.actionFrames.idle, animate: true, once: false };
  }

  if (moving || state === 'chase') {
    return { key: `walk:${facing}`, frames: loaded.frames[facing], animate: true, once: false };
  }

  return { key: `idle:${facing}`, frames: loaded.frames[facing], animate: false, once: false };
}

function drawSheepFallback(body: Graphics, chasing: boolean): void {
  const wool = chasing ? 0xfff2c7 : 0xf6f1df;
  const outline = 0x5b5146;
  const face = 0x8b6f54;

  body
    .ellipse(0, -18, 23, 15)
    .fill({ color: 0x000000, alpha: 0.18 });

  body
    .circle(-14, -34, 11)
    .fill({ color: wool })
    .circle(0, -38, 15)
    .fill({ color: wool })
    .circle(14, -34, 11)
    .fill({ color: wool })
    .circle(-4, -28, 14)
    .fill({ color: wool })
    .circle(10, -27, 12)
    .fill({ color: wool });

  body
    .ellipse(18, -32, 9, 11)
    .fill({ color: face })
    .circle(21, -35, 2)
    .fill({ color: 0x111111 });

  body
    .roundRect(-14, -19, 5, 13, 2)
    .fill({ color: outline })
    .roundRect(7, -19, 5, 13, 2)
    .fill({ color: outline });
}

function getQuantizedMonsterZIndex(y: number): number {
  const bucketY = Math.round(y / MONSTER_Z_INDEX_BUCKET_SIZE) * MONSTER_Z_INDEX_BUCKET_SIZE;
  return getWorldEntityZIndex(bucketY, MONSTER_DEPTH_OFFSET);
}

function resolveAttackCooldownMs(monster: MonsterSnapshot): number {
  const serverCooldown = monster.attackCooldownMs;
  if (Number.isFinite(serverCooldown) && (serverCooldown as number) > 0) return serverCooldown as number;
  return getMonsterConfig(monster.type).timing.attackCooldownMs;
}

function resolveAttackSeq(monster: MonsterSnapshot): number {
  const attackSeq = monster.attackSeq;
  return Number.isFinite(attackSeq) && (attackSeq as number) >= 0 ? attackSeq as number : 0;
}

function resolveFacing(value: Facing | undefined, fallback: Facing): Facing {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right' ? value : fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load monster sprite: ${src}`));
    image.src = src;
  });
}
