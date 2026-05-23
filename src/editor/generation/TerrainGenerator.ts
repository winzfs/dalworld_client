import type {
  EditorSourceRect,
  EditorTerrainMaterial,
  EditorTerrainMovementMode,
  EditorTerrainRuleSet,
  EditorTerrainTileRole,
  EditorTerrainTileRule,
  EditorTilePlacement,
  EditorTilesetAsset,
} from '../types';

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
  material: EditorTerrainMaterial;
  movementMode: EditorTerrainMovementMode;
  rule?: EditorTerrainTileRule;
};

type TerrainTileFamily = {
  key: string;
  material: EditorTerrainMaterial;
  movementMode: EditorTerrainMovementMode;
  tilesetId: string;
  tilesetUrl: string;
  all: TerrainTile[];
  byRole: Map<EditorTerrainTileRole, TerrainTile[]>;
  totalWeight: number;
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
const BASE_DECORATIVE_CHANCE = 0.035;
const DECORATIVE_CHANCE_PER_WEIGHT = 0.008;
const MAX_DECORATIVE_CHANCE = 0.25;

export async function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredTerrainSeed());
  const terrainRuleSet = options.terrainRuleSet ?? readStoredTerrainRuleSet();
  const families = await collectTerrainFamilies(options.tilesets, gridSize, terrainRuleSet);
  if (families.length === 0) return [];

  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const maxPlacements = normalizePositiveInteger(options.maxPlacements, DEFAULT_MAX_PLACEMENTS);
  const columns = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const shape = options.shape ?? readStoredTerrainShape();

  const baseFamily = pickBaseFamily(families, seed);
  if (!baseFamily) return [];

  const landMask = shape === 'island'
    ? createIslandLandMask(columns, rows, seed)
    : createFilledRectMask(columns, rows);
  const waterFamily = pickFamilyByMaterial(families, 'water', seed + 101);
  const roadFamily = pickFamilyByMaterial(families, 'road', seed + 211);
  const decorativeFamilies = families.filter((family) => family.byRole.has('decorative') && family.material !== 'water' && family.material !== 'road');
  const waterMask = waterFamily ? createWaterFeatureMask(columns, rows, seed + 307, landMask) : createEmptyMask(columns, rows);
  const roadMask = roadFamily ? createRoadMask(columns, rows, seed + 419, landMask, waterMask) : createEmptyMask(columns, rows);

  const placements: EditorTilePlacement[] = [];
  const baseCounters = new Map<EditorTerrainTileRole | 'all', number>();
  const waterCounters = new Map<EditorTerrainTileRole | 'all', number>();
  const roadCounters = new Map<EditorTerrainTileRole | 'all', number>();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (placements.length >= maxPlacements) return placements;
      if (!landMask.isFilled(column, row)) continue;

      const baseRole = resolveRoleFromMask(landMask, column, row);
      const baseTile = pickTileForRole(baseFamily, baseRole, column, row, seed, baseCounters);
      placements.push(createGroundPlacement(baseTile, column * gridSize, row * gridSize));
    }
  }

  if (waterFamily) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (placements.length >= maxPlacements) return placements;
        if (!waterMask.isFilled(column, row)) continue;
        const role = resolveRoleFromMask(waterMask, column, row);
        const tile = pickTileForRole(waterFamily, role, column, row, seed + 307, waterCounters);
        placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
      }
    }
  }

  if (roadFamily) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (placements.length >= maxPlacements) return placements;
        if (!roadMask.isFilled(column, row)) continue;
        const role = resolveRoleFromMask(roadMask, column, row);
        const tile = pickTileForRole(roadFamily, role, column, row, seed + 419, roadCounters);
        placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
      }
    }
  }

  if (decorativeFamilies.length > 0) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (placements.length >= maxPlacements) return placements;
        if (!landMask.isFilled(column, row) || waterMask.isFilled(column, row) || roadMask.isFilled(column, row)) continue;
        const decorative = pickDecorativeTile(decorativeFamilies, column, row, seed + 613);
        if (decorative) placements.push(createGroundPlacement(decorative, column * gridSize, row * gridSize));
      }
    }
  }

  return placements;
}

