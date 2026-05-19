import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Facing, PlayerSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';
import { FEMALE_ADVENTURER, type FemaleAdventurerAnim } from '../assets/femaleAdventurer';
import { getWorldEntityZIndex } from '../systems/building/IsoBuildingMath';
import { loadSpriteStrip } from './spriteStrip';

const REQUIRED_ANIMS: FemaleAdventurerAnim[] = ['idle', 'walk'];
const PLAYER_RENDER_HEIGHT = FEMALE_ADVENTURER.frameHeight * FEMALE_ADVENTURER.scale;
const PLAYER_RENDER_WIDTH = FEMALE_ADVENTURER.frameWidth * FEMALE_ADVENTURER.scale;
const PLAYER_SHADOW_SCALE = FEMALE_ADVENTURER.scale;
const PLAYER_SHADOW_Y = -34;
const PLAYER_RING_Y = -10;
const PLAYER_FALLBACK_Y = -16;
const PLAYER_HP_Y = -Math.round(PLAYER_RENDER_HEIGHT - 8);
const PLAYER_DEPTH_OFFSET = 140;
const PLAYER_SHADOW_SOURCES = [
  '/assets/characters/female_adventurer/Shadow.png',
  '/assets/characters/female_adventurer/shadow.png',
  '/assets/characters/female_adventurer/Shadow/Shadow.png',
  '/assets/characters/female_adventurer/shadow/shadow.png',
  '/assets/characters/Shadow.png',
  '/assets/characters/shadow.png',
  '/assets/tilesets/fantasy/Art/Shadows/Shadow_Round_48x24_Medium_Black.png',
  '/assets/tilesets/fantasy/Art/Shadow/Shadow_Round_48x24_Medium_Black.png',
  '/assets/tilesets/fantasy/Art/shadows/Shadow_Round_48x24_Medium_Black.png',
  '/assets/tilesets/fantasy/Art/Shadows/Shadow_Round_40x40_Flat_Black.png',
];

type View = {
  c: Container;
  hp: Graphics;
  ring: Graphics;
  fallback: Graphics;
  shadow: Sprite | Graphics;
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
  private shadowTexture: Texture | null = null;

  constructor(parent: Container) {
    this.layer.sortableChildren = true;
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
      v.c.zIndex = getWorldEntityZIndex(pos.y, PLAYER_DEPTH_OFFSET);

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
    this.shadowTexture = await loadFirstTexture(PLAYER_SHADOW_SOURCES);

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
      this.applyShadowTexture(v);
      v.frame = -1;
      v.currentAnim = null;
      this.apply(v);
    }
  }

  private makeView(p: PlayerSnapshot, local: boolean): View {
    const c = new Container();
    const ring = new Graphics()
      .ellipse(0, PLAYER_RING_Y, PLAYER_RENDER_WIDTH * 0.21, FEMALE_ADVENTURER.scale * 5)
      .stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
    const fallback = new Graphics();
    const hp = new Graphics();
    const shadow = this.makeShadow();

    c.zIndex = getWorldEntityZIndex(p.y, PLAYER_DEPTH_OFFSET);
    ring.visible = local;
    c.addChild(shadow, fallback, ring, hp);
    c.position.set(p.x, p.y);
    this.layer.addChild(c);

    const v: View = {
      c,
      hp,
      ring,
      fallback,
      shadow,
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

  private makeShadow(): Sprite | Graphics {
    if (this.shadowTexture) {
      const shadow = new Sprite(this.shadowTexture);
      this.configureShadowSprite(shadow);
      return shadow;
    }

    return new Graphics()
      .ellipse(0, PLAYER_SHADOW_Y, 23 * PLAYER_SHADOW_SCALE, 10 * PLAYER_SHADOW_SCALE)
      .fill({ color: 0x000000, alpha: 0.28 });
  }

  private applyShadowTexture(v: View): void {
    if (!this.shadowTexture || v.shadow instanceof Sprite) return;

    const sprite = new Sprite(this.shadowTexture);
    this.configureShadowSprite(sprite);

    const index = v.c.getChildIndex(v.shadow);
    v.c.removeChild(v.shadow);
    v.shadow.destroy();
    v.shadow = sprite;
    v.c.addChildAt(sprite, index);
  }

  private configureShadowSprite(shadow: Sprite): void {
    shadow.anchor.set(0.5, 0.5);
    shadow.position.set(0, PLAYER_SHADOW_Y);
    shadow.scale.set(PLAYER_SHADOW_SCALE);
    shadow.alpha = 0.42;
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
      v.c.addChildAt(v.sprite, 2);
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
    v.fallback.circle(0, PLAYER_FALLBACK_Y, 9 * FEMALE_ADVENTURER.scale).fill({ color: v.local ? 0x55d6be : 0xffd166 });
  }

  private drawHp(g: Graphics, hp: number, maxHp: number): void {
    g.clear();
    g.visible = hp < maxHp;
    if (!g.visible) return;

    const width = 22 * FEMALE_ADVENTURER.scale;
    const ratio = Math.max(0, hp / maxHp);

    g.rect(-width / 2 - 2, PLAYER_HP_Y - 2, width + 4, 7).fill({ color: 0x222831 });
    g.rect(-width / 2, PLAYER_HP_Y, width * ratio, 3).fill({ color: 0xef476f });
  }
}

async function loadFirstTexture(srcs: string[]): Promise<Texture | null> {
  for (const src of srcs) {
    try {
      const texture = await loadTexture(src);
      texture.source.scaleMode = 'nearest';
      return texture;
    } catch {
      // Try next compatible path candidate.
    }
  }

  console.warn('Failed to load player shadow texture. Using vector fallback shadow.');
  return null;
}

function loadTexture(src: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(Texture.from(image));
    image.onerror = () => reject(new Error(`Failed to load texture: ${src}`));
    image.src = src;
  });
}
