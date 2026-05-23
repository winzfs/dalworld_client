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
  nonDecorative: TerrainTile[];
  byRole: Map<EditorTerrainTileRole, TerrainTile[]>;
};

type TerrainMask = {
  columns: number;
  rows: number;
  isFilled(column: number, row: number): boolean;
};

type GridPoint = { column: number; row: number };

type FamilyRegion = {
  family: TerrainTileFamily;
  column: number;
  row: number;
  radiusBias: number;
};

const DEFAULT_MAX_PLACEMENTS = 12000;
const DEFAULT_TERRAIN_RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';
const DEFAULT_TERRAIN_SHAPE_KEY = 'dalworld:editor-terrain-shape:dalworld-map';
const DEFAULT_TERRAIN_SEED_KEY = 'dalworld:editor-terrain-seed:dalworld-map';
const DECORATIVE_CHANCE = 0.035;

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

  const baseFamilies = getBaseFamilies(families).filter((family) => family.nonDecorative.length > 0);
  if (baseFamilies.length === 0) return [];

  const landMask = shape === 'island'
    ? createIslandLandMask(columns, rows, seed)
    : createFilledRectMask(columns, rows);
  const waterFamilies = getFamiliesByMaterial(families, 'water').filter((family) => family.nonDecorative.length > 0);
  const roadFamilies = getFamiliesByMaterial(families, 'road').filter((family) => family.nonDecorative.length > 0);
  const decorativeFamilies = families.filter((family) => family.byRole.has('decorative') && family.material !== 'water' && family.material !== 'road');
  const waterMask = waterFamilies.length > 0 ? createWaterFeatureMask(columns, rows, seed + 307, landMask) : createEmptyMask(columns, rows);
  const roadMask = roadFamilies.length > 0 ? createRoadMask(columns, rows, seed + 419, landMask, waterMask) : createEmptyMask(columns, rows);
  const baseRegions = createFamilyRegions(baseFamilies, columns, rows, seed + 17, 1.45);
  const waterRegions = createFamilyRegions(waterFamilies, columns, rows, seed + 307, 1.0);
  const roadRegions = createFamilyRegions(roadFamilies, columns, rows, seed + 419, 1.0);

  const placements: EditorTilePlacement[] = [];
  const baseCounters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  const waterCounters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  const roadCounters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (placements.length >= maxPlacements) return placements;
      if (!landMask.isFilled(column, row)) continue;

      const family = pickFamilyFromRegions(baseRegions, baseFamilies, column, row, seed + 17);
      const baseRole = resolveRoleFromMask(landMask, column, row);
      const baseTile = pickTileForRole(family, baseRole, column, row, seed, getFamilyCounters(baseCounters, family));
      placements.push(createGroundPlacement(baseTile, column * gridSize, row * gridSize));
    }
  }

  if (waterFamilies.length > 0) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (placements.length >= maxPlacements) return placements;
        if (!waterMask.isFilled(column, row)) continue;
        const family = pickFamilyFromRegions(waterRegions, waterFamilies, column, row, seed + 307);
        const role = resolveRoleFromMask(waterMask, column, row);
        const tile = pickTileForRole(family, role, column, row, seed + 307, getFamilyCounters(waterCounters, family));
        placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
      }
    }
  }

  if (roadFamilies.length > 0) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (placements.length >= maxPlacements) return placements;
        if (!roadMask.isFilled(column, row)) continue;
        const family = pickFamilyFromRegions(roadRegions, roadFamilies, column, row, seed + 419);
        const role = resolveRoleFromMask(roadMask, column, row);
        const tile = pickTileForRole(family, role, column, row, seed + 419, getFamilyCounters(roadCounters, family));
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
    const role = rule.role ?? 'center';
    const key = `${rule.id}:${role}:${rule.scale ?? 1}:${weight}:${material}:${movementMode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      asset,
      sourceRect: { ...rule.sourceRect },
      scale: normalizeScale(rule.scale),
      weight,
      material,
      movementMode,
      rule: { ...rule, role },
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
        nonDecorative: [],
        byRole: new Map<EditorTerrainTileRole, TerrainTile[]>(),
      };
      familyMap.set(key, family);
    }

    family.all.push(tile);
    const role = tile.rule?.role;
    if (role) {
      const list = family.byRole.get(role) ?? [];
      list.push(tile);
      family.byRole.set(role, list);
      if (role !== 'decorative') family.nonDecorative.push(tile);
    } else {
      family.nonDecorative.push(tile);
    }
  }

  return [...familyMap.values()].filter((family) => family.all.length > 0);
}

function createFamilyKey(tile: TerrainTile): string {
  return `${tile.asset.id}:${tile.asset.url}:${tile.material}:${tile.movementMode}`;
}

function getBaseFamilies(families: TerrainTileFamily[]): TerrainTileFamily[] {
  const baseCandidates = families.filter((family) => family.material === 'grass' || family.material === 'dirt' || family.material === 'sand');
  if (baseCandidates.length > 0) return baseCandidates;
  const fallback = families.filter((family) => family.material !== 'water' && family.material !== 'road');
  return fallback.length > 0 ? fallback : families;
}

function getFamiliesByMaterial(families: TerrainTileFamily[], material: EditorTerrainMaterial): TerrainTileFamily[] {
  return families.filter((family) => family.material === material);
}

function createFamilyRegions(
  families: TerrainTileFamily[],
  columns: number,
  rows: number,
  seed: number,
  densityMultiplier: number,
): FamilyRegion[] {
  if (families.length === 0) return [];
  if (families.length === 1) return [{ family: families[0], column: columns / 2, row: rows / 2, radiusBias: 1 }];

  const regionCount = Math.max(families.length, Math.min(families.length * 3, Math.round(Math.sqrt(columns * rows) / 18 * densityMultiplier)));
  const regions: FamilyRegion[] = [];
  for (let index = 0; index < regionCount; index += 1) {
    const family = families[index % families.length];
    const column = normalizedNoise(seed + index * 17, index * 31 + 3, seed) * columns;
    const row = normalizedNoise(seed + index * 29, index * 37 + 7, seed + 101) * rows;
    const radiusBias = 0.75 + normalizedNoise(seed + index * 41, index * 43 + 11, seed + 203) * 0.6;
    regions.push({ family, column, row, radiusBias });
  }
  return regions;
}

function pickFamilyFromRegions(
  regions: FamilyRegion[],
  fallbackFamilies: TerrainTileFamily[],
  column: number,
  row: number,
  seed: number,
): TerrainTileFamily {
  if (regions.length === 0) return fallbackFamilies[0];
  if (regions.length === 1) return regions[0].family;

  const warpX = seededNoise(Math.floor(column / 7), Math.floor(row / 7), seed + 911) * 4;
  const warpY = seededNoise(Math.floor(column / 9), Math.floor(row / 9), seed + 1291) * 4;
  const sampleColumn = column + warpX;
  const sampleRow = row + warpY;
  let bestRegion = regions[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const region of regions) {
    const dx = sampleColumn - region.column;
    const dy = sampleRow - region.row;
    const score = (dx * dx + dy * dy) / Math.max(0.1, region.radiusBias);
    if (score < bestScore) {
      bestScore = score;
      bestRegion = region;
    }
  }
  return bestRegion.family;
}

function getFamilyCounters(
  store: Map<string, Map<EditorTerrainTileRole | 'all', number>>,
  family: TerrainTileFamily,
): Map<EditorTerrainTileRole | 'all', number> {
  let counters = store.get(family.key);
  if (!counters) {
    counters = new Map<EditorTerrainTileRole | 'all', number>();
    store.set(family.key, counters);
  }
  return counters;
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
  const values = new Set<string>();
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const radiusX = Math.max(2, columns * 0.46);
  const radiusY = Math.max(2, rows * 0.46);
  const vertexCount = 10;
  const radii: number[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const lowFrequency = seededNoise(i, seed * 0.01, seed + 17) * 0.08;
    radii.push(0.92 + lowFrequency);
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column - centerX) / radiusX;
      const ny = (row - centerY) / radiusY;
      const distance = Math.sqrt(nx * nx + ny * ny);
      let angle = Math.atan2(ny, nx);
      if (angle < 0) angle += Math.PI * 2;
      const segment = (angle / (Math.PI * 2)) * vertexCount;
      const index = Math.floor(segment) % vertexCount;
      const nextIndex = (index + 1) % vertexCount;
      const t = segment - Math.floor(segment);
      const allowedRadius = lerp(radii[index], radii[nextIndex], smoothStep(t));
      if (distance <= allowedRadius) values.add(`${column}:${row}`);
    }
  }

  removeTinyIslands(values, columns, rows);
  return setMask(columns, rows, values);
}

function createWaterFeatureMask(columns: number, rows: number, seed: number, landMask: TerrainMask): TerrainMask {
  const values = new Set<string>();
  const shouldLake = seededNoise(seed, seed + 13, seed + 29) > 0.25;

  if (shouldLake) {
    createLakeFeature(values, columns, rows, seed, landMask);
  } else {
    createRiverFeature(values, columns, rows, seed, landMask);
  }

  removeTinyIslands(values, columns, rows);
  return setMask(columns, rows, values);
}

function createLakeFeature(values: Set<string>, columns: number, rows: number, seed: number, landMask: TerrainMask): void {
  const lakeCount = Math.min(2, Math.max(1, Math.floor(Math.min(columns, rows) / 70) + 1));
  for (let index = 0; index < lakeCount; index += 1) {
    const cx = Math.round(columns * (0.30 + normalizedNoise(seed + index * 11, 7, seed) * 0.40));
    const cy = Math.round(rows * (0.30 + normalizedNoise(seed + index * 17, 13, seed) * 0.40));
    const rx = Math.max(3, Math.round(columns * (0.045 + normalizedNoise(seed, index + 23, seed) * 0.035)));
    const ry = Math.max(3, Math.round(rows * (0.045 + normalizedNoise(seed + 31, index, seed) * 0.035)));
    paintEllipse(values, landMask, cx, cy, rx, ry);
  }
}

function createRiverFeature(values: Set<string>, columns: number, rows: number, seed: number, landMask: TerrainMask): void {
  const horizontal = seededNoise(seed, seed + 13, seed + 29) > 0;
  const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.025));
  const start: GridPoint = horizontal
    ? { column: 0, row: Math.round(rows * (0.25 + normalizedNoise(seed, 1, seed) * 0.5)) }
    : { column: Math.round(columns * (0.25 + normalizedNoise(seed, 2, seed) * 0.5)), row: 0 };
  const end: GridPoint = horizontal
    ? { column: columns - 1, row: Math.round(rows * (0.25 + normalizedNoise(seed, 3, seed) * 0.5)) }
    : { column: Math.round(columns * (0.25 + normalizedNoise(seed, 4, seed) * 0.5)), row: rows - 1 };
  const controlA: GridPoint = horizontal
    ? { column: Math.round(columns * 0.33), row: Math.round(rows * (0.20 + normalizedNoise(seed, 5, seed) * 0.6)) }
    : { column: Math.round(columns * (0.20 + normalizedNoise(seed, 6, seed) * 0.6)), row: Math.round(rows * 0.33) };
  const controlB: GridPoint = horizontal
    ? { column: Math.round(columns * 0.66), row: Math.round(rows * (0.20 + normalizedNoise(seed, 7, seed) * 0.6)) }
    : { column: Math.round(columns * (0.20 + normalizedNoise(seed, 8, seed) * 0.6)), row: Math.round(rows * 0.66) };

  paintCubicPath(values, landMask, start, controlA, controlB, end, width);
}

function createRoadMask(columns: number, rows: number, seed: number, landMask: TerrainMask, waterMask: TerrainMask): TerrainMask {
  const values = new Set<string>();
  const horizontal = seededNoise(seed, seed + 5, seed + 11) > 0;
  const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.012));
  const center: GridPoint = {
    column: Math.round(columns * (0.45 + normalizedNoise(seed, 19, seed) * 0.10)),
    row: Math.round(rows * (0.45 + normalizedNoise(seed, 29, seed) * 0.10)),
  };
  const start: GridPoint = horizontal
    ? { column: 0, row: Math.round(rows * (0.30 + normalizedNoise(seed, 31, seed) * 0.40)) }
    : { column: Math.round(columns * (0.30 + normalizedNoise(seed, 37, seed) * 0.40)), row: 0 };
  const end: GridPoint = horizontal
    ? { column: columns - 1, row: Math.round(rows * (0.30 + normalizedNoise(seed, 41, seed) * 0.40)) }
    : { column: Math.round(columns * (0.30 + normalizedNoise(seed, 43, seed) * 0.40)), row: rows - 1 };

  paintSteppedPath(values, landMask, waterMask, start, center, width);
  paintSteppedPath(values, landMask, waterMask, center, end, width);
  paintDisc(values, landMask, center.column, center.row, Math.max(width + 1, 2), waterMask);

  return setMask(columns, rows, values);
}

function paintSteppedPath(
  values: Set<string>,
  landMask: TerrainMask,
  waterMask: TerrainMask,
  start: GridPoint,
  end: GridPoint,
  width: number,
): void {
  let column = start.column;
  let row = start.row;
  const guard = Math.max(1, landMask.columns + landMask.rows) * 3;

  for (let step = 0; step < guard && (column !== end.column || row !== end.row); step += 1) {
    paintDisc(values, landMask, column, row, width, waterMask);
    const dx = end.column - column;
    const dy = end.row - row;
    if (Math.abs(dx) >= Math.abs(dy)) column += Math.sign(dx);
    else row += Math.sign(dy);
  }
  paintDisc(values, landMask, end.column, end.row, width, waterMask);
}

function paintCubicPath(
  values: Set<string>,
  bounds: TerrainMask,
  start: GridPoint,
  controlA: GridPoint,
  controlB: GridPoint,
  end: GridPoint,
  width: number,
): void {
  const steps = Math.max(bounds.columns, bounds.rows) * 2;
  let previous = start;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / Math.max(1, steps);
    const point = cubicPoint(start, controlA, controlB, end, t);
    paintLine(values, bounds, previous, point, width);
    previous = point;
  }
}

function cubicPoint(start: GridPoint, controlA: GridPoint, controlB: GridPoint, end: GridPoint, t: number): GridPoint {
  const inv = 1 - t;
  return {
    column: Math.round(inv * inv * inv * start.column + 3 * inv * inv * t * controlA.column + 3 * inv * t * t * controlB.column + t * t * t * end.column),
    row: Math.round(inv * inv * inv * start.row + 3 * inv * inv * t * controlA.row + 3 * inv * t * t * controlB.row + t * t * t * end.row),
  };
}

function paintLine(values: Set<string>, bounds: TerrainMask, start: GridPoint, end: GridPoint, width: number): void {
  const steps = Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const column = Math.round(lerp(start.column, end.column, t));
    const row = Math.round(lerp(start.row, end.row, t));
    paintDisc(values, bounds, column, row, width);
  }
}

function paintEllipse(values: Set<string>, bounds: TerrainMask, centerColumn: number, centerRow: number, radiusX: number, radiusY: number): void {
  for (let row = centerRow - radiusY; row <= centerRow + radiusY; row += 1) {
    for (let column = centerColumn - radiusX; column <= centerColumn + radiusX; column += 1) {
      const nx = (column - centerColumn) / Math.max(1, radiusX);
      const ny = (row - centerRow) / Math.max(1, radiusY);
      if (nx * nx + ny * ny <= 1 && bounds.isFilled(column, row)) values.add(`${column}:${row}`);
    }
  }
}

function paintDisc(
  values: Set<string>,
  bounds: TerrainMask,
  centerColumn: number,
  centerRow: number,
  radius: number,
  avoidMask?: TerrainMask,
): void {
  for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
    for (let column = centerColumn - radius; column <= centerColumn + radius; column += 1) {
      const dx = column - centerColumn;
      const dy = row - centerRow;
      if (dx * dx + dy * dy <= radius * radius && bounds.isFilled(column, row) && !avoidMask?.isFilled(column, row)) {
        values.add(`${column}:${row}`);
      }
    }
  }
}

function removeTinyIslands(values: Set<string>, columns: number, rows: number): void {
  const toDelete: string[] = [];
  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      const key = `${column}:${row}`;
      if (!values.has(key)) continue;
      if (countFilledNeighbors(values, column, row) <= 1) toDelete.push(key);
    }
  }
  for (const key of toDelete) values.delete(key);
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
    ?? family.nonDecorative;
  const counterKey = family.byRole.has(role) ? role : family.byRole.has('center') ? 'center' : 'all';
  const index = counters.get(counterKey) ?? 0;
  counters.set(counterKey, index + 1);
  return pickWeightedTile(candidates.length > 0 ? candidates : family.all, column, row, seed, index);
}

function pickDecorativeTile(families: TerrainTileFamily[], column: number, row: number, seed: number): TerrainTile | null {
  const candidates = families.flatMap((family) => family.byRole.get('decorative') ?? []);
  if (candidates.length === 0) return null;
  if (seededNoise(column * 19 + 3, row * 23 + 5, seed + 193) * 0.5 + 0.5 > DECORATIVE_CHANCE) return null;
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

function normalizedNoise(x: number, y: number, seed: number): number {
  return seededNoise(x, y, seed) * 0.5 + 0.5;
}\n
function seededNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
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
