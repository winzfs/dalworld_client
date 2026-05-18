import { Assets, Container, Graphics, Rectangle, SCALE_MODES, Sprite, Texture, type Texture as PixiTexture } from 'pixi.js';
import type { EditorMapDraft, EditorSourceRect, EditorTilePlacement, EditorTilesetAsset } from './types';
import { EditorState } from './EditorState';
import { TILESET_CATEGORIES } from './tilesetManifest';

export type TilePlacementSystemOptions = {
  tileSize: number;
  mapName: string;
};

export type EditorFillOptions = {
  width: number;
  height: number;
};

export type EditorRandomFillOptions = EditorFillOptions & {
  chancePercent: number;
};

type PlacedDisplay = Sprite | Graphics;

/**
 * Owns editor-only placed tile sprites and the serializable map draft.
 */
export class TilePlacementSystem {
  readonly layer = new Container();

  private readonly draft: EditorMapDraft;
  private readonly displays = new Map<string, PlacedDisplay>();
  private readonly textureCache = new Map<string, Promise<PixiTexture | null>>();

  constructor(
    private readonly state: EditorState,
    options: TilePlacementSystemOptions,
  ) {
    this.layer.label = 'editor-tile-placement-layer';
    this.layer.sortableChildren = true;
    this.draft = createEmptyDraft(options.mapName, options.tileSize);
  }

  get mapDraft(): EditorMapDraft {
    return cloneDraft({
      ...this.draft,
      tileSize: this.state.gridSize,
    });
  }

  async placeAt(worldX: number, worldY: number): Promise<void> {
    if (this.state.mode === 'erase') {
      this.eraseAt(worldX, worldY);
      return;
    }

    const placement = this.createPlacementAt(worldX, worldY);
    if (!placement) return;

    this.upsertPlacement(placement);
    await this.createDisplay(placement, this.state.selectedBrush!.asset);
  }

  async fillAll(options: EditorFillOptions): Promise<void> {
    const brush = this.state.selectedBrush;
    if (!brush) return;

    const placements = this.createGridPlacements(options, () => true);
    await this.addPlacementBatch(placements, brush.asset);
  }

  async fillRandom(options: EditorRandomFillOptions): Promise<void> {
    const brush = this.state.selectedBrush;
    if (!brush) return;

    const chance = clamp(options.chancePercent, 0, 100) / 100;
    const placements = this.createGridPlacements(options, () => Math.random() < chance);
    await this.addPlacementBatch(placements, brush.asset);
  }

  eraseAt(worldX: number, worldY: number): void {
    const x = snap(worldX, this.state.gridSize);
    const y = snap(worldY, this.state.gridSize);
    const placement = this.findPlacementAt(x, y, this.state.activeLayer);

    if (placement) {
      this.removePlacement(placement.id);
    }
  }

