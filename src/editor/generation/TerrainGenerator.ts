import type { EditorSourceRect, EditorTerrainRuleSet, EditorTerrainTileRole, EditorTerrainTileRule, EditorTilePlacement, EditorTilesetAsset } from '../types';

export type TerrainGenerationShape = 'rect' | 'island';

export type BasicTerrainGenerationOptions = {
  tilesets: EditorTilesetAsset[];
  width: number;
  height: number;
  gridSize: number;
  terrainRuleSet?: EditorTerrainRuleSet;
  shape?: TerrainGenerationShape;
  seed?: number;
  maxPlacements?: number;
};

type TerrainTile = {
  asset: EditorTilesetAsset;
  sourceRect: EditorSourceRect;
  scale: number;
  weight: number;
  rule?: EditorTerrainTileRule;
};

type TerrainTilePool = {
  all: TerrainTile[];
  byRole: Map<EditorTerrainTileRole, TerrainTile[]>;
};

type TerrainMask = {
  columns: number;
  rows: number;
  isFilled(column: number, row: number): boolean;
};

const DEFAULT_MAX_PLACEMENTS = 12000;
const DEFAULT_TERRAIN_RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';
const DEFAULT_TERRAIN_SHAPE_KEY = 'dalworld:editor-terrain-shape:dalworld-map';
const DEFAULT_TERRAIN_SEED_KEY = 'dalworld:editor-terrain-seed:dalworld-map';
const BASE_DECORATIVE_CHANCE = 0.04;
const DECORATIVE_CHANCE_PER_WEIGHT = 0.01;
const MAX_DECORATIVE_CHANCE = 0.35;

