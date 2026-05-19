import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { ResourceSnapshot } from '../protocol/messages';
import type { WorldMapSourceRect } from '../worldMap/types';

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
  ownedTexture: Texture | null;
  type: ResourceSnapshot['type'];
  assetUrl?: string;
  assetScale?: number;
  sourceRect?: WorldMapSourceRect;
};

type ResourceTextures = Record<ResourceSnapshot['type'], Texture[]>;

export class ResourceRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, ResourceView>();
  private readonly assetTextureCache = new Map<string, Promise<Texture | null>>();
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

      if (shouldReapplySprite(view, resource)) {
        this.applySprite(view, resource);
      }

      if (!resource.alive) {
        view.container.visible = false;
        view.hpBar.visible = false;
        continue;
      }

      view.container.visible = true;
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

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.destroyView(view);
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
      this.applySprite(view, {
        id,
        type: view.type,
        assetUrl: view.assetUrl,
        assetScale: view.assetScale,
        sourceRect: view.sourceRect,
      });
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
      ownedTexture: null,
      type: resource.type,
      assetUrl: resource.assetUrl,
      assetScale: resource.assetScale,
      sourceRect: cloneSourceRect(resource.sourceRect),
    };

    this.applySprite(view, resource);
    return view;
  }

  private applySprite(
    view: ResourceView,
    resource: Pick<ResourceSnapshot, 'id' | 'type' | 'assetUrl' | 'assetScale' | 'sourceRect'>,
  ): void {
    view.type = resource.type;
    view.assetUrl = resource.assetUrl;
    view.assetScale = resource.assetScale;
    view.sourceRect = cloneSourceRect(resource.sourceRect);

    if (resource.assetUrl) {
      void this.loadAssetTexture(resource.assetUrl).then((texture) => {
        if (!texture || this.views.get(resource.id) !== view) return;
        const displayTexture = resource.sourceRect
          ? this.createSlicedTexture(view, texture, resource.sourceRect)
          : texture;
        this.setSpriteTexture(view, displayTexture, resource.type, {
          useDefaultResourceScale: false,
          scale: normalizeScale(resource.assetScale),
        });
      });
      return;
    }

    const list = this.textures[resource.type];
    if (!list || list.length === 0) return;

    const texture = list[pickStableIndex(resource.id, list.length)];
    this.setSpriteTexture(view, texture, resource.type, {
      useDefaultResourceScale: true,
      scale: resource.type === 'tree' ? 1.55 : 1.8,
    });
  }

  private setSpriteTexture(
    view: ResourceView,
    texture: Texture,
    type: ResourceSnapshot['type'],
    options: { useDefaultResourceScale: boolean; scale: number },
  ): void {
    if (!view.sprite) {
      view.sprite = new Sprite(texture);
      view.container.addChildAt(view.sprite, 0);
    } else {
      view.sprite.texture = texture;
    }

    view.sprite.anchor.set(options.useDefaultResourceScale ? 0.5 : 0, options.useDefaultResourceScale ? 1 : 0);
    view.sprite.scale.set(options.scale);
    view.fallback.visible = false;
  }

  private createSlicedTexture(view: ResourceView, texture: Texture, sourceRect: WorldMapSourceRect): Texture {
    if (view.ownedTexture && !view.ownedTexture.destroyed) {
      view.ownedTexture.destroy(false);
      view.ownedTexture = null;
    }

    const safeRect = shrinkSourceRect(sourceRect, texture);
    const sliced = new Texture({
      source: texture.source,
      frame: new Rectangle(safeRect.x, safeRect.y, safeRect.width, safeRect.height),
    });
    view.ownedTexture = sliced;
    return sliced;
  }

  private loadAssetTexture(url: string): Promise<Texture | null> {
    let promise = this.assetTextureCache.get(url);
    if (!promise) {
      promise = loadTexture(url).catch((error: unknown) => {
        console.warn(error);
        return null;
      });
      this.assetTextureCache.set(url, promise);
    }
    return promise;
  }

  private destroyView(view: ResourceView): void {
    if (view.ownedTexture && !view.ownedTexture.destroyed) {
      view.ownedTexture.destroy(false);
    }
    this.layer.removeChild(view.container);
    view.container.destroy({ children: true });
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

function shouldReapplySprite(view: ResourceView, resource: ResourceSnapshot): boolean {
  return (
    !view.sprite ||
    view.assetUrl !== resource.assetUrl ||
    view.type !== resource.type ||
    view.assetScale !== resource.assetScale ||
    !sameSourceRect(view.sourceRect, resource.sourceRect)
  );
}

function normalizeScale(scale: number | undefined): number {
  return Number.isFinite(scale) && (scale as number) > 0 ? (scale as number) : 1;
}

function cloneSourceRect(sourceRect: WorldMapSourceRect | undefined): WorldMapSourceRect | undefined {
  return sourceRect ? { ...sourceRect } : undefined;
}

function sameSourceRect(a: WorldMapSourceRect | undefined, b: WorldMapSourceRect | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function shrinkSourceRect(sourceRect: WorldMapSourceRect, texture: Texture): WorldMapSourceRect {
  const maxWidth = Math.max(1, Math.floor(texture.width));
  const maxHeight = Math.max(1, Math.floor(texture.height));
  const x = clamp(Math.floor(sourceRect.x), 0, maxWidth - 1);
  const y = clamp(Math.floor(sourceRect.y), 0, maxHeight - 1);
  const width = clamp(Math.floor(sourceRect.width), 1, maxWidth - x);
  const height = clamp(Math.floor(sourceRect.height), 1, maxHeight - y);
  return { x, y, width, height };
}

function pickStableIndex(id: string, length: number): number {
  let hash = 2166136261;

  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