  async loadDraft(draft: EditorMapDraft): Promise<void> {
    this.clear();
    this.draft.name = draft.name;
    this.draft.tileSize = draft.tileSize || this.draft.tileSize;
    this.draft.worldMap = draft.worldMap;
    this.draft.placements.push(...normalizePlacements(draft.placements));

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

  async replaceDraft(draft: EditorMapDraft): Promise<void> {
    await this.loadDraft(draft);
  }

  clear(): void {
    this.destroyDisplays();
    this.draft.placements.length = 0;
  }

  private destroyDisplays(): void {
    for (const display of this.displays.values()) {
      display.destroy();
    }

    this.displays.clear();
  }

  private createPlacementAt(worldX: number, worldY: number): EditorTilePlacement | null {
    const brush = this.state.selectedBrush;
    if (!brush) return null;

    const asset = brush.asset;
    return {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetUrl: asset.url,
      categoryId: asset.categoryId,
      x: snap(worldX, this.state.gridSize),
      y: snap(worldY, this.state.gridSize),
      layer: this.state.activeLayer,
      scale: this.state.brushScale,
      sourceRect: brush.sourceRect ? { ...brush.sourceRect } : undefined,
    };
  }

  private createGridPlacements(
    options: EditorFillOptions,
    shouldPlace: (x: number, y: number) => boolean,
  ): EditorTilePlacement[] {
    const placements: EditorTilePlacement[] = [];
    const gridSize = this.state.gridSize;

    for (let y = 0; y < options.height; y += gridSize) {
      for (let x = 0; x < options.width; x += gridSize) {
        if (!shouldPlace(x, y)) continue;
        const placement = this.createPlacementAt(x, y);
        if (placement) placements.push(placement);
      }
    }

    return placements;
  }

  private async addPlacementBatch(placements: EditorTilePlacement[], asset: EditorTilesetAsset): Promise<void> {
    for (const placement of placements) {
      this.upsertPlacement(placement);
    }

    for (const placement of placements) {
      await this.createDisplay(placement, asset);
    }
  }

  private upsertPlacement(placement: EditorTilePlacement): void {
    const existing = this.findPlacementAt(placement.x, placement.y, placement.layer);
    if (existing) {
      this.removePlacement(existing.id);
    }

    this.draft.placements.push(placement);
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
    texture: PixiTexture,
  ): Sprite {
    const sourceTexture = placement.sourceRect
      ? createSlicedTexture(texture, placement.sourceRect)
      : texture;
    enforceNearestScale(sourceTexture);

    const sprite = new Sprite(sourceTexture);
    const scale = normalizePlacementScale(placement.scale);

    sprite.label = `editor-tile:${placement.id}`;
    sprite.x = placement.x;
    sprite.y = placement.y;
    sprite.roundPixels = true;

    const baseWidth = placement.sourceRect?.width ?? asset.tileWidth ?? sourceTexture.width;
    const baseHeight = placement.sourceRect?.height ?? asset.tileHeight ?? sourceTexture.height;
    sprite.scale.set(
      (baseWidth / sourceTexture.width) * scale,
      (baseHeight / sourceTexture.height) * scale,
    );

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

    const width = (placement.sourceRect?.width ?? asset.tileWidth ?? this.state.gridSize) * scale;
    const height = (placement.sourceRect?.height ?? asset.tileHeight ?? this.state.gridSize) * scale;

    tile
      .rect(0, 0, width, height)
      .fill({ color: fallbackColor(asset.categoryId), alpha: 0.72 })
      .rect(0, 0, width, height)
      .stroke({ color: 0xffd166, alpha: 0.95, width: 1 });

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

function createEmptyDraft(name: string, tileSize: number): EditorMapDraft {
  return {
    version: 1,
    name,
    tileSize,
    placements: [],
  };
}

function cloneDraft(draft: EditorMapDraft): EditorMapDraft {
  return {
    ...draft,
    worldMap: draft.worldMap ? {
      ...draft.worldMap,
      current: { ...draft.worldMap.current },
      cells: draft.worldMap.cells.map((cell) => ({ ...cell })),
    } : undefined,
    placements: draft.placements.map((placement) => ({
      ...placement,
      sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
    })),
  };
}

function normalizePlacements(placements: EditorTilePlacement[]): EditorTilePlacement[] {
  return placements.map((placement) => ({
    ...placement,
    scale: normalizePlacementScale(placement.scale),
    sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
  }));
}

function snap(value: number, size: number): number {
  return Math.floor(value / size) * size;
}

function normalizePlacementScale(scale: number | undefined): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.1, scale ?? 1);
}

function createSlicedTexture(texture: PixiTexture, sourceRect: EditorSourceRect): PixiTexture {
  const sliced = new Texture({
    source: texture.source,
    frame: new Rectangle(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height),
  });
  enforceNearestScale(sliced);
  return sliced;
}

function enforceNearestScale(texture: PixiTexture): void {
  texture.source.scaleMode = SCALE_MODES.NEAREST;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
