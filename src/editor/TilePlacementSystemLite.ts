import { Assets, Container, Graphics, Rectangle, SCALE_MODES, Sprite, Texture, type Texture as PixiTexture } from 'pixi.js';
import type { EditorMapDraft, EditorPlacementGameplay, EditorSourceRect, EditorTilePlacement, EditorTilesetAsset } from './types';
import type { EditorState } from './EditorState';

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
    return cloneDraft({
      ...this.draft,
      tileSize: this.state.gridSize,
    });
  }

  pickAt(worldX: number, worldY: number): EditorTilePlacement | null {
    const picked = this.findTopPlacementAt(worldX, worldY, true);
    return picked ? clonePlacement(picked) : null;
  }

  async placeAt(worldX: number, worldY: number): Promise<void> {
    if (this.state.mode === 'picker') {
      const picked = this.findTopPlacementAt(worldX, worldY, true);
      if (picked) {
        this.state.setLayer(picked.layer);
        this.state.setBrush({ asset: assetFromPlacement(picked, this.state.gridSize), sourceRect: picked.sourceRect });
      }
      return;
    }

    if (this.state.mode === 'erase') {
      this.eraseAt(worldX, worldY);
      return;
    }

    const brush = this.state.selectedBrush;
    if (!brush) return;

    const placement = createPlacement({
      brush,
      activeLayer: this.state.activeLayer,
      gridSize: this.state.gridSize,
      brushScale: this.state.brushScale,
      transparentBlack: this.state.transparentBlack,
      worldX,
      worldY,
    });

    this.upsertPlacement(placement);
    await this.createDisplay(placement, brush.asset);
  }

  async fillAll(options: EditorFillOptions): Promise<void> {
    await this.fillGrid(options, () => true);
  }

  async fillRandom(options: EditorRandomFillOptions): Promise<void> {
    const chance = clamp(options.chancePercent, 0, 100) / 100;
    await this.fillGrid(options, () => Math.random() < chance);
  }

  eraseAt(worldX: number, worldY: number): void {
    const picked = this.findTopPlacementAt(worldX, worldY, true);
    if (picked) this.removePlacement(picked.id);
  }

  async loadDraft(draft: EditorMapDraft): Promise<void> {
    this.clear();
    this.draft.name = draft.name;
    this.draft.tileSize = draft.tileSize || this.draft.tileSize;
    this.draft.worldMap = draft.worldMap;
    this.draft.placements.push(...draft.placements.map((placement) => clonePlacement(placement)));

    for (const placement of this.draft.placements) {
      await this.createDisplay(placement, assetFromPlacement(placement, this.state.gridSize));
    }
  }

  async replaceDraft(draft: EditorMapDraft): Promise<void> {
    await this.loadDraft(draft);
  }

  clear(): void {
    for (const display of this.displays.values()) display.destroy();
    this.displays.clear();
    this.draft.placements.length = 0;
  }

  private async fillGrid(options: EditorFillOptions, shouldPlace: (x: number, y: number) => boolean): Promise<void> {
    const brush = this.state.selectedBrush;
    if (!brush) return;

    for (let y = 0; y < options.height; y += this.state.gridSize) {
      for (let x = 0; x < options.width; x += this.state.gridSize) {
        if (!shouldPlace(x, y)) continue;
        const placement = createPlacement({
          brush,
          activeLayer: this.state.activeLayer,
          gridSize: this.state.gridSize,
          brushScale: this.state.brushScale,
          transparentBlack: this.state.transparentBlack,
          worldX: x,
          worldY: y,
        });
        this.upsertPlacement(placement);
        await this.createDisplay(placement, brush.asset);
      }
    }
  }

  private upsertPlacement(placement: EditorTilePlacement): void {
    if (!placement.transparentBlack) {
      const existing = this.draft.placements.find((item) => item.x === placement.x && item.y === placement.y && item.layer === placement.layer);
      if (existing) this.removePlacement(existing.id);
    }
    this.draft.placements.push(placement);
  }

  private async createDisplay(placement: EditorTilePlacement, asset: EditorTilesetAsset): Promise<void> {
    const display = await this.createPlacedDisplay(placement, asset);
    display.zIndex = layerSortValue(placement);
    this.displays.set(placement.id, display);
    this.layer.addChild(display);
  }

  private async createPlacedDisplay(placement: EditorTilePlacement, asset: EditorTilesetAsset): Promise<PlacedDisplay> {
    if (placement.layer === 'collision') return createCollisionDisplay(placement, this.state.gridSize);
    if (asset.solidColor !== undefined || placement.solidColor !== undefined || asset.url.startsWith('solid://')) {
      return createSolidDisplay(placement, asset, this.state.gridSize);
    }

    const texture = await this.loadTexture(asset.url);
    if (!texture) return createSolidDisplay(placement, asset, this.state.gridSize);

    const sourceRect = placement.sourceRect ? clampSourceRect(placement.sourceRect, texture) : undefined;
    const renderTexture = sourceRect ? new Texture({ source: texture.source, frame: new Rectangle(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height) }) : texture;
    renderTexture.source.scaleMode = SCALE_MODES.NEAREST;

    const sprite = new Sprite(renderTexture);
    const scale = placement.scale || 1;
    sprite.x = placement.x;
    sprite.y = placement.y;
    sprite.roundPixels = true;
    sprite.alpha = 1;
    sprite.scale.set(((placement.displayWidth ?? renderTexture.width) / renderTexture.width) * scale, ((placement.displayHeight ?? renderTexture.height) / renderTexture.height) * scale);
    return sprite;
  }

  private loadTexture(url: string): Promise<PixiTexture | null> {
    let cached = this.textureCache.get(url);
    if (!cached) {
      cached = Assets.load<PixiTexture>(url).then((texture) => {
        texture.source.scaleMode = SCALE_MODES.NEAREST;
        return texture;
      }).catch(() => null);
      this.textureCache.set(url, cached);
    }
    return cached;
  }

  private findTopPlacementAt(worldX: number, worldY: number, excludeEditorBase: boolean): EditorTilePlacement | null {
    return this.draft.placements
      .filter((placement) => {
        if (excludeEditorBase && placement.id === 'editor-black-base') return false;
        const scale = placement.scale || 1;
        const width = (placement.displayWidth ?? placement.sourceRect?.width ?? this.state.gridSize) * scale;
        const height = (placement.displayHeight ?? placement.sourceRect?.height ?? this.state.gridSize) * scale;
        return worldX >= placement.x && worldY >= placement.y && worldX < placement.x + width && worldY < placement.y + height;
      })
      .sort((a, b) => layerSortValue(b) - layerSortValue(a))[0] ?? null;
  }

  private removePlacement(id: string): void {
    const index = this.draft.placements.findIndex((placement) => placement.id === id);
    if (index >= 0) this.draft.placements.splice(index, 1);

    const display = this.displays.get(id);
    if (display) {
      this.displays.delete(id);
      display.destroy();
    }
  }
}

