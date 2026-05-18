import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { EditorMapDraft, EditorTilePlacement, EditorTilesetAsset } from './types';
import { EditorState } from './EditorState';

export type TilePlacementSystemOptions = {
  tileSize: number;
  mapName: string;
};

/**
 * Owns editor-only placed tile sprites and the serializable map draft.
 */
export class TilePlacementSystem {
  readonly layer = new Container();

  private readonly draft: EditorMapDraft;
  private readonly sprites = new Map<string, Sprite>();
  private readonly textureCache = new Map<string, Promise<Texture>>();

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
    };

    this.draft.placements.push(placement);
    await this.createSprite(placement, asset);
  }

  eraseAt(worldX: number, worldY: number): void {
    const x = snap(worldX, this.draft.tileSize);
    const y = snap(worldY, this.draft.tileSize);
    const placement = this.findPlacementAt(x, y, this.state.activeLayer);

    if (placement) {
      this.removePlacement(placement.id);
    }
  }

  private async createSprite(placement: EditorTilePlacement, asset: EditorTilesetAsset): Promise<void> {
    const texture = await this.loadTexture(asset.url);
    const sprite = new Sprite(texture);

    sprite.label = `editor-tile:${placement.id}`;
    sprite.x = placement.x;
    sprite.y = placement.y;
    sprite.width = asset.tileWidth;
    sprite.height = asset.tileHeight;
    sprite.zIndex = layerZIndex(placement.layer);

    this.sprites.set(placement.id, sprite);
    this.layer.addChild(sprite);
  }

  private loadTexture(url: string): Promise<Texture> {
    let promise = this.textureCache.get(url);
    if (!promise) {
      promise = Assets.load<Texture>(url);
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

    const sprite = this.sprites.get(id);
    if (sprite) {
      this.sprites.delete(id);
      sprite.destroy();
    }
  }
}

function snap(value: number, size: number): number {
  return Math.floor(value / size) * size;
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
