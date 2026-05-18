import { Assets, Container, Graphics, Rectangle, SCALE_MODES, Sprite, Texture, type Texture as PixiTexture } from 'pixi.js';
import type { GameWorldMap, WorldMapPlacement, WorldMapSourceRect } from '../worldMap/types';
import { createTransparentBlackTexture } from '../editor/createTransparentBlackTexture';

export class GameWorldMapRenderer {
  readonly layer = new Container();

  private readonly textureCache = new Map<string, Promise<PixiTexture | null>>();
  private readonly transparentTextureCache = new Map<string, Promise<PixiTexture | null>>();
  private readonly displays: Array<Sprite | Graphics> = [];
  private renderGeneration = 0;

  constructor(private readonly world: Container) {
    this.layer.label = 'game-world-map-layer';
    this.layer.sortableChildren = true;
    this.world.addChild(this.layer);
  }

  async render(map: GameWorldMap | null): Promise<void> {
    const generation = ++this.renderGeneration;
    this.clear();

    if (!this.layer.parent) {
      this.world.addChild(this.layer);
    }

    if (!map) return;

    const placements = map.cells
      .flatMap((cell) => cell.placements.map((placement) => ({
        ...placement,
        x: placement.x + cell.gridX * map.cellSize,
        y: placement.y + cell.gridY * map.cellSize,
      })))
      .filter((placement) => placement.layer !== 'collision')
      .filter((placement) => placement.id !== 'editor-black-base')
      .sort((a, b) => getLayerZ(a.layer) - getLayerZ(b.layer));

    for (const placement of placements) {
      const display = await this.createDisplay(placement);

      if (generation !== this.renderGeneration) {
        display.destroy();
        return;
      }

      display.zIndex = getLayerZ(placement.layer) + (placement.transparentBlack ? 0.5 : 0);
      this.displays.push(display);
      this.layer.addChild(display);
    }
  }

  destroy(): void {
    this.renderGeneration += 1;
    this.clear();
    if (this.layer.parent) {
      this.layer.parent.removeChild(this.layer);
    }
    this.layer.destroy({ children: true });
  }

  private clear(): void {
    for (const display of this.displays) {
      if (!display.destroyed) {
        display.destroy();
      }
    }
    this.displays.length = 0;
    this.layer.removeChildren();
  }

  private async createDisplay(placement: WorldMapPlacement): Promise<Sprite | Graphics> {
    if (placement.solidColor !== undefined) {
      return this.createSolidTile(placement);
    }

    const texture = placement.transparentBlack
      ? await this.loadTransparentTexture(placement.assetUrl, placement.sourceRect)
      : await this.loadTexture(placement.assetUrl);

    if (!texture) return this.createFallbackTile(placement);

    const sourceRect = placement.transparentBlack
      ? undefined
      : placement.sourceRect ? shrinkSourceRect(placement.sourceRect, texture) : undefined;
    const sliced = sourceRect
      ? new Texture({ source: texture.source, frame: new Rectangle(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height) })
      : texture;
    enforceNearestScale(sliced);

    const sprite = new Sprite(sliced);
    const scale = normalizeScale(placement.scale);
    const baseWidth = placement.sourceRect?.width ?? sliced.width;
    const baseHeight = placement.sourceRect?.height ?? sliced.height;
    sprite.x = placement.x;
    sprite.y = placement.y;
    sprite.roundPixels = true;
    sprite.scale.set((baseWidth / sliced.width) * scale, (baseHeight / sliced.height) * scale);
    return sprite;
  }

  private createSolidTile(placement: WorldMapPlacement): Graphics {
    const tile = new Graphics();
    const scale = normalizeScale(placement.scale);
    const width = (placement.sourceRect?.width ?? 32) * scale;
    const height = (placement.sourceRect?.height ?? 32) * scale;
    tile.x = placement.x;
    tile.y = placement.y;
    tile.rect(0, 0, width, height).fill({ color: placement.solidColor ?? 0x000000, alpha: 1 });
    return tile;
  }

  private createFallbackTile(placement: WorldMapPlacement): Graphics {
    const tile = new Graphics();
    const scale = normalizeScale(placement.scale);
    const width = (placement.sourceRect?.width ?? 32) * scale;
    const height = (placement.sourceRect?.height ?? 32) * scale;
    tile.x = placement.x;
    tile.y = placement.y;
    tile.rect(0, 0, width, height).fill({ color: 0x47b881, alpha: 1 });
    return tile;
  }

  private loadTexture(url: string): Promise<PixiTexture | null> {
    let promise = this.textureCache.get(url);
    if (!promise) {
      promise = Assets.load<PixiTexture>(url)
        .then((texture) => {
          enforceNearestScale(texture);
          return texture;
        })
        .catch((error: unknown) => {
          console.warn(`[GameWorldMapRenderer] Failed to load map asset: ${url}`, error);
          return null;
        });
      this.textureCache.set(url, promise);
    }
    return promise;
  }

  private loadTransparentTexture(
    url: string,
    sourceRect: WorldMapSourceRect | undefined,
  ): Promise<PixiTexture | null> {
    const key = `${url}:${sourceRect ? `${sourceRect.x},${sourceRect.y},${sourceRect.width},${sourceRect.height}` : 'full'}:transparent-black`;
    let promise = this.transparentTextureCache.get(key);
    if (!promise) {
      promise = createTransparentBlackTexture(url, sourceRect)
        .then((texture) => {
          if (texture) enforceNearestScale(texture);
          return texture;
        })
        .catch((error: unknown) => {
          console.warn(`[GameWorldMapRenderer] Failed to create transparent black texture: ${url}`, error);
          return null;
        });
      this.transparentTextureCache.set(key, promise);
    }
    return promise;
  }
}

function getLayerZ(layer: WorldMapPlacement['layer']): number {
  switch (layer) {
    case 'ground':
      return 1;
    case 'object':
      return 10;
    case 'collision':
      return 100;
  }
}

function normalizeScale(scale: number | undefined): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.1, scale ?? 1);
}

function shrinkSourceRect(sourceRect: WorldMapSourceRect, texture: PixiTexture): WorldMapSourceRect {
  const inset = sourceRect.width > 2 && sourceRect.height > 2 ? 1 : 0;
  const maxWidth = Math.max(1, Math.floor(texture.width));
  const maxHeight = Math.max(1, Math.floor(texture.height));
  const x = clamp(sourceRect.x + inset, 0, maxWidth - 1);
  const y = clamp(sourceRect.y + inset, 0, maxHeight - 1);
  const width = clamp(sourceRect.width - inset * 2, 1, maxWidth - x);
  const height = clamp(sourceRect.height - inset * 2, 1, maxHeight - y);
  return { x, y, width, height };
}

function enforceNearestScale(texture: PixiTexture): void {
  texture.source.scaleMode = SCALE_MODES.NEAREST;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
