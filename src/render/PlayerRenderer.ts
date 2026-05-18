import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Facing, PlayerSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';
import { PLAYER_IDLE_FRAME_HEIGHT, PLAYER_IDLE_FRAME_WIDTH, PLAYER_IDLE_SHEET_DATA_URL } from '../assets/playerIdleSheet';

const R = 18;
const SCALE = 0.72;
const COLS = 8;
const FPS = 8;
const ROW: Record<Facing, number> = { down: 0, left: 1, up: 3, right: 5 };

type View = {
  c: Container;
  body: Graphics;
  eye: Graphics;
  hp: Graphics;
  ring: Graphics;
  sprite: Sprite | null;
  facing: Facing;
  local: boolean;
  t: number;
  frame: number;
  interp: Interpolator2D;
};

type Frames = Record<Facing, Texture[]>;

export class PlayerRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, View>();
  private frames: Frames | null = null;

  constructor(parent: Container) {
    parent.addChild(this.layer);
    void this.load();
  }

  sync(players: PlayerSnapshot[], localPlayerId: string | null): void {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      const local = p.id === localPlayerId;
      let v = this.views.get(p.id);
      if (!v) {
        v = this.makeView(p, local);
        this.views.set(p.id, v);
      }
      local ? v.interp.snapTo(p.x, p.y) : v.interp.setTarget(p.x, p.y);
      if (v.facing !== p.facing || v.local !== local) {
        v.facing = p.facing;
        v.local = local;
        v.frame = -1;
        drawEye(v.eye, p.facing);
        this.apply(v);
        v.ring.visible = local;
      }
      this.drawHp(v.hp, p.hp, p.maxHp);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.layer.removeChild(v.c);
        v.c.destroy({ children: true });
        this.views.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (const v of this.views.values()) {
      const pos = v.interp.update(dt);
      v.t += dt;
      v.c.position.set(Math.round(pos.x), Math.round(pos.y));
      const frame = Math.floor(v.t * FPS) % COLS;
      if (frame !== v.frame) {
        v.frame = frame;
        this.apply(v);
      }
      v.ring.alpha = v.local ? 0.62 + Math.sin(v.t * 7) * 0.18 : 0;
    }
  }

  private async load(): Promise<void> {
    try {
      const img = await loadImage(PLAYER_IDLE_SHEET_DATA_URL);
      const sheet = Texture.from(img);
      sheet.source.scaleMode = 'nearest';
      this.frames = { down: makeRow(sheet, ROW.down), left: makeRow(sheet, ROW.left), up: makeRow(sheet, ROW.up), right: makeRow(sheet, ROW.right) };
      for (const v of this.views.values()) {
        v.frame = -1;
        this.apply(v);
      }
    } catch (e) {
      console.warn('Failed to load player idle sprites. Using fallback circle.', e);
    }
  }

  private makeView(p: PlayerSnapshot, local: boolean): View {
    const c = new Container();
    const shadow = new Graphics().ellipse(0, 3, 16, 7).fill({ color: 0x102027, alpha: 0.42 });
    const ring = new Graphics().ellipse(0, -4, 24, 10).stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
    ring.visible = local;
    const body = new Graphics().circle(0, 0, R).fill({ color: local ? 0x55d6be : 0xffd166 });
    const eye = new Graphics();
    drawEye(eye, p.facing);
    const hp = new Graphics();
    c.addChild(shadow, ring, body, eye, hp);
    c.position.set(p.x, p.y);
    this.layer.addChild(c);
    const v: View = { c, body, eye, hp, ring, sprite: null, facing: p.facing, local, t: Math.random(), frame: -1, interp: new Interpolator2D(p.x, p.y, local ? 30 : 12) };
    this.apply(v);
    return v;
  }

  private apply(v: View): void {
    const list = this.frames?.[v.facing];
    if (!list) return;
    const tex = list[Math.max(0, v.frame) % list.length];
    if (!v.sprite) {
      v.sprite = new Sprite(tex);
      v.sprite.anchor.set(0.5, 1);
      v.sprite.scale.set(SCALE);
      v.c.addChildAt(v.sprite, 2);
    } else {
      v.sprite.texture = tex;
    }
    v.sprite.tint = v.local ? 0xffffff : 0xffe2a3;
    v.body.visible = false;
    v.eye.visible = false;
  }

  private drawHp(g: Graphics, hp: number, maxHp: number): void {
    g.clear();
    g.visible = hp < maxHp;
    if (!g.visible) return;
    const w = 44;
    const r = Math.max(0, hp / maxHp);
    g.rect(-w / 2 - 2, -78, w + 4, 7).fill({ color: 0x222831 });
    g.rect(-w / 2, -76, w * r, 3).fill({ color: 0xef476f });
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('player sprite image load failed'));
    img.src = src;
  });
}

function makeRow(sheet: Texture, row: number): Texture[] {
  return Array.from({ length: COLS }, (_, col) => new Texture({ source: sheet.source, frame: new Rectangle(col * PLAYER_IDLE_FRAME_WIDTH, row * PLAYER_IDLE_FRAME_HEIGHT, PLAYER_IDLE_FRAME_WIDTH, PLAYER_IDLE_FRAME_HEIGHT) }));
}

function drawEye(g: Graphics, facing: Facing): void {
  g.clear();
  const o = facing === 'up' ? { x: 0, y: -1 } : facing === 'down' ? { x: 0, y: 1 } : facing === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };
  g.circle(o.x * R * 0.55, o.y * R * 0.55, 4).fill({ color: 0x102027 });
}