export async function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredTerrainSeed());
  const terrainRuleSet = options.terrainRuleSet ?? readStoredTerrainRuleSet();
  const pool = await collectTerrainTilePool(options.tilesets, gridSize, terrainRuleSet);
  if (pool.all.length === 0) return [];

  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const maxPlacements = normalizePositiveInteger(options.maxPlacements, DEFAULT_MAX_PLACEMENTS);
  const columns = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const mask = createTerrainMask(options.shape ?? readStoredTerrainShape(), columns, rows, seed);
  const roleCounters = new Map<EditorTerrainTileRole | 'all', number>();
  const placements: EditorTilePlacement[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (placements.length >= maxPlacements) return placements;
      if (!mask.isFilled(column, row)) continue;
      const role = resolveRoleFromMask(mask, column, row);
      const tile = pickTileForRole(pool, role, column, row, seed, roleCounters);
      placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));

      const decorative = pickDecorativeTile(pool, column, row, seed);
      if (decorative && placements.length < maxPlacements) {
        placements.push(createGroundPlacement(decorative, column * gridSize, row * gridSize));
      }
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
    const weight = normalizeWeight(rule.weight);
    if (weight <= 0) continue;
    const key = `${rule.id}:${rule.scale ?? 1}:${weight}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      asset,
      sourceRect: { ...rule.sourceRect },
      scale: normalizeScale(rule.scale),
      weight,
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
        result.push({ asset, sourceRect, scale: 1, weight: 1 });
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

function createTerrainMask(shape: TerrainGenerationShape, columns: number, rows: number, seed: number): TerrainMask {
  if (shape === 'island') return createIslandMask(columns, rows, seed);
  return createFilledRectMask(columns, rows);
}

function createFilledRectMask(columns: number, rows: number): TerrainMask {
  return {
    columns,
    rows,
    isFilled(column: number, row: number): boolean {
      return column >= 0 && column < columns && row >= 0 && row < rows;
    },
  };
}

function createIslandMask(columns: number, rows: number, seed: number): TerrainMask {
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const radiusX = Math.max(1, columns * 0.46);
  const radiusY = Math.max(1, rows * 0.46);
  const values = new Set<string>();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column - centerX) / radiusX;
      const ny = (row - centerY) / radiusY;
      const distance = Math.sqrt(nx * nx + ny * ny);
      const wobble = seededNoise(column, row, seed) * 0.18 + seededNoise(column * 2 + 7, row * 2 + 11, seed + 97) * 0.08;
      if (distance <= 0.92 + wobble) values.add(`${column}:${row}`);
    }
  }

  fillTinyHoles(values, columns, rows);

  return {
    columns,
    rows,
    isFilled(column: number, row: number): boolean {
      return column >= 0 && column < columns && row >= 0 && row < rows && values.has(`${column}:${row}`);
    },
  };
}

function fillTinyHoles(values: Set<string>, columns: number, rows: number): void {
  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      const key = `${column}:${row}`;
      if (values.has(key)) continue;
      const neighbors = [
        values.has(`${column}:${row - 1}`),
        values.has(`${column}:${row + 1}`),
        values.has(`${column - 1}:${row}`),
        values.has(`${column + 1}:${row}`),
      ].filter(Boolean).length;
      if (neighbors >= 3) values.add(key);
    }
  }
}

function resolveRoleFromMask(mask: TerrainMask, column: number, row: number): EditorTerrainTileRole {
  const top = mask.isFilled(column, row - 1);
  const bottom = mask.isFilled(column, row + 1);
  const left = mask.isFilled(column - 1, row);
  const right = mask.isFilled(column + 1, row);

  if (!top && !left) return 'outerTopLeft';
  if (!top && !right) return 'outerTopRight';
  if (!bottom && !left) return 'outerBottomLeft';
  if (!bottom && !right) return 'outerBottomRight';
  if (!top) return 'edgeTop';
  if (!bottom) return 'edgeBottom';
  if (!left) return 'edgeLeft';
  if (!right) return 'edgeRight';

  const topLeft = mask.isFilled(column - 1, row - 1);
  const topRight = mask.isFilled(column + 1, row - 1);
  const bottomLeft = mask.isFilled(column - 1, row + 1);
  const bottomRight = mask.isFilled(column + 1, row + 1);

  if (!topLeft) return 'innerTopLeft';
  if (!topRight) return 'innerTopRight';
  if (!bottomLeft) return 'innerBottomLeft';
  if (!bottomRight) return 'innerBottomRight';

  return 'center';
}

function pickTileForRole(
  pool: TerrainTilePool,
  role: EditorTerrainTileRole,
  column: number,
  row: number,
  seed: number,
  counters: Map<EditorTerrainTileRole | 'all', number>,
): TerrainTile {
  const candidates = pool.byRole.get(role)
    ?? pool.byRole.get('center')
    ?? pool.all;
  const counterKey = pool.byRole.has(role) ? role : pool.byRole.has('center') ? 'center' : 'all';
  const index = counters.get(counterKey) ?? 0;
  counters.set(counterKey, index + 1);
  return pickWeightedTile(candidates, column, row, seed, index);
}

function pickDecorativeTile(pool: TerrainTilePool, column: number, row: number, seed: number): TerrainTile | null {
  const candidates = pool.byRole.get('decorative');
  if (!candidates || candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, tile) => sum + tile.weight, 0);
  if (totalWeight <= 0) return null;
  const chance = seededNoise(column * 19 + 3, row * 23 + 5, seed + 193) * 0.5 + 0.5;
  const threshold = Math.min(MAX_DECORATIVE_CHANCE, BASE_DECORATIVE_CHANCE + totalWeight * DECORATIVE_CHANCE_PER_WEIGHT);
  if (chance > threshold) return null;
  return pickWeightedTile(candidates, column + 101, row + 203, seed + 389, 0);
}

function pickWeightedTile(candidates: TerrainTile[], column: number, row: number, seed: number, salt: number): TerrainTile {
  const totalWeight = candidates.reduce((sum, tile) => sum + tile.weight, 0);
  if (totalWeight <= 0) return candidates[0];
  const roll = (seededNoise(column * 31 + salt * 17, row * 37 + salt * 13, seed + 541) * 0.5 + 0.5) * totalWeight;
  let cursor = 0;
  for (const tile of candidates) {
    cursor += tile.weight;
    if (roll <= cursor) return tile;
  }
  return candidates[candidates.length - 1];
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

function readStoredTerrainShape(): TerrainGenerationShape {
  try {
    return window.localStorage.getItem(DEFAULT_TERRAIN_SHAPE_KEY) === 'island' ? 'island' : 'rect';
  } catch {
    return 'rect';
  }
}

function readStoredTerrainSeed(): number {
  try {
    return normalizeSeed(Number(window.localStorage.getItem(DEFAULT_TERRAIN_SEED_KEY) ?? '1'));
  } catch {
    return 1;
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

function seededNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function normalizeGridSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 32;
  return Math.max(1, Math.min(256, Math.round(value)));
}

function normalizeScale(value: number | undefined): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return 1;
  return Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10));
}

function normalizeWeight(value: number | undefined): number {
  if (!Number.isFinite(value) || (value as number) < 0) return 1;
  return Math.max(0, Math.min(100, Math.round(value as number)));
}

function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(999_999_999, Math.round(value)));
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value as number));
}
