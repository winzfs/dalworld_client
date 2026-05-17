import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Facing, PlayerSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';
import {
  PLAYER_IDLE_FRAME_HEIGHT,
  PLAYER_IDLE_FRAME_WIDTH,
  PLAYER_IDLE_SHEET_DATA_URL,
} from '../assets/playerIdleSheet';

const PLAYER_RADIUS = 18;
const COLOR_LOCAL = 0x55d6be;
const COLOR_REMOTE = 0xffd166;
const EYE_OFFSET = PLAYER_RADIUS * 0.55;
const EYE_RADIUS = 4;
const SPRITE_SCALE = 0.72;
const IDLE_COLUMNS = 8;
const IDLE_FPS = 8;

const IDLE_ROW: Record<Facing, number> = {
  down: 0,
  left: 1,
  up: 3,
  right: 5,
};

type PlayerView = {
  container: Container;
  fallbackBody: Graphics;
  fallbackEye: Graphics;
  sprite: Sprite | null;
  shadow: Graphics;
  selection: Graphics;
  hpBar: Graphics;
  facing: Facing;
  local: boolean;
  phase: number;
  animTime: number;
  currentFrame: number;
  interp: Interpolator2D;
};

type DirectionTextures = Record<Facing, Texture[]>;

export class PlayerRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, PlayerView>();
  private textures: DirectionTextures | null = null;

  constructor(parent: Container) {
    parent.addChild(this.layer);
    void this.loadTextures();
  }

  sync(snapshots: PlayerSnapshot[], localPlayerId: string | null): void {
    const seen = new Set<string>();

    for (const player of snapshots) {
      seen.add(player.id);
      const local = player.id === localPlayerId;
      let view = this.views.get(player.id);
      if (!view) {
        view = this.createView(player, local);
        this.views.set(player.id, view);
      }

      if (player.id === localPlayerId) {
        view.interp.snapTo(player.x, player.y);
      } else {
        view.interp.setTarget(player.x, player.y);
      }

      if (view.facing !== player.facing || view.local !== local) {
        view.facing = player.facing;
        view.local = local;
        view.currentFrame = -1;
        updateEye(view.fallbackEye, player.facing);
        this.applySpriteTexture(view);
        view.selection.visible = local;
      }

      this.drawHpBar(view.hpBar, player.hp, player.maxHp);
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
      view.phase += dt * 3.5;
      view.animTime += dt;
      view.container.position.set(Math.round(pos.x), Math.round(pos.y));

      const nextFrame = Math.floor(view.animTime * IDLE_FPS) % IDLE_COLUMNS;
      if (nextFrame !== view.currentFrame) {
        view.currentFrame = nextFrame;
        this.applySpriteTexture(view);
      }

      view.selection.alpha = view.local ? 0.65 + Math.sin(view.phase * 2) * 0.18 : 0;
    }
  }

  private async loadTextures(): Promise<void> {
    try {
      const image = await loadImage(PLAYER_IDLE_SHEET_DATA_URL);
      const sheet = Texture.from(image);
      sheet.source.scaleMode = 'nearest';
      this.textures = {
        down: rowTextures(sheet, IDLE_ROW.down),
        left: rowTextures(sheet, IDLE_ROW.left),
        up: rowTextures(sheet, IDLE_ROW.up),
        right: rowTextures(sheet, IDLE_ROW.right),
      };
      for (const view of this.views.values()) {
        view.currentFrame = -1;
        this.applySpriteTexture(view);
      }
    } catch (error) {
      console.warn('Failed to load uploaded player idle sprite sheet. Using fallback circles.', error);
    }
  }

  private createView(player: PlayerSnapshot, local: boolean): PlayerView {
    const container = new Container();

    const shadow = new Graphics();
    shadow.ellipse(0, 3, 16, 7).fill({ color: 0x102027, alpha: 0.42 });

    const selection = new Graphics();
    selection.visible = local;
    selection.ellipse(0, -4, 24, 10).stroke({ color: 0xffd166, width: 2, alpha: 0.9 });

    const fallbackBody = new Graphics();
    fallbackBody.circle(0, 0, PLAYER_RADIUS).fill({ color: local ? COLOR_LOCAL : COLOR_REMOTE });

    const fallbackEye = new Graphics();
    updateEye(fallbackEye, player.facing);

    const hpBar = new Graphics();

    container.addChild(shadow, selection, fallbackBody, fallbackEye, hpBar);
    container.position.set(player.x, player.y);
    this.layer.addChild(container);

    const view: PlayerView = {
      container,
      fallbackBody,
      fallbackEye,
      sprite: null,
      shadow,
      selection,
      hpBar,
      facing: player.facing,
      local,
      phase: Math.random() * Math.PI * 2,
      animTime: Math.random(),
      currentFrame: -1,
      interp: new Interpolator2D(player.x, player.y, local ? 30 : 12),
    };
    this.applySpriteTexture(view);
    return view;
  }

  private applySpriteTexture(view: PlayerView): void {
    const frames = this.textures?.[view.facing];
    if (!frames) return;
    const texture = frames[Math.max(0, view.currentFrame) % frames.length];

    if (!view.sprite) {
      view.sprite = new Sprite(texture);
      view.sprite.anchor.set(0.5, 1);
      view.sprite.scale.set(SPRITE_SCALE);
      view.container.addChildAt(view.sprite, 2);
    } else {
      view.sprite.texture = texture;
    }

    view.sprite.tint = view.local ? 0xffffff : 0xffe2a3;
    view.fallbackBody.visible = false;
    view.fallbackEye.visible = false;
  }

  private drawHpBar(bar: Graphics, hp: number, maxHp: number): void {
    bar.visible = hp < maxHp;
    bar.clear();
    if (!bar.visible) return;
    const width = 44;
    const ratio = Math.max(0, hp / maxHp);
    bar.rect(-width / 2 - 2, -78, width + 4, 7).fill({ color: 0x222831 });
    bar.rect(-width / 2, -76, width * ratio, 3).fill({ color: 0xef476f });
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  if ('decode' in image) {
    await image.decode();
    return image;
  }
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load player sprite image'));
  });
  return image;
}

function rowTextures(sheet: Texture, row: number): Texture[] {
  const frames: Texture[] = [];
  for (let col = 0; col < IDLE_COLUMNS; col += 1) {
    frames.push(new Texture({
      source: sheet.source,
      frame: new Rectangle(
        col * PLAYER_IDLE_FRAME_WIDTH,
        row * PLAYER_IDLE_FRAME_HEIGHT,
        PLAYER_IDLE_FRAME_WIDTH,
        PLAYER_IDLE_FRAME_HEIGHT,
      ),
    }));
  }
  return frames;
}

function updateEye(eye: Graphics, facing: Facing): void {
  eye.clear();
  const offset = facingOffset(facing);
  eye.circle(offset.x * EYE_OFFSET, offset.y * EYE_OFFSET, EYE_RADIUS).fill({ color: 0x102027 });
}

function facingOffset(facing: Facing): { x: number; y: number } {
  switch (facing) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}
