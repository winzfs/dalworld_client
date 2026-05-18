import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { EditorMapDraft, EditorTilePlacement, EditorTilesetAsset } from './types';
import { EditorState } from './EditorState';
import { TILESET_CATEGORIES } from './tilesetManifest';

export type TilePlacementSystemOptions = {
  tileSize: number;
  mapName: string;
};

type PlacedDisplay = Sprite | Graphics;

/**
 * Owns editor-only placed tile sprites and the serializable map draft.
 */
export class TilePlacementSystem {
  readonly layer = new Container();

  private readonly draft: EditorMapDraft;
  private readonly displays = new Map<string, PlacedDisplay>();
  private readonly textureCache = new Map<string, Promise<Texture | null>>();

  constructor(
    private readonly state: EditorState,
    options: TilePlacementSystemOptions,
  ) {
    this.layer.label = 'editor-tile-placement-layer';
    this.layer.sortableChildren = true;
    this.draft = {
      version: 1,
      name: options.mapName,
      tileSize: options.tileSize,
      placements: [],
    };
  }

  get mapDraft(): EditorMapDraft {
    return {
      ...this.draft,
      placements: this.draft.placements.map((placement) => ({ ...placement })),
    };
  }

  async placeAt(worldX: number, worldY: number): Promise<void> {
    if (this.state.mode === 'erase') {
      this.eraseAt(worldX, worldY);
      return;
    }

    const asset = this.state.selectedAsset;
    if (!asset) return;

    const x = snap(worldX, this.draft.tileSize);
    const y = snap(worldY, this.draft.tileSize);
    const existing = this.findPlacementAt(x, y, this.state.activeLayer);

    if (existing) {
      this.removePlacement(existing.id);
    }

    const placement: EditorTilePlacement = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetUrl: asset.url,
      categoryId: asset.categoryId,
      x,
      y,
      layer: this.state.activeLayer,
      scale: this.state.brushScale,
    };

    this.draft.placements.push(placement);
    await this.createDisplay(placement, asset);
  }

  eraseAt(worldX: number, worldY: number): void {
    const x = snap(worldX, this.draft.tileSize);
    const y = snap(worldY, this.draft.tileSize);
    const placement = this.findPlacementAt(x, y, this.state.activeLayer);

    if (placement) {
      this.removePlacement(placement.id);
    }
  }

  async loadDraft(draft: EditorMapDraft): Promise<void> {
    this.clear();
    this.draft.name = draft.name;
    this.draft.placements.push(...draft.placements.map((placement) => ({
      ...placement,
      scale: normalizePlacementScale(placement.scale),
    })));

    for (const placement of this.draft.placements) {
      const asset = findAssetById(placement.assetId) ?? {
        id: placement.assetId,
        name: placement.assetId,
        categoryId: placement.categoryId,
        url: placement.assetUrl,
      };
      await this.createDisplay(placement, asset);
    }
  }

  clear(): void {
    for (const display of this.displays.values()) {
      display.destroy();
    }

    this.displays.clear();
    this.draft.placements.length = 0;
  }

  private async createDisplay(placement: EditorTilePlacement, asset: EditorTilesetAsset): Promise<void> {
    const texture = await this.loadTexture(asset.url);
    const display = texture
      ? this.createSprite(placement, asset, texture)
      : this.createFallbackTile(placement, asset);

    this.displays.set(placement.id, display);
    this.layer.addChild(display);
  }

  private createSprite(
    placement: EditorTilePlacement,
    asset: EditorTilesetAsset,
    texture: Texture,
  ): Sprite {
    const sprite = new Sprite(texture);
    const scale = normalizePlacementScale(placement.scale);

    sprite.label = `editor-tile:${placement.id}`;
    sprite.x = placement.x;
    sprite.y = placement.y;

    sprite.width = (asset.tileWidth ?? texture.width) * scale;
    sprite.height = (asset.tileHeight ?? texture.height) * scale;

    sprite.zIndex = layerZIndex(placement.layer);

    return sprite;
  }

  private createFallbackTile(placement: EditorTilePlacement, asset: EditorTilesetAsset): Graphics {
    const tile = new Graphics();
    const scale = normalizePlacementScale(placement.scale);
    tile.label = `editor-fallback-tile:${placement.id}`;
    tile.x = placement.x;
    tile.y = placement.y;
    tile.zIndex = layerZIndex(placement.layer);

    const width = (asset.tileWidth || this.draft.tileSize) * scale;
    const height = (asset.tileHeight || this.draft.tileSize) * scale;

    tile
      .rect(0, 0, width, height)
      .fill({ color: fallbackColor(asset.categoryId), alpha: 0.72 })
      .rect(0, 0, width, height)
      .stroke({ color: 0xffd166, alpha: 0.95, width: 1 });

    return tile;
  }

  private loadTexture(url: string): Promise<Texture | null> {
    let promise = this.textureCache.get(url);
    if (!promise) {
      promise = Assets.load<Texture>(url).catch((error: unknown) => {
        console.warn(`[MapEditor] Failed to load tile asset: ${url}`, error);
        return null;
      });
      this.textureCache.set(url, promise);
    }
    return promise;
  }

  private findPlacementAt(x: number, y: number, layer: EditorTilePlacement['layer']): EditorTilePlacement | null {
    return this.draft.placements.find(
      (placement) => placement.x === x && placement.y === y && placement.layer === layer,
    ) ?? null;
  }

  private removePlacement(id: string): void {
    const index = this.draft.placements.findIndex((placement) => placement.id === id);
    if (index >= 0) {
      this.draft.placements.splice(index, 1);
    }

    const display = this.displays.get(id);
    if (display) {
      this.displays.delete(id);
      display.destroy();
    }
  }
}

function snap(value: number, size: number): number {
  return Math.floor(value / size) * size;
}

function normalizePlacementScale(scale: number | undefined): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.1, scale ?? 1);
}

function layerZIndex(layer: EditorTilePlacement['layer']): number {
  switch (layer) {
    case 'ground':
      return 1;
    case 'object':
      return 10;
    case 'collision':
      return 100;
  }
}

function fallbackColor(categoryId: string): number {
  switch (categoryId) {
    case 'nature':
      return 0x47b881;
    case 'buildings':
      return 0xc69054;
    default:
      return 0x55d6be;
  }
}

function findAssetById(assetId: string): EditorTilesetAsset | null {
  for (const category of TILESET_CATEGORIES) {
    const asset = category.assets.find((item) => item.id === assetId);
    if (asset) return asset;
  }

  return null;
}