function createPlacement(options: {
  brush: { asset: EditorTilesetAsset; sourceRect?: EditorSourceRect };
  activeLayer: EditorTilePlacement['layer'];
  gridSize: number;
  brushScale: number;
  transparentBlack: boolean;
  worldX: number;
  worldY: number;
}): EditorTilePlacement {
  const isCollision = options.activeLayer === 'collision';
  const asset = options.brush.asset;
  const sourceRect = isCollision
    ? { x: 0, y: 0, width: options.gridSize, height: options.gridSize }
    : options.brush.sourceRect ? { ...options.brush.sourceRect } : undefined;

  return {
    id: crypto.randomUUID(),
    assetId: isCollision ? 'editor-collision-cell' : asset.id,
    assetUrl: isCollision ? 'editor://collision-cell' : asset.url,
    categoryId: isCollision ? 'editor' : asset.categoryId,
    x: snap(options.worldX, options.gridSize),
    y: snap(options.worldY, options.gridSize),
    layer: options.activeLayer,
    scale: isCollision ? 1 : options.brushScale,
    displayWidth: isCollision ? options.gridSize : asset.tileWidth ?? options.gridSize,
    displayHeight: isCollision ? options.gridSize : asset.tileHeight ?? options.gridSize,
    sourceRect,
    solidColor: isCollision ? undefined : asset.solidColor,
    transparentBlack: !isCollision && asset.solidColor === undefined && options.transparentBlack,
    gameplay: isCollision ? undefined : inferGameplay(asset),
  };
}