async function collectTerrainFamilies(
  tilesets: EditorTilesetAsset[],
  gridSize: number,
  terrainRuleSet: EditorTerrainRuleSet | undefined,
): Promise<TerrainTileFamily[]> {
  const ruleTiles = collectRuleTerrainTiles(tilesets, terrainRuleSet);
  if (ruleTiles.length > 0) return createFamilies(ruleTiles);
  return createFamilies(await collectFullTilesetTerrainTiles(tilesets, gridSize));
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
    const material = rule.material ?? 'grass';
    const movementMode = rule.movementMode ?? getDefaultMovementMode(material);
    const key = `${rule.id}:${rule.scale ?? 1}:${weight}:${material}:${movementMode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      asset,
      sourceRect: { ...rule.sourceRect },
      scale: normalizeScale(rule.scale),
      weight,
      material,
      movementMode,
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
        result.push({ asset, sourceRect, scale: 1, weight: 1, material: 'grass', movementMode: 'passable' });
      }
    }
  }

  return result;
}

function createFamilies(tiles: TerrainTile[]): TerrainTileFamily[] {
  const familyMap = new Map<string, TerrainTileFamily>();

  for (const tile of tiles) {
    const key = createFamilyKey(tile);
    let family = familyMap.get(key);
    if (!family) {
      family = {
        key,
        material: tile.material,
        movementMode: tile.movementMode,
        tilesetId: tile.asset.id,
        tilesetUrl: tile.asset.url,
        all: [],
        byRole: new Map<EditorTerrainTileRole, TerrainTile[]>(),
        totalWeight: 0,
      };
      familyMap.set(key, family);
    }

    family.all.push(tile);
    family.totalWeight += tile.weight;
    const role = tile.rule?.role;
    if (role) {
      const list = family.byRole.get(role) ?? [];
      list.push(tile);
      family.byRole.set(role, list);
    }
  }

  return [...familyMap.values()].filter((family) => family.all.length > 0);
}

function createFamilyKey(tile: TerrainTile): string {
  return `${tile.asset.id}:${tile.asset.url}:${tile.material}:${tile.movementMode}`;
}

function pickBaseFamily(families: TerrainTileFamily[], seed: number): TerrainTileFamily | undefined {
  const baseCandidates = families.filter((family) => family.material === 'grass' || family.material === 'dirt' || family.material === 'sand');
  if (baseCandidates.length > 0) return pickWeightedFamily(baseCandidates, seed, 0);
  return pickWeightedFamily(families.filter((family) => family.material !== 'water' && family.material !== 'road'), seed, 0)
    ?? families[0];
}

function pickFamilyByMaterial(
  families: TerrainTileFamily[],
  material: EditorTerrainMaterial,
  seed: number,
): TerrainTileFamily | undefined {
  return pickWeightedFamily(families.filter((family) => family.material === material), seed, 0);
}

function pickWeightedFamily(families: TerrainTileFamily[], seed: number, salt: number): TerrainTileFamily | undefined {
  if (families.length === 0) return undefined;
  const total = families.reduce((sum, family) => sum + Math.max(1, family.totalWeight), 0);
  const roll = (seededNoise(seed + salt * 17, seed * 3 + salt * 29, seed + 11) * 0.5 + 0.5) * total;
  let cursor = 0;
  for (const family of families) {
    cursor += Math.max(1, family.totalWeight);
    if (roll <= cursor) return family;
  }
  return families[families.length - 1];
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

function createEmptyMask(columns: number, rows: number): TerrainMask {
  return {
    columns,
    rows,
    isFilled(): boolean {
      return false;
    },
  };
}

function createIslandLandMask(columns: number, rows: number, seed: number): TerrainMask {
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const radiusX = Math.max(1, columns * 0.47);
  const radiusY = Math.max(1, rows * 0.47);
  const values = new Set<string>();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column - centerX) / radiusX;
      const ny = (row - centerY) / radiusY;
      const distance = Math.sqrt(nx * nx + ny * ny);
      const wobble = seededNoise(column, row, seed) * 0.08 + seededNoise(column * 2 + 7, row * 2 + 11, seed + 97) * 0.04;
      if (distance <= 0.96 + wobble) values.add(`${column}:${row}`);
    }
  }

  smoothMask(values, columns, rows, 2);
  return setMask(columns, rows, values);
}

function createWaterFeatureMask(columns: number, rows: number, seed: number, landMask: TerrainMask): TerrainMask {
  const values = new Set<string>();
  const horizontal = seededNoise(seed, seed + 13, seed + 29) > 0;
  const riverWidth = Math.max(1, Math.round(Math.min(columns, rows) * 0.035));
  const lakeCount = Math.min(2, Math.max(0, Math.floor(Math.min(columns, rows) / 48)));

  for (let i = 0; i < (horizontal ? columns : rows); i += 1) {
    const t = i / Math.max(1, (horizontal ? columns : rows) - 1);
    const bend = Math.sin(t * Math.PI * 2 + seed * 0.01) * 0.16 + Math.sin(t * Math.PI * 5 + seed * 0.017) * 0.06;
    const center = Math.round((horizontal ? rows : columns) * (0.5 + bend));
    for (let offset = -riverWidth; offset <= riverWidth; offset += 1) {
      const column = horizontal ? i : center + offset;
      const row = horizontal ? center + offset : i;
      paintDisc(values, landMask, column, row, riverWidth);
    }
  }

  for (let lake = 0; lake < lakeCount; lake += 1) {
    const cx = Math.round(columns * (0.25 + (seededNoise(seed, lake + 31, seed + lake) * 0.5 + 0.5) * 0.5));
    const cy = Math.round(rows * (0.25 + (seededNoise(seed + 43, lake + 71, seed) * 0.5 + 0.5) * 0.5));
    const radius = Math.max(2, Math.round(Math.min(columns, rows) * (0.035 + lake * 0.012)));
    paintDisc(values, landMask, cx, cy, radius);
  }

  smoothMask(values, columns, rows, 1);
  return setMask(columns, rows, values);
}

function createRoadMask(columns: number, rows: number, seed: number, landMask: TerrainMask, waterMask: TerrainMask): TerrainMask {
  const values = new Set<string>();
  const horizontal = seededNoise(seed, seed + 5, seed + 11) > 0;
  const roadWidth = Math.max(1, Math.round(Math.min(columns, rows) * 0.018));

  for (let i = 0; i < (horizontal ? columns : rows); i += 1) {
    const t = i / Math.max(1, (horizontal ? columns : rows) - 1);
    const bend = Math.sin(t * Math.PI * 1.5 + seed * 0.021) * 0.10 + Math.sin(t * Math.PI * 3.5 + seed * 0.013) * 0.04;
    const center = Math.round((horizontal ? rows : columns) * (0.5 + bend));
    for (let offset = -roadWidth; offset <= roadWidth; offset += 1) {
      const column = horizontal ? i : center + offset;
      const row = horizontal ? center + offset : i;
      if (landMask.isFilled(column, row) && !waterMask.isFilled(column, row)) values.add(`${column}:${row}`);
    }
  }

  return setMask(columns, rows, values);
}

function paintDisc(values: Set<string>, bounds: TerrainMask, centerColumn: number, centerRow: number, radius: number): void {
  for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
    for (let column = centerColumn - radius; column <= centerColumn + radius; column += 1) {
      const dx = column - centerColumn;
      const dy = row - centerRow;
      if (dx * dx + dy * dy <= radius * radius && bounds.isFilled(column, row)) {
        values.add(`${column}:${row}`);
      }
    }
  }
}

function smoothMask(values: Set<string>, columns: number, rows: number, iterations: number): void {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const toAdd: string[] = [];
    const toDelete: string[] = [];
    for (let row = 1; row < rows - 1; row += 1) {
      for (let column = 1; column < columns - 1; column += 1) {
        const key = `${column}:${row}`;
        const count = countFilledNeighbors(values, column, row);
        if (!values.has(key) && count >= 5) toAdd.push(key);
        if (values.has(key) && count <= 1) toDelete.push(key);
      }
    }
    for (const key of toAdd) values.add(key);
    for (const key of toDelete) values.delete(key);
  }
}

function countFilledNeighbors(values: Set<string>, column: number, row: number): number {
  let count = 0;
  for (let y = row - 1; y <= row + 1; y += 1) {
    for (let x = column - 1; x <= column + 1; x += 1) {
      if (x === column && y === row) continue;
      if (values.has(`${x}:${y}`)) count += 1;
    }
  }
  return count;
}

function setMask(columns: number, rows: number, values: Set<string>): TerrainMask {
  return {
    columns,
    rows,
    isFilled(column: number, row: number): boolean {
      return column >= 0 && column < columns && row >= 0 && row < rows && values.has(`${column}:${row}`);
    },
  };
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
  family: TerrainTileFamily,
  role: EditorTerrainTileRole,
  column: number,
  row: number,
  seed: number,
  counters: Map<EditorTerrainTileRole | 'all', number>,
): TerrainTile {
  const candidates = family.byRole.get(role)
    ?? family.byRole.get('center')
    ?? family.all;
  const counterKey = family.byRole.has(role) ? role : family.byRole.has('center') ? 'center' : 'all';
  const index = counters.get(counterKey) ?? 0;
  counters.set(counterKey, index + 1);
  return pickWeightedTile(candidates, column, row, seed, index);
}

function pickDecorativeTile(families: TerrainTileFamily[], column: number, row: number, seed: number): TerrainTile | null {
  const candidates = families.flatMap((family) => family.byRole.get('decorative') ?? []);
  if (candidates.length === 0) return null;
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
    terrainMaterial: tile.material,
    terrainMovementMode: tile.movementMode,
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

function getDefaultMovementMode(material: EditorTerrainMaterial): EditorTerrainMovementMode {
  if (material === 'water') return 'boatOnly';
  if (material === 'rock') return 'blocked';
  return 'passable';
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
