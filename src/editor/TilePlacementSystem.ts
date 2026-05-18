import { Assets, Container, Graphics, Rectangle, SCALE_MODES, Sprite, Texture, type Texture as PixiTexture } from 'pixi.js';
import type { EditorMapDraft, EditorPlacementGameplay, EditorSourceRect, EditorTilePlacement, EditorTilesetAsset } from './types';
import { EditorState } from './EditorState';
import { TILESET_CATEGORIES } from './tilesetManifest';
import { createTransparentBlackTexture } from './createTransparentBlackTexture';
import { inferSpriteGameplay } from './inferSpriteGameplay';

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

export class TilePlacementSystem {
  readonly layer = new Container();

  private readonly draft: EditorMapDraft;
  private readonly displays = new Map<string, PlacedDisplay>();
  private readonly textureCache = new Map<string, Promise<PixiTexture | null>>();
  private readonly transparentTextureCache = new Map<string, Promise<PixiTexture | null>>();

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

  pickAt(worldX: number, worldY: number): EditorTilePlacement | null {
    const candidates = this.draft.placements
      .filter((placement) => containsPoint(placement, worldX, worldY, this.state.gridSize))
      .sort((a, b) => {
        const zDiff = placementZIndex(b) - placementZIndex(a);
        if (zDiff !== 0) return zDiff;
        return this.draft.placements.indexOf(b) - this.draft.placements.indexOf(a);
      });

    const picked = candidates.find((placement) => placement.assetId !== 'editor-black-base') ?? candidates[0];
    return picked ? clonePlacement(picked) : null;
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
      const asset = placement.solidColor !== undefined
        ? createSolidAsset(placement)
        : findAssetById(placement.assetId) ?? {
            id: placement.assetId,
            name: placement.assetId,
            categoryId: placement.categoryId,
            url: placement.assetUrl,
          };
      if (!placement.gameplay) {
        placement.gameplay = inferSpriteGameplay(asset);
      }
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
    const isCollision = this.state.activeLayer === 'collision';
    const gameplay = isCollision ? undefined : inferSpriteGameplay(asset);
    return {
      id: crypto.randomUUID(),
      assetId: isCollision ? 'editor-collision-cell' : asset.id,
      assetUrl: isCollision ? 'editor://collision-cell' : asset.url,
      categoryId: isCollision ? 'editor' : asset.categoryId,
      x: snap(worldX, this.state.gridSize),
      y: snap(worldY, this.state.gridSize),
      layer: this.state.activeLayer,
      scale: isCollision ? 1 : this.state.brushScale,
      sourceRect: isCollision
        ? { x: 0, y: 0, width: this.state.gridSize, height: this.state.gridSize }
        : brush.sourceRect ? { ...brush.sourceRect } : undefined,
      solidColor: isCollision ? undefined : asset.solidColor,
      transparentBlack: !isCollision && asset.solidColor === undefined && this.state.transparentBlack,
      gameplay,
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
    const existing = placement.transparentBlack
      ? this.findMatchingTransparentOverlay(placement)
      : this.findPlacementAt(placement.x, placement.y, placement.layer);

    if (existing) {
      this.removePlacement(existing.id);
    }

    this.draft.placements.push(placement);
  }

  private async createDisplay(placement: EditorTilePlacement, asset: EditorTilesetAsset): Promise<void> {
    try {
      const display = placement.layer === 'collision'
        ? this.createCollisionOverlay(placement)
        : await this.createVisualDisplay(placement, asset);

      this.displays.set(placement.id, display);
      this.layer.addChild(display);
    } catch (error) {
      console.warn('[MapEditor] Failed to render placement. Using fallback tile.', error);
      const fallback = this.createFallbackTile(placement, asset);
      this.displays.set(placement.id, fallback);
      this.layer.addChild(fallback);
    }
  }

  private async createVisualDisplay(placement: EditorTilePlacement, asset: EditorTilesetAsset): Promise<PlacedDisplay> {
    if (placement.solidColor !== undefined || asset.solidColor !== undefined) {
      return this.createSolidTile(placement, asset);
    }

    const texture = await this.loadTexture(asset.url);
    return texture
      ? await this.createSprite(placement, asset, texture)
      : this.createFallbackTile(placement, asset);
  }

  private createSolidTile(placement: EditorTilePlacement, asset: EditorTilesetAsset): Graphics {
    const tile = new Graphics();
    const scale = normalizePlacementScale(placement.scale);
    const width = (placement.sourceRect?.width ?? asset.tileWidth ?? this.state.gridSize) * scale;
    const height = (placement.sourceRect?.height ?? asset.tileHeight ?? this.state.gridSize) * scale;

    tile.label = `editor-solid-tile:${placement.id}`;
    tile.x = placement.x;
    tile.y = placement.y;
    tile.zIndex = layerZIndex(placement.layer);
    tile
      .rect(0, 0, width, height)
      .fill({ color: placement.solidColor ?? asset.solidColor ?? 0x000000, alpha: 1 });

    return tile;
  }

  private createCollisionOverlay(placement: EditorTilePlacement): Graphics {
    const overlay = new Graphics();
    const width = placement.sourceRect?.width ?? this.state.gridSize;
    const height = placement.sourceRect?.height ?? this.state.gridSize;

    overlay.label = `editor-collision:${placement.id}`;
    overlay.x = placement.x;
    overlay.y = placement.y;
    overlay.zIndex = layerZIndex('collision');
    overlay
      .rect(0, 0, width, height)
      .fill({ color: 0xef476f, alpha: 0.36 })
      .rect(0, 0, width, height)
      .stroke({ color: 0xff2d55, alpha: 0.9, width: 1 });

    return overlay;
  }

  private async createSprite(
    placement: EditorTilePlacement,
    asset: EditorTilesetAsset,
    texture: PixiTexture,
  ): Promise<Sprite> {
    const safeSourceRect = placement.sourceRect
      ? shrinkSourceRect(placement.sourceRect, texture)
      : undefined;
    const normalTexture = safeSourceRect
      ? createSlicedTexture(texture, safeSourceRect)
      : texture;
    enforceNearestScale(normalTexture);

    const sprite = new Sprite(normalTexture);
    const scale = normalizePlacementScale(placement.scale);

    sprite.label = `editor-tile:${placement.id}`;
    sprite.x = placement.x;
    sprite.y = placement.y;
    sprite.roundPixels = true;
    sprite.alpha = 1;

    const baseWidth = placement.sourceRect?.width ?? asset.tileWidth ?? normalTexture.width;
    const baseHeight = placement.sourceRect?.height ?? asset.tileHeight ?? normalTexture.height;
    sprite.scale.set(
      (baseWidth / normalTexture.width) * scale,
      (baseHeight / normalTexture.height) * scale,
    );

    sprite.zIndex = layerZIndex(placement.layer) + (placement.transparentBlack ? 0.5 : 0);

    if (placement.transparentBlack) {
      void this.loadTransparentTexture(asset.url, safeSourceRect).then((transparentTexture) => {
        const currentDisplay = this.displays.get(placement.id);
        if (!transparentTexture || currentDisplay !== sprite) return;
        enforceNearestScale(transparentTexture);
        sprite.texture = transparentTexture;
      });
    }

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
      .fill({ color: fallbackColor(asset.categoryId), alpha: 1 });

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

  private loadTransparentTexture(
    url: string,
    sourceRect: EditorSourceRect | undefined,
  ): Promise<PixiTexture | null> {
    const key = `${url}:${sourceRect ? `${sourceRect.x},${sourceRect.y},${sourceRect.width},${sourceRect.height}` : 'full'}:transparent-black`;
    let promise = this.transparentTextureCache.get(key);
    if (!promise) {
      promise = createTransparentBlackTexture(url, sourceRect)
        .catch((error: unknown) => {
          console.warn(`[MapEditor] Failed to create transparent black texture: ${url}`, error);
          return null;
        });
      this.transparentTextureCache.set(key, promise);
    }
    return promise;
  }

  private findPlacementAt(x: number, y: number, layer: EditorTilePlacement['layer']): EditorTilePlacement | null {
    return this.draft.placements.find(
      (placement) => placement.x === x && placement.y === y && placement.layer === layer,
    ) ?? null;
  }

  private findMatchingTransparentOverlay(placement: EditorTilePlacement): EditorTilePlacement | null {
    return this.draft.placements.find((existing) => (
      existing.transparentBlack === true &&
      existing.x === placement.x &&
      existing.y === placement.y &&
      existing.layer === placement.layer &&
      existing.assetId === placement.assetId &&
      sameSourceRect(existing.sourceRect, placement.sourceRect)
    )) ?? null;
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
    placements: draft.placements.map((placement) => clonePlacement(placement)),
  };
}

function clonePlacement(placement: EditorTilePlacement): EditorTilePlacement {
  return {
    ...placement,
    sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
    gameplay: placement.gameplay ? cloneGameplay(placement.gameplay) : undefined,
  };
}

function normalizePlacements(placements: EditorTilePlacement[]): EditorTilePlacement[] {
  return placements.map((placement) => ({
    ...placement,
    scale: normalizePlacementScale(placement.scale),
    sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
    gameplay: placement.gameplay ? cloneGameplay(placement.gameplay) : undefined,
  }));
}

function cloneGameplay(gameplay: EditorPlacementGameplay): EditorPlacementGameplay {
  return { ...gameplay };
}

function snap(value: number, size: number): number {
  return Math.floor(value / size) * size;
}

function containsPoint(placement: EditorTilePlacement, worldX: number, worldY: number, fallbackSize: number): boolean {
  const scale = normalizePlacementScale(placement.scale);
  const width = (placement.sourceRect?.width ?? fallbackSize) * scale;
  const height = (placement.sourceRect?.height ?? fallbackSize) * scale;

  return (
    worldX >= placement.x &&
    worldY >= placement.y &&
    worldX < placement.x + width &&
    worldY < placement.y + height
  );
}

function placementZIndex(placement: EditorTilePlacement): number {
  return layerZIndex(placement.layer) + (placement.transparentBlack ? 0.5 : 0);
}

function normalizePlacementScale(scale: number | undefined): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.1, scale ?? 1);
}

function shrinkSourceRect(sourceRect: EditorSourceRect, texture: PixiTexture): EditorSourceRect {
  const inset = sourceRect.width > 2 && sourceRect.height > 2 ? 1 : 0;
  const maxWidth = Math.max(1, Math.floor(texture.width));
  const maxHeight = Math.max(1, Math.floor(texture.height));
  const x = clamp(sourceRect.x + inset, 0, maxWidth - 1);
  const y = clamp(sourceRect.y + inset, 0, maxHeight - 1);
  const width = clamp(sourceRect.width - inset * 2, 1, maxWidth - x);
  const height = clamp(sourceRect.height - inset * 2, 1, maxHeight - y);

  return { x, y, width, height };
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

function sameSourceRect(a: EditorSourceRect | undefined, b: EditorSourceRect | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
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

function createSolidAsset(placement: EditorTilePlacement): EditorTilesetAsset {
  return {
    id: placement.assetId,
    name: placement.assetId,
    categoryId: placement.categoryId,
    url: placement.assetUrl,
    solidColor: placement.solidColor,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
