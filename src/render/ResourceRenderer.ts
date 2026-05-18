import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ResourceSnapshot } from '../protocol/messages';

const ASSET_BASE = '/assets/tilesets/fantasy/Art';

const TREE_SPRITES = [
  `${ASSET_BASE}/Tree and Bushes/Tree_Emerald_1.png`,
  `${ASSET_BASE}/Tree and Bushes/Tree_Emerald_2.png`,
  `${ASSET_BASE}/Tree and Bushes/Tree_Emerald_3.png`,
  `${ASSET_BASE}/Tree and Bushes/Tree_Emerald_4.png`,
];

const ROCK_SPRITES = [
  `${ASSET_BASE}/Rocks/Rock_Brown_1.png`,
  `${ASSET_BASE}/Rocks/Rock_Brown_2.png`,
  `${ASSET_BASE}/Rocks/Rock_Brown_4.png`,
  `${ASSET_BASE}/Rocks/Rock_Brown_6.png`,
  `${ASSET_BASE}/Rocks/Rock_Brown_9.png`,
];

const TREE_COLOR = 0x4caf50;
const TREE_TRUNK = 0x6d4c41;
const STONE_COLOR = 0x90a4ae;
const HP_BAR_WIDTH = 36;

type ResourceView = {
  container: Container;
  fallback: Graphics;
  hpBar: Graphics;
  sprite: Sprite | null;
  type: ResourceSnapshot['type'];
};

type ResourceTextures = Record<ResourceSnapshot['type'], Texture[]>;

export class ResourceRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, ResourceView>();
  private textures: Partial<ResourceTextures> = {};

  constructor(parent: Container) {
    this.layer.sortableChildren = true;
    parent.addChild(this.layer);
    void this.loadTextures();
  }

  sync(resources: ResourceSnapshot[]): void {
    const seen = new Set<string>();

    for (const resource of resources) {
      seen.add(resource.id);
      let view = this.views.get(resource.id);
      if (!view) {
        view = this.createView(resource);
        this.views.set(resource.id, view);
      }

      view.container.position.set(resource.x, resource.y);
      view.container.zIndex = Math.round(resource.y);

      if (!view.sprite) {
        this.applySprite(view, resource);
      }

      if (!resource.alive) {
        view.container.alpha = 0.18;
        view.hpBar.visible = false;
      } else {
        view.container.alpha = 1;
        const hpRatio = resource.hp / resource.maxHp;
        view.hpBar.visible = hpRatio < 1;
        if (view.hpBar.visible) {
          view.hpBar.clear();
          view.hpBar
            .rect(-HP_BAR_WIDTH / 2, -64, HP_BAR_WIDTH, 5)
            .fill({ color: 0x1a1a2e });
          view.hpBar
            .rect(-HP_BAR_WIDTH / 2, -64, HP_BAR_WIDTH * Math.max(0, hpRatio), 5)
            .fill({ color: resource.type === 'tree' ? 0x66bb6a : 0xb0bec5 });
        }
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

  getClosestAlive(
    resources: ResourceSnapshot[],
    x: number,
    y: number,
    maxDistance: number,
  ): ResourceSnapshot | null {
    let best: ResourceSnapshot | null = null;
    let bestDist = maxDistance;

    for (const resource of resources) {
      if (!resource.alive) continue;

      const dx = resource.x - x;
      const dy = resource.y - y;
      const d = Math.hypot(dx, dy);

      if (d <= bestDist) {
        bestDist = d;
        best = resource;
      }
    }

    return best;
  }

  private async loadTextures(): Promise<void> {
    this.textures = {
      tree: await loadOptionalTextures(TREE_SPRITES),
      stone: await loadOptionalTextures(ROCK_SPRITES),
    };

    for (const [id, view] of this.views) {
      this.applySprite(view, { id, type: view.type });
    }
  }

  private createView(resource: ResourceSnapshot): ResourceView {
    const container = new Container();
    const fallback = new Graphics();
    const hpBar = new Graphics();

    hpBar.visible = false;

    this.drawFallback(fallback, resource.type);
    container.addChild(fallback, hpBar);
    container.position.set(resource.x, resource.y);
    container.zIndex = Math.round(resource.y);
    this.layer.addChild(container);

    const view: ResourceView = {
      container,
      fallback,
      hpBar,
      sprite: null,
      type: resource.type,
    };

    this.applySprite(view, resource);
    return view;
  }

  private applySprite(view: ResourceView, resource: Pick<ResourceSnapshot, 'id' | 'type'>): void {
    const list = this.textures[resource.type];
    if (!list || list.length === 0) return;

    const texture = list[pickStableIndex(resource.id, list.length)];

    if (!view.sprite) {
      view.sprite = new Sprite(texture);
      view.sprite.anchor.set(0.5, 1);
      view.sprite.scale.set(resource.type === 'tree' ? 1.55 : 1.8);
      view.container.addChildAt(view.sprite, 0);
    } else {
      view.sprite.texture = texture;
    }

    view.fallback.visible = false;
  }

  private drawFallback(g: Graphics, type: ResourceSnapshot['type']): void {
    g.clear();

    if (type === 'tree') {
      g.rect(-3, -4, 6, 20).fill({ color: TREE_TRUNK });
      g.circle(0, -26, 22).fill({ color: TREE_COLOR });
      g.circle(-10, -18, 14).fill({ color: 0x43a047 });
      g.circle(10, -18, 14).fill({ color: 0x43a047 });
      g.circle(0, -34, 13).fill({ color: 0x81c784 });
    } else {
      g.circle(0, 4, 18).fill({ color: STONE_COLOR });
      g.circle(-7, -2, 12).fill({ color: 0xcfd8dc });
      g.circle(8, 0, 10).fill({ color: 0xb0bec5 });
      g.circle(-2, 8, 8).fill({ color: 0x78909c });
    }
  }
}

async function loadOptionalTextures(srcs: string[]): Promise<Texture[]> {
  const results = await Promise.allSettled(srcs.map((src) => loadTexture(src)));
  const textures: Texture[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      textures.push(result.value);
    } else {
      console.warn(result.reason);
    }
  }

  return textures;
}

function loadTexture(src: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const texture = Texture.from(image);
      texture.source.scaleMode = 'nearest';
      resolve(texture);
    };
    image.onerror = () => reject(new Error(`Failed to load resource sprite: ${src}`));
    image.src = src;
  });
}

function pickStableIndex(id: string, length: number): number {
  let hash = 2166136261;

  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % length;
}
