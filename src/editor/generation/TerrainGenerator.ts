import type { EditorSourceRect, EditorTerrainRuleSet, EditorTerrainTileRole, EditorTerrainTileRule, EditorTilePlacement, EditorTilesetAsset } from '../types';

export type BasicTerrainGenerationOptions = {
  tilesets: EditorTilesetAsset[];
  width: number;
  height: number;
  gridSize: number;
  terrainRuleSet?: EditorTerrainRuleSet;
  maxPlacements?: number;
};

type TerrainTile = {
  asset: EditorTilesetAsset;
  sourceRect: EditorSourceRect;
  scale: number;
  rule?: EditorTerrainTileRule;
};

type TerrainTilePool = {
  all: TerrainTile[];
  byRole: Map<EditorTerrainTileRole, TerrainTile[]>;
};

const DEFAULT_MAX_PLACEMENTS = 12000;
const DEFAULT_TERRAIN_RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';

export async function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const gridSize = normalizeGridSize(options.gridSize);
  const terrainRuleSet = options.terrainRuleSet ?? readStoredTerrainRuleSet();
  const pool = await collectTerrainTilePool(options.tilesets, gridSize, terrainRuleSet);
  if (pool.all.length === 0) return [];

  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const maxPlacements = normalizePositiveInteger(options.maxPlacements, DEFAULT_MAX_PLACEMENTS);
  const columns = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const roleCounters = new Map<EditorTerrainTileRole | 'all', number>();
  const placements: EditorTilePlacement[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (placements.length >= maxPlacements) return placements;
      const role = getRectangularRole(column, row, columns, rows);
      const tile = pickTileForRole(pool, role, roleCounters);
      placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
    }
  }

  return placements;
}

async function collectTerrainTilePool(
  tilesets: EditorTilesetAsset[],
  gridSize: number,
  terrainRuleSet: EditorTerrainRuleSet | undefined,
): Promise<TerrainTilePool> {
  const ruleTiles = collectRuleTerrainTiles(tilesets, terrainRuleSet);
  if (ruleTiles.length > 0) return createTilePool(ruleTiles);
  return createTilePool(await collectFullTilesetTerrainTiles(tilesets, gridSize));
}

function collectRuleTerrainTiles(
  tilesets: EditorTilesetAsset[],
  terrainRuleSet: EditorTerrainRuleSet | undefined,
): TerrainTile[] {
  if (!terrainRuleSet || terrainRuleSet.rules.length === 0) return [];

  const tilesetByKey = new Map<string, EditorTilesetAsset>();
  for (const asset of tilesets) {
    tilesetByKey.set(createTilesetKey(asset.id, asset.url), asset);
  }

  return buildRuleTerrainTiles(tilesetByKey, terrainRuleSet.rules);
}

function buildRuleTerrainTiles(
  tilesetByKey: Map<string, EditorTilesetAsset>,
  rules: EditorTerrainTileRule[],
): TerrainTile[] {
  const result: TerrainTile[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    const asset = tilesetByKey.get(createTilesetKey(rule.tilesetId, rule.tilesetUrl));
    if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue;
    const key = `${rule.id}:${rule.scale ?? 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      asset,
      sourceRect: { ...rule.sourceRect },
      scale: normalizeScale(rule.scale),
      rule,
    });
  }

  return result;
}

async function collectFullTilesetTerrainTiles(tilesets: EditorTilesetAsset[], gridSize: number): Promise<TerrainTile[]> {
  const result: TerrainTile[] = [];
  const seen = new Set<string>();

  for (const asset of tilesets) {
    if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue;
    const size = await loadImageSize(asset.url);
    if (!size) continue;

    const tileWidth = asset.tileWidth ?? gridSize;
    const tileHeight = asset.tileHeight ?? gridSize;
    const stepX = Math.max(1, Math.round(tileWidth));
    const stepY = Math.max(1, Math.round(tileHeight));

    for (let y = 0; y + stepY <= size.height; y += stepY) {
      for (let x = 0; x + stepX <= size.width; x += stepX) {
        const sourceRect = { x, y, width: stepX, height: stepY };
        const key = JSON.stringify({ assetId: asset.id, assetUrl: asset.url, sourceRect });
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ asset, sourceRect, scale: 1 });
      }
    }
  }

  return result;
}

function createTilePool(tiles: TerrainTile[]): TerrainTilePool {
  const byRole = new Map<EditorTerrainTileRole, TerrainTile[]>();
  for (const tile of tiles) {
    const role = tile.rule?.role;
    if (!role) continue;
    const list = byRole.get(role) ?? [];
    list.push(tile);
    byRole.set(role, list);
  }
  return { all: tiles, byRole };
}

function getRectangularRole(
  column: number,
  row: number,
  columns: number,
  rows: number,
): EditorTerrainTileRole {
  const isTop = row === 0;
  const isBottom = row === rows - 1;
  const isLeft = column === 0;
  const isRight = column === columns - 1;

  if (isTop && isLeft) return 'outerTopLeft';
  if (isTop && isRight) return 'outerTopRight';
  if (isBottom && isLeft) return 'outerBottomLeft';
  if (isBottom && isRight) return 'outerBottomRight';
  if (isTop) return 'edgeTop';
  if (isBottom) return 'edgeBottom';
  if (isLeft) return 'edgeLeft';
  if (isRight) return 'edgeRight';
  return 'center';
}

function pickTileForRole(
  pool: TerrainTilePool,
  role: EditorTerrainTileRole,
  counters: Map<EditorTerrainTileRole | 'all', number>,
): TerrainTile {
  const candidates = pool.byRole.get(role)
    ?? pool.byRole.get('center')
    ?? pool.all;
  const counterKey = pool.byRole.has(role) ? role : pool.byRole.has('center') ? 'center' : 'all';
  const index = counters.get(counterKey) ?? 0;
  counters.set(counterKey, index + 1);
  return candidates[index % candidates.length];
}

function createGroundPlacement(tile: TerrainTile, x: number, y: number): EditorTilePlacement {
  const asset = tile.asset;
  const sourceRect = { ...tile.sourceRect };

  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    assetUrl: asset.url,
    categoryId: asset.categoryId,
    x,
    y,
    layer: 'ground',
    scale: tile.scale,
    displayWidth: sourceRect.width,
    displayHeight: sourceRect.height,
    sourceRect,
    solidColor: undefined,
    transparentBlack: false,
    gameplay: undefined,
  };
}

function readStoredTerrainRuleSet(): EditorTerrainRuleSet | undefined {
  try {
    const raw = window.localStorage.getItem(DEFAULT_TERRAIN_RULE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rules) || typeof parsed.updatedAt !== 'number') return undefined;
    return parsed;
  } catch (error) {
    console.warn('[TerrainGenerator] Failed to load stored terrain rules.', error);
    return undefined;
  }
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function createTilesetKey(id: string, url: string): string {
  return `${id}:${url}`;
}

function isImageAssetUrl(url: string): boolean {
  return !url.startsWith('solid://') && !url.startsWith('editor://');
}

function normalizeGridSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 32;
  return Math.max(1, Math.min(256, Math.round(value)));
}

function normalizeScale(value: number | undefined): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return 1;
  return Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10));
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value as number));
}
