import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Facing, PlayerSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';
import { FEMALE_ADVENTURER, type FemaleAdventurerAnim } from '../assets/femaleAdventurer';
import { loadSpriteStrip } from './spriteStrip';

const REQUIRED_ANIMS: FemaleAdventurerAnim[] = ['idle', 'walk'];

type View = {
  c: Container;
  hp: Graphics;
  ring: Graphics;
  fallback: Graphics;
  sprite: Sprite | null;
  facing: Facing;
  local: boolean;
  t: number;
  frame: number;
  moving: boolean;
  interp: Interpolator2D;
  targetX: number;
  targetY: number;
  currentAnim: FemaleAdventurerAnim | null;
};

type Frames = Partial<Record<FemaleAdventurerAnim, Partial<Record<Facing, Texture[]>>>>;

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

      v.moving = Math.abs(p.x - v.targetX) > 0.5 || Math.abs(p.y - v.targetY) > 0.5;
      v.targetX = p.x;
      v.targetY = p.y;

      local ? v.interp.snapTo(p.x, p.y) : v.interp.setTarget(p.x, p.y);

      if (v.facing !== p.facing || v.local !== local) {
        v.facing = p.facing;
        v.local = local;
        v.frame = -1;
        v.currentAnim = null;
        this.apply(v);
        v.ring.visible = local;
        this.drawFallback(v);
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
      v.c.position.set(Math.round(pos.x), Math.round(pos.y));

      const anim = this.selectAnim(v);

      if (anim !== v.currentAnim) {
        v.currentAnim = anim;
        v.frame = -1;
        v.t = 0;
      }

      const frame = Math.floor((v.t += dt) * FEMALE_ADVENTURER.fps[anim]) % FEMALE_ADVENTURER.frameCount;

      if (frame !== v.frame) {
        v.frame = frame;
        this.apply(v);
      }

      v.ring.alpha = v.local ? 0.62 + Math.sin(v.t * 7) * 0.18 : 0;
    }
  }

  private async load(): Promise<void> {
    const frames: Frames = {};

    for (const anim of REQUIRED_ANIMS) {
      frames[anim] = {};

      for (const facing of FEMALE_ADVENTURER.facings) {
        try {
          frames[anim]![facing] = await loadSpriteStrip(
            FEMALE_ADVENTURER.sheets[anim][facing],
            FEMALE_ADVENTURER.frameWidth,
            FEMALE_ADVENTURER.frameHeight,
            FEMALE_ADVENTURER.frameCount,
          );
        } catch (error) {
          console.warn(`Failed to load ${FEMALE_ADVENTURER.id} ${anim}/${facing}.`, error);
        }
      }
    }

    this.frames = frames;

    for (const v of this.views.values()) {
      v.frame = -1;
      v.currentAnim = null;
      this.apply(v);
    }
  }

  private makeView(p: PlayerSnapshot, local: boolean): View {
    const c = new Container();
    const ring = new Graphics()
      .ellipse(0, -6, 20, 10)
      .stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
    const fallback = new Graphics();
    const hp = new Graphics();

    ring.visible = local;
    c.addChild(fallback, ring, hp);
    c.position.set(p.x, p.y);
    this.layer.addChild(c);

    const v: View = {
      c,
      hp,
      ring,
      fallback,
      sprite: null,
      facing: p.facing,
      local,
      t: Math.random(),
      frame: -1,
      moving: false,
      interp: new Interpolator2D(p.x, p.y, local ? 30 : 12),
      targetX: p.x,
      targetY: p.y,
      currentAnim: null,
    };

    this.drawFallback(v);
    this.apply(v);
    return v;
  }

  private apply(v: View): void {
    const anim = this.selectAnim(v);
    const list = this.frames?.[anim]?.[v.facing] ?? this.frames?.idle?.down;

    if (!list || list.length === 0) {
      v.fallback.visible = true;
      if (v.sprite) v.sprite.visible = false;
      return;
    }

    const tex = list[Math.max(0, v.frame) % list.length];

    if (!v.sprite) {
      v.sprite = new Sprite(tex);
      v.sprite.anchor.set(FEMALE_ADVENTURER.anchor.x, FEMALE_ADVENTURER.anchor.y);
      v.sprite.scale.set(FEMALE_ADVENTURER.scale);
      v.c.addChildAt(v.sprite, 1);
    } else {
      v.sprite.texture = tex;
      v.sprite.visible = true;
    }

    v.fallback.visible = false;
    v.sprite.tint = v.local ? 0xffffff : 0xfff1cf;
  }

  private selectAnim(v: View): FemaleAdventurerAnim {
    return v.moving ? 'walk' : 'idle';
  }

  private drawFallback(v: View): void {
    v.fallback.clear();
    v.fallback.circle(0, 0, 18).fill({ color: v.local ? 0x55d6be : 0xffd166 });
  }

  private drawHp(g: Graphics, hp: number, maxHp: number): void {
    g.clear();
    g.visible = hp < maxHp;
    if (!g.visible) return;

    const width = 44;
    const ratio = Math.max(0, hp / maxHp);

    g.rect(-width / 2 - 2, -76, width + 4, 7).fill({ color: 0x222831 });
    g.rect(-width / 2, -74, width * ratio, 3).fill({ color: 0xef476f });
  }
}
