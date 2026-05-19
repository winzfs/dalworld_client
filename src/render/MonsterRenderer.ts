import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Facing, MonsterSnapshot, MonsterType } from '../protocol/messages';
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
};

type DirectionalFrames = Record<Facing, Texture[]>;

type LoadedSpriteSheet = {
  config: MonsterSpriteSheetConfig;
  frames: DirectionalFrames;
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

      if (view.state !== monster.state) {
        view.state = monster.state;
        this.drawFallback(view);
      }

      if (view.type !== monster.type) {
        view.type = monster.type;
        view.frame = -1;
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
      view.container.zIndex = getWorldEntityZIndex(pos.y, MONSTER_DEPTH_OFFSET);

      const dx = pos.x - view.previousX;
      const dy = pos.y - view.previousY;
      view.previousX = pos.x;
      view.previousY = pos.y;

      const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      if (moving) {
        view.facing = getFacingFromDelta(dx, dy, view.facing);
      }

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
          const frames = await loadDirectionalFrames(sheetConfig);
          this.spriteSheets.set(config.type, { config: sheetConfig, frames });
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
    container.position.set(monster.x, monster.y);
    container.zIndex = getWorldEntityZIndex(monster.y, MONSTER_DEPTH_OFFSET);

    const view: MonsterView = {
      container,
      body,
      sprite: null,
      type: monster.type,
      state: monster.state,
      facing: 'down',
      interp: new Interpolator2D(monster.x, monster.y, 10),
      previousX: monster.x,
      previousY: monster.y,
      animTime: Math.random(),
      frame: -1,
    };

    container.addChild(body);
    this.layer.addChild(container);
    this.applyMonsterVisual(view);
    return view;
  }

  private applyMonsterVisual(view: MonsterView): void {
    const loaded = this.spriteSheets.get(view.type);

    if (loaded) {
      if (!view.sprite) {
        view.sprite = new Sprite(loaded.frames.down[0]);
        view.container.addChild(view.sprite);
      }

      view.sprite.anchor.set(loaded.config.anchor.x, loaded.config.anchor.y);
      view.sprite.scale.set(loaded.config.scale);
      view.sprite.visible = true;
      view.body.visible = false;
      view.frame = -1;
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

    if (moving || view.state === 'chase') {
      view.animTime += dt;
    }

    const frame = moving || view.state === 'chase'
      ? Math.floor(view.animTime * loaded.config.fps) % loaded.config.frameCount
      : 0;

    if (frame !== view.frame) {
      view.frame = frame;
      view.sprite.texture = loaded.frames[view.facing][frame];
    }
  }

  private drawFallback(view: MonsterView): void {
    const config = getMonsterConfig(view.type);
    view.body.clear();

    if (view.type === 'sheep') {
      drawSheepFallback(view.body, view.state === 'chase');
      return;
    }

    view.body
      .circle(0, 0, config.fallback.radius)
      .fill({ color: view.state === 'chase' ? config.fallback.chaseColor : config.fallback.idleColor });
  }
}

function hasSpriteSheet(config: MonsterRenderConfig): config is SpriteMonsterConfig {
  return config.spriteSheet !== undefined;
}

async function loadDirectionalFrames(config: MonsterSpriteSheetConfig): Promise<DirectionalFrames> {
  const image = await loadImage(config.src);
  const sheet = Texture.from(image);
  sheet.source.scaleMode = 'nearest';

  return {
    down: makeRowTextures(sheet, config.rows.down, config),
    up: makeRowTextures(sheet, config.rows.up, config),
    left: makeRowTextures(sheet, config.rows.left, config),
    right: makeRowTextures(sheet, config.rows.right, config),
  };
}

function makeRowTextures(
  sheet: Texture,
  row: number,
  config: MonsterSpriteSheetConfig,
): Texture[] {
  return Array.from({ length: config.frameCount }, (_, index) => {
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(
        index * config.frameWidth,
        row * config.frameHeight,
        config.frameWidth,
        config.frameHeight,
      ),
    });
  });
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load monster sprite: ${src}`));
    image.src = src;
  });
}

function getFacingFromDelta(dx: number, dy: number, fallback: Facing): Facing {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
