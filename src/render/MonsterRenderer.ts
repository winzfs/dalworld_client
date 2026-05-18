import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Facing, MonsterSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';

const MONSTER_COLOR_IDLE = 0xc62828;
const MONSTER_COLOR_CHASE = 0xff5252;

const SHEEP_SPRITE_SRC = '/assets/characters/monsters/sheep.png';
const SHEEP_FRAME_WIDTH = 32;
const SHEEP_FRAME_HEIGHT = 32;
const SHEEP_FRAME_COUNT = 4;
const SHEEP_SCALE = 2;
const SHEEP_FPS = 8;

const SHEEP_ROW_BY_FACING: Record<Facing, number> = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};

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

type SheepFrames = Record<Facing, Texture[]>;

export class MonsterRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, MonsterView>();
  private sheepFrames: SheepFrames | null = null;

  constructor(parent: Container) {
    parent.addChild(this.layer);
    void this.loadSheepFrames();
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

  private async loadSheepFrames(): Promise<void> {
    try {
      this.sheepFrames = await loadDirectionalFrames(
        SHEEP_SPRITE_SRC,
        SHEEP_FRAME_WIDTH,
        SHEEP_FRAME_HEIGHT,
        SHEEP_FRAME_COUNT,
      );

      for (const view of this.views.values()) {
        if (view.type === 'sheep') {
          this.applyMonsterVisual(view);
        }
      }
    } catch (error) {
      console.warn('Failed to load sheep monster sprite. Using fallback monster shape.', error);
    }
  }

  private createView(monster: MonsterSnapshot): MonsterView {
    const container = new Container();
    const body = new Graphics();
    container.position.set(monster.x, monster.y);

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
    if (view.type === 'sheep' && this.sheepFrames) {
      if (!view.sprite) {
        view.sprite = new Sprite(this.sheepFrames.down[0]);
        view.sprite.anchor.set(0.5, 1);
        view.sprite.scale.set(SHEEP_SCALE);
        view.container.addChild(view.sprite);
      }

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
    if (view.type !== 'sheep' || !view.sprite || !this.sheepFrames) return;

    if (moving || view.state === 'chase') {
      view.animTime += dt;
    }

    const frame = moving || view.state === 'chase'
      ? Math.floor(view.animTime * SHEEP_FPS) % SHEEP_FRAME_COUNT
      : 0;

    if (frame !== view.frame) {
      view.frame = frame;
      view.sprite.texture = this.sheepFrames[view.facing][frame];
    }
  }

  private drawFallback(view: MonsterView): void {
    view.body.clear();
    view.body
      .circle(0, 0, 16)
      .fill({ color: view.state === 'chase' ? MONSTER_COLOR_CHASE : MONSTER_COLOR_IDLE });
  }
}

async function loadDirectionalFrames(
  src: string,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
): Promise<SheepFrames> {
  const image = await loadImage(src);
  const sheet = Texture.from(image);
  sheet.source.scaleMode = 'nearest';

  return {
    down: makeRowTextures(sheet, SHEEP_ROW_BY_FACING.down, frameWidth, frameHeight, frameCount),
    up: makeRowTextures(sheet, SHEEP_ROW_BY_FACING.up, frameWidth, frameHeight, frameCount),
    left: makeRowTextures(sheet, SHEEP_ROW_BY_FACING.left, frameWidth, frameHeight, frameCount),
    right: makeRowTextures(sheet, SHEEP_ROW_BY_FACING.right, frameWidth, frameHeight, frameCount),
  };
}

function makeRowTextures(
  sheet: Texture,
  row: number,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
): Texture[] {
  return Array.from({ length: frameCount }, (_, index) => {
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(index * frameWidth, row * frameHeight, frameWidth, frameHeight),
    });
  });
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