function createSolidDisplay(placement: EditorTilePlacement, asset: EditorTilesetAsset, gridSize: number): Graphics {
  const tile = new Graphics();
  const scale = placement.scale || 1;
  const width = (placement.displayWidth ?? asset.tileWidth ?? gridSize) * scale;
  const height = (placement.displayHeight ?? asset.tileHeight ?? gridSize) * scale;
  tile.x = placement.x;
  tile.y = placement.y;
  tile.rect(0, 0, width, height).fill({ color: placement.solidColor ?? asset.solidColor ?? fallbackColor(asset.categoryId), alpha: 1 });
  return tile;
}

function createCollisionDisplay(placement: EditorTilePlacement, gridSize: number): Graphics {
  const tile = new Graphics();
  const width = placement.displayWidth ?? gridSize;
  const height = placement.displayHeight ?? gridSize;
  tile.x = placement.x;
  tile.y = placement.y;
  tile.rect(0, 0, width, height).fill({ color: 0xef476f, alpha: 0.36 }).rect(0, 0, width, height).stroke({ color: 0xff2d55, alpha: 0.9, width: 1 });
  return tile;
}

function assetFromPlacement(placement: EditorTilePlacement, gridSize: number): EditorTilesetAsset {
  return {
    id: placement.assetId,
    name: placement.assetId,
    categoryId: placement.categoryId,
    url: placement.assetUrl,
    tileWidth: placement.displayWidth ?? gridSize,
    tileHeight: placement.displayHeight ?? gridSize,
    solidColor: placement.solidColor,
  };
}

function cloneDraft(draft: EditorMapDraft): EditorMapDraft {
  return {
    ...draft,
    worldMap: draft.worldMap ? {
      ...draft.worldMap,
      current: { ...draft.worldMap.current },
      cells: draft.worldMap.cells.map((cell) => ({ ...cell })),
      monsterSpawnRules: draft.worldMap.monsterSpawnRules?.map((rule) => ({ ...rule, spec: rule.spec ? { ...rule.spec } : undefined })),
      itemOverrides: draft.worldMap.itemOverrides?.map((override) => ({ ...override, fields: override.fields ? { ...override.fields } : undefined })),
    } : undefined,
    placements: draft.placements.map((placement) => clonePlacement(placement)),
  };
}

function clonePlacement(placement: EditorTilePlacement): EditorTilePlacement {
  return {
    ...placement,
    sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
    gameplay: placement.gameplay ? { ...placement.gameplay } : undefined,
  };
}

function inferGameplay(asset: EditorTilesetAsset): EditorPlacementGameplay | undefined {
  if (asset.gameplayDefaults) return { ...asset.gameplayDefaults };
  const filename = asset.url.split('/').pop()?.toLowerCase() ?? '';
  if (filename.startsWith('rock')) return { kind: 'resource', resourceType: 'stone', blocksMovement: true, maxHp: 100, respawnMs: 35_000 };
  if (filename.startsWith('tree')) return { kind: 'resource', resourceType: 'tree', blocksMovement: true, maxHp: 75, respawnMs: 25_000 };
  return undefined;
}

function clampSourceRect(sourceRect: EditorSourceRect, texture: PixiTexture): EditorSourceRect {
  const x = clamp(sourceRect.x, 0, Math.max(0, Math.floor(texture.width) - 1));
  const y = clamp(sourceRect.y, 0, Math.max(0, Math.floor(texture.height) - 1));
  const width = clamp(sourceRect.width, 1, Math.max(1, Math.floor(texture.width) - x));
  const height = clamp(sourceRect.height, 1, Math.max(1, Math.floor(texture.height) - y));
  return { x, y, width, height };
}

function layerSortValue(placement: EditorTilePlacement): number {
  const base = placement.layer === 'collision' ? 100 : placement.layer === 'object' ? 10 : 1;
  const overlay = placement.transparentBlack ? 0.5 : 0;
  return base + overlay + placement.y / 1000;
}

function snap(value: number, size: number): number {
  return Math.floor(value / size) * size;
}

function fallbackColor(categoryId: string): number {
  switch (categoryId) {
    case 'nature': return 0x47b881;
    case 'buildings': return 0xc69054;
    case 'monsters': return 0x7bdff2;
    default: return 0x55d6be;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
