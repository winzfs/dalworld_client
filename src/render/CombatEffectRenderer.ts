import { Container, Graphics, Text } from 'pixi.js';
import type { CombatHitEvent, Facing } from '../protocol/messages';
import { getWorldEntityZIndex } from '../systems/building/IsoBuildingMath';

type SlashEffect = {
  g: Graphics;
  age: number;
  lifetime: number;
  x: number;
  y: number;
  facing: Facing;
  predicted: boolean;
};

type FloatingTextEffect = {
  text: Text;
  age: number;
  lifetime: number;
  x: number;
  y: number;
};

const SLASH_LIFETIME = 0.18;
const FLOATING_TEXT_LIFETIME = 0.65;
const ATTACK_OFFSET = 54;

export class CombatEffectRenderer {
  readonly container = new Container();
  private readonly slashes: SlashEffect[] = [];
  private readonly floatingTexts: FloatingTextEffect[] = [];

  constructor(parent: Container) {
    this.container.sortableChildren = true;
    this.container.zIndex = 180;
    parent.addChild(this.container);
  }

  showLocalAttack(input: { x: number; y: number; facing: Facing }): void {
    const p = offsetPoint(input.x, input.y, input.facing, ATTACK_OFFSET);
    this.addSlash({ x: p.x, y: p.y, facing: input.facing, predicted: true });
  }

  showServerAttack(input: { x: number; y: number; facing: Facing }): void {
    const p = offsetPoint(input.x, input.y, input.facing, ATTACK_OFFSET);
    this.addSlash({ x: p.x, y: p.y, facing: input.facing, predicted: false });
  }

  showHit(event: CombatHitEvent): void {
    this.addFloatingText({
      x: event.x,
      y: event.y - 42,
      text: `-${event.damage}`,
      color: event.targetType === 'player' ? 0xff4f5f : 0xfff1a8,
    });
  }

  showMiss(input: { x: number; y: number }): void {
    this.addFloatingText({
      x: input.x,
      y: input.y - 38,
      text: 'MISS',
      color: 0xffffff,
    });
  }

  update(dt: number): void {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const effect = this.slashes[i];
      effect.age += dt;
      const t = Math.min(1, effect.age / effect.lifetime);
      effect.g.alpha = (1 - t) * (effect.predicted ? 0.58 : 0.9);
      effect.g.scale.set(0.78 + t * 0.45);
      if (effect.age >= effect.lifetime) {
        this.container.removeChild(effect.g);
        effect.g.destroy();
        this.slashes.splice(i, 1);
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const effect = this.floatingTexts[i];
      effect.age += dt;
      const t = Math.min(1, effect.age / effect.lifetime);
      effect.text.alpha = 1 - t;
      effect.text.y = Math.round(effect.y - t * 26);
      effect.text.scale.set(1 + t * 0.1);
      if (effect.age >= effect.lifetime) {
        this.container.removeChild(effect.text);
        effect.text.destroy();
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private addSlash(input: { x: number; y: number; facing: Facing; predicted: boolean }): void {
    const g = new Graphics();
    const color = input.predicted ? 0x9dffef : 0xfff1a8;
    g.moveTo(-22, 0).quadraticCurveTo(0, -24, 22, 0).stroke({ color, width: 5, alpha: 0.92 });
    g.moveTo(-14, 8).quadraticCurveTo(0, -12, 14, 8).stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
    g.position.set(Math.round(input.x), Math.round(input.y));
    g.rotation = rotationForFacing(input.facing);
    g.zIndex = getWorldEntityZIndex(input.y, 260);
    this.container.addChild(g);
    this.slashes.push({ g, age: 0, lifetime: SLASH_LIFETIME, x: input.x, y: input.y, facing: input.facing, predicted: input.predicted });
  }

  private addFloatingText(input: { x: number; y: number; text: string; color: number }): void {
    const text = new Text({
      text: input.text,
      style: {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 15,
        fontWeight: '900',
        fill: input.color,
        stroke: { color: 0x1a1d21, width: 4 },
      },
    });
    text.anchor.set(0.5, 0.5);
    text.position.set(Math.round(input.x), Math.round(input.y));
    text.zIndex = getWorldEntityZIndex(input.y, 280);
    this.container.addChild(text);
    this.floatingTexts.push({ text, age: 0, lifetime: FLOATING_TEXT_LIFETIME, x: input.x, y: input.y });
  }
}

function offsetPoint(x: number, y: number, facing: Facing, distance: number): { x: number; y: number } {
  switch (facing) {
    case 'up': return { x, y: y - distance };
    case 'down': return { x, y: y + distance };
    case 'left': return { x: x - distance, y };
    case 'right': return { x: x + distance, y };
  }
}

function rotationForFacing(facing: Facing): number {
  switch (facing) {
    case 'up': return -Math.PI / 2;
    case 'down': return Math.PI / 2;
    case 'left': return Math.PI;
    case 'right': return 0;
  }
}
