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
  role: EditorTerrainTileRole;
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

type TerrainMask = { columns: number; rows: number; isFilled(column: number, row: number): boolean };
type GridPoint = { column: number; row: number };
type FamilyRegion = { family: TerrainTileFamily; column: number; row: number; radiusBias: number };
type FeatureKind = 'water' | 'road';
type GeneratedCell = { land: boolean; baseFamily: TerrainTileFamily | null; featureKind: FeatureKind | null; featureFamily: TerrainTileFamily | null };
type TilesetGenerationSettings = { material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; scale: number };

const DEFAULT_TERRAIN_RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';
const DEFAULT_TERRAIN_SHAPE_KEY = 'dalworld:editor-terrain-shape:dalworld-map';
const DEFAULT_TERRAIN_SEED_KEY = 'dalworld:editor-terrain-seed:dalworld-map';
const DEFAULT_PLACEMENT_MULTIPLIER = 4;
const DECORATIVE_PATCH_THRESHOLD = 0.62;
const DECORATIVE_PATCH_CHANCE = 0.16;

export async function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredTerrainSeed());
  const terrainRuleSet = options.terrainRuleSet ?? readStoredTerrainRuleSet();
  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const columns = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const maxPlacements = normalizePositiveInteger(options.maxPlacements, columns * rows * DEFAULT_PLACEMENT_MULTIPLIER);
  const families = await collectTerrainFamilies(options.tilesets, gridSize, terrainRuleSet);
  if (families.length === 0) return [];

  const shape = options.shape ?? readStoredTerrainShape();
  const baseFamilies = getBaseFamilies(families).filter((family) => family.nonDecorative.length > 0);
  if (baseFamilies.length === 0) return [];

  const waterFamilies = getFamiliesByMaterial(families, 'water').filter((family) => family.nonDecorative.length > 0);
  const roadFamilies = getFamiliesByMaterial(families, 'road').filter((family) => family.nonDecorative.length > 0);
  const decorativeFamilies = families.filter((family) => family.byRole.has('decorative') && family.material !== 'water' && family.material !== 'road');

  const landMask = shape === 'island' ? createIslandLandMask(columns, rows, seed) : createFilledRectMask(columns, rows);
  const waterMask = waterFamilies.length > 0 ? createWaterFeatureMask(columns, rows, seed + 307, landMask) : createEmptyMask(columns, rows);
  const roadMask = roadFamilies.length > 0 ? createRoadMask(columns, rows, seed + 419, landMask, waterMask) : createEmptyMask(columns, rows);
  const cells = createCellMap({
    columns,
    rows,
    seed,
    landMask,
    waterMask,
    roadMask,
    baseFamilies,
    waterFamilies,
    roadFamilies,
    baseRegions: createFamilyRegions(baseFamilies, columns, rows, seed + 17, 1.45),
    waterRegions: createFamilyRegions(waterFamilies, columns, rows, seed + 307, 1),
    roadRegions: createFamilyRegions(roadFamilies, columns, rows, seed + 419, 1),
  });

  const placements: EditorTilePlacement[] = [];
  const baseCounters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  const waterCounters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  const roadCounters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();

  forEachCell(cells, (cell, column, row) => {
    if (placements.length >= maxPlacements || !cell.land || !cell.baseFamily) return;
    const tile = pickTileForRole(cell.baseFamily, resolveLandRole(cells, column, row), column, row, seed, getFamilyCounters(baseCounters, cell.baseFamily));
    placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
  });

  forEachCell(cells, (cell, column, row) => {
    if (placements.length >= maxPlacements || cell.featureKind !== 'water' || !cell.featureFamily) return;
    const tile = pickTileForRole(cell.featureFamily, resolveFeatureRole(cells, column, row, 'water'), column, row, seed + 307, getFamilyCounters(waterCounters, cell.featureFamily));
    placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
  });

  forEachCell(cells, (cell, column, row) => {
    if (placements.length >= maxPlacements || cell.featureKind !== 'road' || !cell.featureFamily) return;
    const tile = pickTileForRole(cell.featureFamily, resolveFeatureRole(cells, column, row, 'road'), column, row, seed + 419, getFamilyCounters(roadCounters, cell.featureFamily));
    placements.push(createGroundPlacement(tile, column * gridSize, row * gridSize));
  });

  if (decorativeFamilies.length > 0) {
    forEachCell(cells, (cell, column, row) => {
      if (placements.length >= maxPlacements || !cell.land || cell.featureKind) return;
      const decorative = pickDecorativeTile(decorativeFamilies, column, row, seed + 613);
      if (decorative) placements.push(createGroundPlacement(decorative, column * gridSize, row * gridSize));
    });
  }

  return placements;
}

function createCellMap(options: {
  columns: number;
  rows: number;
  seed: number;
  landMask: TerrainMask;
  waterMask: TerrainMask;
  roadMask: TerrainMask;
  baseFamilies: TerrainTileFamily[];
  waterFamilies: TerrainTileFamily[];
  roadFamilies: TerrainTileFamily[];
  baseRegions: FamilyRegion[];
  waterRegions: FamilyRegion[];
  roadRegions: FamilyRegion[];
}): GeneratedCell[][] {
  const cells: GeneratedCell[][] = [];
  for (let row = 0; row < options.rows; row += 1) {
    const line: GeneratedCell[] = [];
    for (let column = 0; column < options.columns; column += 1) {
      const land = options.landMask.isFilled(column, row);
      const baseFamily = land ? pickFamilyFromRegions(options.baseRegions, options.baseFamilies, column, row, options.seed + 17) : null;
      line.push({ land, baseFamily, featureKind: null, featureFamily: null });
    }
    cells.push(line);
  }

  if (options.waterFamilies.length > 0) {
    forEachCell(cells, (cell, column, row) => {
      if (!cell.land || !options.waterMask.isFilled(column, row)) return;
      cell.featureKind = 'water';
      cell.featureFamily = pickFamilyFromRegions(options.waterRegions, options.waterFamilies, column, row, options.seed + 307);
    });
  }

  if (options.roadFamilies.length > 0) {
    forEachCell(cells, (cell, column, row) => {
      if (!cell.land || cell.featureKind === 'water' || !options.roadMask.isFilled(column, row)) return;
      cell.featureKind = 'road';
      cell.featureFamily = pickFamilyFromRegions(options.roadRegions, options.roadFamilies, column, row, options.seed + 419);
    });
  }

  applyBiomeBasePass(cells, options.baseFamilies, options.seed + 733);
  applyBaseTransitionPasses(cells, options.baseFamilies, options.seed + 809);
  smoothBaseFamilies(cells, 2);
  return cells;
}

function applyBiomeBasePass(cells: GeneratedCell[][], baseFamilies: TerrainTileFamily[], seed: number): void {
  const grassFamilies = baseFamilies.filter((family) => family.material === 'grass');
  const dirtFamilies = baseFamilies.filter((family) => family.material === 'dirt');
  const sandFamilies = baseFamilies.filter((family) => family.material === 'sand');
  if (baseFamilies.length <= 1 || grassFamilies.length + dirtFamilies.length + sandFamilies.length <= 1) return;

  forEachCell(cells, (cell, column, row) => {
    if (!cell.land || cell.featureKind) return;
    const moisture = layeredNoise(column, row, seed, 34, 13, 5);
    const dryness = layeredNoise(column + 91, row - 37, seed + 191, 42, 17, 7);
    let pool: TerrainTileFamily[] = grassFamilies;
    if (dryness > 0.68 && sandFamilies.length > 0) pool = sandFamilies;
    else if (moisture < 0.34 && dirtFamilies.length > 0) pool = dirtFamilies;
    else if (moisture < 0.48 && dirtFamilies.length > 0 && normalizedNoise(column, row, seed + 29) > 0.35) pool = dirtFamilies;
    else if (grassFamilies.length === 0) pool = dirtFamilies.length > 0 ? dirtFamilies : sandFamilies;
    const family = pickTransitionFamily(pool, column, row, seed + 17);
    if (family) cell.baseFamily = family;
  });
}

function applyBaseTransitionPasses(cells: GeneratedCell[][], baseFamilies: TerrainTileFamily[], seed: number): void {
  const grassFamilies = baseFamilies.filter((family) => family.material === 'grass');
  const sandFamilies = baseFamilies.filter((family) => family.material === 'sand');
  const dirtFamilies = baseFamilies.filter((family) => family.material === 'dirt');
  if (sandFamilies.length === 0 && dirtFamilies.length === 0) return;

  const updates: Array<{ column: number; row: number; family: TerrainTileFamily }> = [];
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land || cell.featureKind) return;
    const waterDistance = distanceToFeature(cells, column, row, 'water', 3);
    const roadDistance = distanceToFeature(cells, column, row, 'road', 2);

    if (waterDistance === 1) {
      const family = pickTransitionFamily(sandFamilies.length > 0 ? sandFamilies : dirtFamilies, column, row, seed + 31);
      if (family) updates.push({ column, row, family });
      return;
    }

    if (waterDistance === 2) {
      const pool = sandFamilies.length > 0 && dirtFamilies.length > 0
        ? (normalizedNoise(column, row, seed + 53) > 0.45 ? sandFamilies : dirtFamilies)
        : sandFamilies.length > 0 ? sandFamilies : dirtFamilies;
      const family = pickTransitionFamily(pool, column, row, seed + 53);
      if (family) updates.push({ column, row, family });
      return;
    }

    if (roadDistance === 1 && dirtFamilies.length > 0) {
      const family = pickTransitionFamily(dirtFamilies, column, row, seed + 47);
      if (family) updates.push({ column, row, family });
      return;
    }

    if (roadDistance === 2 && dirtFamilies.length > 0 && normalizedNoise(Math.floor(column / 2), Math.floor(row / 2), seed + 73) > 0.28) {
      const pool = grassFamilies.length > 0 && normalizedNoise(column, row, seed + 79) > 0.72 ? grassFamilies : dirtFamilies;
      const family = pickTransitionFamily(pool, column, row, seed + 79);
      if (family) updates.push({ column, row, family });
    }
  });

  for (const update of updates) cells[update.row][update.column].baseFamily = update.family;
}

function smoothBaseFamilies(cells: GeneratedCell[][], passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const updates: Array<{ column: number; row: number; family: TerrainTileFamily }> = [];
    forEachCell(cells, (cell, column, row) => {
      if (!cell.land || cell.featureKind || !cell.baseFamily) return;
      const counts = new Map<string, { family: TerrainTileFamily; count: number }>();
      for (let y = row - 1; y <= row + 1; y += 1) {
        for (let x = column - 1; x <= column + 1; x += 1) {
          if (x === column && y === row) continue;
          const neighbor = cells[y]?.[x];
          if (!neighbor?.land || neighbor.featureKind || !neighbor.baseFamily) continue;
          const current = counts.get(neighbor.baseFamily.key) ?? { family: neighbor.baseFamily, count: 0 };
          current.count += 1;
          counts.set(neighbor.baseFamily.key, current);
        }
      }
      const currentCount = counts.get(cell.baseFamily.key)?.count ?? 0;
      let best: { family: TerrainTileFamily; count: number } | null = null;
      for (const candidate of counts.values()) {
        if (!best || candidate.count > best.count) best = candidate;
      }
      if (best && best.count >= 5 && currentCount <= 2) updates.push({ column, row, family: best.family });
    });
    for (const update of updates) cells[update.row][update.column].baseFamily = update.family;
  }
}

async function collectTerrainFamilies(tilesets: EditorTilesetAsset[], gridSize: number, terrainRuleSet: EditorTerrainRuleSet | undefined): Promise<TerrainTileFamily[]> {
  const hasManualRules = Boolean(terrainRuleSet && terrainRuleSet.rules.length > 0);
  const ruleTiles = collectRuleTerrainTiles(tilesets, terrainRuleSet, gridSize);
  if (ruleTiles.length > 0) return createFamilies(ruleTiles);
  if (hasManualRules) return [];
  return createFamilies(await collectFullTilesetTerrainTiles(tilesets, gridSize));
}

function collectRuleTerrainTiles(tilesets: EditorTilesetAsset[], terrainRuleSet: EditorTerrainRuleSet | undefined, gridSize: number): TerrainTile[] {
  if (!terrainRuleSet || terrainRuleSet.rules.length === 0) return [];
  const tilesetByKey = new Map<string, EditorTilesetAsset>();
  for (const asset of tilesets) tilesetByKey.set(createTilesetKey(asset.id, asset.url), asset);

  const settingsByKey = new Map<string, TilesetGenerationSettings>();
  for (const setting of terrainRuleSet.tilesets ?? []) {
    const material = setting.material ?? 'grass';
    settingsByKey.set(createTilesetKey(setting.tilesetId, setting.tilesetUrl), {
      material,
      movementMode: setting.movementMode ?? getDefaultMovementMode(material),
      scale: normalizeScale(setting.scale),
    });
  }

  const result: TerrainTile[] = [];
  const seen = new Set<string>();
  for (const rule of terrainRuleSet.rules) {
    const assetKey = createTilesetKey(rule.tilesetId, rule.tilesetUrl);
    const asset = tilesetByKey.get(assetKey);
    if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue;

    const settings = settingsByKey.get(assetKey);
    const material = rule.material ?? settings?.material ?? 'grass';
    const movementMode = rule.movementMode ?? settings?.movementMode ?? getDefaultMovementMode(material);
    const scale = normalizeScale(settings?.scale ?? rule.scale);
    if (!doesRuleFitGrid(rule, scale, gridSize)) continue;

    const weight = normalizeWeight(rule.weight);
    if (weight <= 0) continue;
    const role = rule.role ?? 'center';
    const key = `${assetKey}:${rule.sourceRect.x}:${rule.sourceRect.y}:${rule.sourceRect.width}:${rule.sourceRect.height}:${role}:${scale}:${weight}:${material}:${movementMode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ asset, sourceRect: { ...rule.sourceRect }, scale, weight, material, movementMode, role, rule: { ...rule, role } });
  }
  return result;
}

function doesRuleFitGrid(rule: EditorTerrainTileRule, scale: number, gridSize: number): boolean {
  const width = normalizePositiveInteger(rule.sourceRect?.width, normalizeGridSize(rule.tileSize));
  const height = normalizePositiveInteger(rule.sourceRect?.height, normalizeGridSize(rule.tileSize));
  return Math.round(width * scale) === gridSize && Math.round(height * scale) === gridSize;
}

async function collectFullTilesetTerrainTiles(tilesets: EditorTilesetAsset[], gridSize: number): Promise<TerrainTile[]> {
  const result: TerrainTile[] = [];
  const seen = new Set<string>();
  for (const asset of tilesets) {
    if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue;
    const size = await loadImageSize(asset.url);
    if (!size) continue;
    for (let y = 0; y + gridSize <= size.height; y += gridSize) {
      for (let x = 0; x + gridSize <= size.width; x += gridSize) {
        const sourceRect = { x, y, width: gridSize, height: gridSize };
        const key = JSON.stringify({ assetId: asset.id, assetUrl: asset.url, sourceRect });
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ asset, sourceRect, scale: 1, weight: 1, material: 'grass', movementMode: 'passable', role: 'center' });
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
      family = { key, material: tile.material, movementMode: tile.movementMode, tilesetId: tile.asset.id, tilesetUrl: tile.asset.url, all: [], nonDecorative: [], byRole: new Map<EditorTerrainTileRole, TerrainTile[]>() };
      familyMap.set(key, family);
    }
    family.all.push(tile);
    const list = family.byRole.get(tile.role) ?? [];
    list.push(tile);
    family.byRole.set(tile.role, list);
    if (tile.role !== 'decorative') family.nonDecorative.push(tile);
  }
  return [...familyMap.values()].filter((family) => family.all.length > 0);
}

function createFamilyKey(tile: TerrainTile): string {
  return `${tile.asset.id}:${tile.asset.url}:${tile.material}:${tile.movementMode}`;
}

function getBaseFamilies(families: TerrainTileFamily[]): TerrainTileFamily[] {
  const base = families.filter((family) => family.material === 'grass' || family.material === 'dirt' || family.material === 'sand');
  if (base.length > 0) return base;
  const fallback = families.filter((family) => family.material !== 'water' && family.material !== 'road');
  return fallback.length > 0 ? fallback : families;
}

function getFamiliesByMaterial(families: TerrainTileFamily[], material: EditorTerrainMaterial): TerrainTileFamily[] {
  return families.filter((family) => family.material === material);
}

function createFamilyRegions(families: TerrainTileFamily[], columns: number, rows: number, seed: number, densityMultiplier: number): FamilyRegion[] {
  if (families.length === 0) return [];
  if (families.length === 1) return [{ family: families[0], column: columns / 2, row: rows / 2, radiusBias: 1 }];
  const regionCount = Math.max(families.length, Math.min(families.length * 3, Math.round(Math.sqrt(columns * rows) / 18 * densityMultiplier)));
  const regions: FamilyRegion[] = [];
  for (let index = 0; index < regionCount; index += 1) {
    regions.push({
      family: families[index % families.length],
      column: normalizedNoise(seed + index * 17, index * 31 + 3, seed) * columns,
      row: normalizedNoise(seed + index * 29, index * 37 + 7, seed + 101) * rows,
      radiusBias: 0.75 + normalizedNoise(seed + index * 41, index * 43 + 11, seed + 203) * 0.6,
    });
  }
  return regions;
}

function pickFamilyFromRegions(regions: FamilyRegion[], fallbackFamilies: TerrainTileFamily[], column: number, row: number, seed: number): TerrainTileFamily {
  if (regions.length === 0) return fallbackFamilies[0];
  if (regions.length === 1) return regions[0].family;
  const sampleColumn = column + seededNoise(Math.floor(column / 7), Math.floor(row / 7), seed + 911) * 4;
  const sampleRow = row + seededNoise(Math.floor(column / 9), Math.floor(row / 9), seed + 1291) * 4;
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

function resolveLandRole(cells: GeneratedCell[][], column: number, row: number): EditorTerrainTileRole {
  return resolveRoleByPredicate(column, row, (x, y) => Boolean(cells[y]?.[x]?.land));
}

function resolveFeatureRole(cells: GeneratedCell[][], column: number, row: number, feature: FeatureKind): EditorTerrainTileRole {
  return resolveRoleByPredicate(column, row, (x, y) => cells[y]?.[x]?.featureKind === feature);
}

function resolveRoleByPredicate(column: number, row: number, isSame: (column: number, row: number) => boolean): EditorTerrainTileRole {
  const top = isSame(column, row - 1);
  const bottom = isSame(column, row + 1);
  const left = isSame(column - 1, row);
  const right = isSame(column + 1, row);
  if (!top && !left) return 'outerTopLeft';
  if (!top && !right) return 'outerTopRight';
  if (!bottom && !left) return 'outerBottomLeft';
  if (!bottom && !right) return 'outerBottomRight';
  if (!top) return 'edgeTop';
  if (!bottom) return 'edgeBottom';
  if (!left) return 'edgeLeft';
  if (!right) return 'edgeRight';
  if (!isSame(column - 1, row - 1)) return 'innerTopLeft';
  if (!isSame(column + 1, row - 1)) return 'innerTopRight';
  if (!isSame(column - 1, row + 1)) return 'innerBottomLeft';
  if (!isSame(column + 1, row + 1)) return 'innerBottomRight';
  return 'center';
}

function pickTileForRole(family: TerrainTileFamily, role: EditorTerrainTileRole, column: number, row: number, seed: number, counters: Map<EditorTerrainTileRole | 'all', number>): TerrainTile {
  const candidates = family.byRole.get(role) ?? family.byRole.get('center') ?? family.nonDecorative;
  const counterKey = family.byRole.has(role) ? role : family.byRole.has('center') ? 'center' : 'all';
  const index = counters.get(counterKey) ?? 0;
  counters.set(counterKey, index + 1);
  return pickWeightedTile(candidates.length > 0 ? candidates : family.all, column, row, seed, index);
}

function pickDecorativeTile(families: TerrainTileFamily[], column: number, row: number, seed: number): TerrainTile | null {
  const candidates = families.flatMap((family) => family.byRole.get('decorative') ?? []);
  if (candidates.length === 0) return null;
  if (normalizedNoise(Math.floor(column / 5), Math.floor(row / 5), seed + 71) < DECORATIVE_PATCH_THRESHOLD) return null;
  if (normalizedNoise(column * 19 + 3, row * 23 + 5, seed + 193) > DECORATIVE_PATCH_CHANCE) return null;
  return pickWeightedTile(candidates, column + 101, row + 203, seed + 389, 0);
}

function pickWeightedTile(candidates: TerrainTile[], column: number, row: number, seed: number, salt: number): TerrainTile {
  const totalWeight = candidates.reduce((sum, tile) => sum + tile.weight, 0);
  if (totalWeight <= 0) return candidates[0];
  const roll = normalizedNoise(column * 31 + salt * 17, row * 37 + salt * 13, seed + 541) * totalWeight;
  let cursor = 0;
  for (const tile of candidates) {
    cursor += tile.weight;
    if (roll <= cursor) return tile;
  }
  return candidates[candidates.length - 1];
}

function createGroundPlacement(tile: TerrainTile, x: number, y: number): EditorTilePlacement {
  const sourceRect = { ...tile.sourceRect };
  const displayWidth = Math.max(1, Math.round(sourceRect.width * tile.scale));
  const displayHeight = Math.max(1, Math.round(sourceRect.height * tile.scale));
  return { id: crypto.randomUUID(), assetId: tile.asset.id, assetUrl: tile.asset.url, categoryId: tile.asset.categoryId, x, y, layer: 'ground', scale: 1, displayWidth, displayHeight, sourceRect, solidColor: undefined, transparentBlack: false, gameplay: undefined, terrainMaterial: tile.material, terrainMovementMode: tile.movementMode };
}

function getFamilyCounters(store: Map<string, Map<EditorTerrainTileRole | 'all', number>>, family: TerrainTileFamily): Map<EditorTerrainTileRole | 'all', number> {
  let counters = store.get(family.key);
  if (!counters) {
    counters = new Map<EditorTerrainTileRole | 'all', number>();
    store.set(family.key, counters);
  }
  return counters;
}

function forEachCell(cells: GeneratedCell[][], callback: (cell: GeneratedCell, column: number, row: number) => void): void {
  for (let row = 0; row < cells.length; row += 1) {
    const line = cells[row];
    for (let column = 0; column < line.length; column += 1) callback(line[column], column, row);
  }
}

function hasNeighborFeature(cells: GeneratedCell[][], column: number, row: number, feature: FeatureKind, radius: number): boolean {
  return distanceToFeature(cells, column, row, feature, radius) > 0;
}

function distanceToFeature(cells: GeneratedCell[][], column: number, row: number, feature: FeatureKind, radius: number): number {
  for (let distance = 1; distance <= radius; distance += 1) {
    for (let y = row - distance; y <= row + distance; y += 1) {
      for (let x = column - distance; x <= column + distance; x += 1) {
        if (Math.max(Math.abs(x - column), Math.abs(y - row)) !== distance) continue;
        if (cells[y]?.[x]?.featureKind === feature) return distance;
      }
    }
  }
  return 0;
}

function pickTransitionFamily(families: TerrainTileFamily[], column: number, row: number, seed: number): TerrainTileFamily | null {
  if (families.length === 0) return null;
  const index = Math.floor(normalizedNoise(column * 11 + 5, row * 13 + 7, seed) * families.length) % families.length;
  return families[index] ?? families[0];
}

function createFilledRectMask(columns: number, rows: number): TerrainMask {
  return { columns, rows, isFilled: (column, row) => column >= 0 && column < columns && row >= 0 && row < rows };
}

function createEmptyMask(columns: number, rows: number): TerrainMask {
  return { columns, rows, isFilled: () => false };
}

function createIslandLandMask(columns: number, rows: number, seed: number): TerrainMask {
  const values = new Set<string>();
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const radiusX = Math.max(2, columns * 0.46);
  const radiusY = Math.max(2, rows * 0.46);
  const vertexCount = 10;
  const radii = Array.from({ length: vertexCount }, (_, index) => 0.92 + seededNoise(index, seed * 0.01, seed + 17) * 0.08);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column - centerX) / radiusX;
      const ny = (row - centerY) / radiusY;
      const distance = Math.sqrt(nx * nx + ny * ny);
      let angle = Math.atan2(ny, nx);
      if (angle < 0) angle += Math.PI * 2;
      const segment = (angle / (Math.PI * 2)) * vertexCount;
      const index = Math.floor(segment) % vertexCount;
      const allowedRadius = lerp(radii[index], radii[(index + 1) % vertexCount], smoothStep(segment - Math.floor(segment)));
      if (distance <= allowedRadius) values.add(`${column}:${row}`);
    }
  }
  removeTinyIslands(values, columns, rows);
  return setMask(columns, rows, values);
}

function createWaterFeatureMask(columns: number, rows: number, seed: number, landMask: TerrainMask): TerrainMask {
  const values = new Set<string>();
  if (seededNoise(seed, seed + 13, seed + 29) > 0.25) createLakeFeature(values, columns, rows, seed, landMask);
  else createRiverFeature(values, columns, rows, seed, landMask);
  removeTinyIslands(values, columns, rows);
  return setMask(columns, rows, values);
}

function createLakeFeature(values: Set<string>, columns: number, rows: number, seed: number, landMask: TerrainMask): void {
  const lakeCount = Math.min(2, Math.max(1, Math.floor(Math.min(columns, rows) / 70) + 1));
  for (let index = 0; index < lakeCount; index += 1) {
    paintEllipse(values, landMask, Math.round(columns * (0.30 + normalizedNoise(seed + index * 11, 7, seed) * 0.40)), Math.round(rows * (0.30 + normalizedNoise(seed + index * 17, 13, seed) * 0.40)), Math.max(3, Math.round(columns * (0.045 + normalizedNoise(seed, index + 23, seed) * 0.035))), Math.max(3, Math.round(rows * (0.045 + normalizedNoise(seed + 31, index, seed) * 0.035))));
  }
}

function createRiverFeature(values: Set<string>, columns: number, rows: number, seed: number, landMask: TerrainMask): void {
  const horizontal = seededNoise(seed, seed + 13, seed + 29) > 0;
  const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.025));
  const start: GridPoint = horizontal ? { column: 0, row: Math.round(rows * (0.25 + normalizedNoise(seed, 1, seed) * 0.5)) } : { column: Math.round(columns * (0.25 + normalizedNoise(seed, 2, seed) * 0.5)), row: 0 };
  const end: GridPoint = horizontal ? { column: columns - 1, row: Math.round(rows * (0.25 + normalizedNoise(seed, 3, seed) * 0.5)) } : { column: Math.round(columns * (0.25 + normalizedNoise(seed, 4, seed) * 0.5)), row: rows - 1 };
  const controlA: GridPoint = horizontal ? { column: Math.round(columns * 0.33), row: Math.round(rows * (0.20 + normalizedNoise(seed, 5, seed) * 0.6)) } : { column: Math.round(columns * (0.20 + normalizedNoise(seed, 6, seed) * 0.6)), row: Math.round(rows * 0.33) };
  const controlB: GridPoint = horizontal ? { column: Math.round(columns * 0.66), row: Math.round(rows * (0.20 + normalizedNoise(seed, 7, seed) * 0.6)) } : { column: Math.round(columns * (0.20 + normalizedNoise(seed, 8, seed) * 0.6)), row: Math.round(rows * 0.66) };
  paintCubicPath(values, landMask, start, controlA, controlB, end, width);
}

function createRoadMask(columns: number, rows: number, seed: number, landMask: TerrainMask, waterMask: TerrainMask): TerrainMask {
  const values = new Set<string>();
  const horizontal = seededNoise(seed, seed + 5, seed + 11) > 0;
  const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.012));
  const center: GridPoint = { column: Math.round(columns * (0.45 + normalizedNoise(seed, 19, seed) * 0.10)), row: Math.round(rows * (0.45 + normalizedNoise(seed, 29, seed) * 0.10)) };
  const start: GridPoint = horizontal ? { column: 0, row: Math.round(rows * (0.30 + normalizedNoise(seed, 31, seed) * 0.40)) } : { column: Math.round(columns * (0.30 + normalizedNoise(seed, 37, seed) * 0.40)), row: 0 };
  const end: GridPoint = horizontal ? { column: columns - 1, row: Math.round(rows * (0.30 + normalizedNoise(seed, 41, seed) * 0.40)) } : { column: Math.round(columns * (0.30 + normalizedNoise(seed, 43, seed) * 0.40)), row: rows - 1 };
  paintSteppedPath(values, landMask, waterMask, start, center, width);
  paintSteppedPath(values, landMask, waterMask, center, end, width);
  paintDisc(values, landMask, center.column, center.row, Math.max(width + 1, 2), waterMask);
  return setMask(columns, rows, values);
}

function paintSteppedPath(values: Set<string>, landMask: TerrainMask, waterMask: TerrainMask, start: GridPoint, end: GridPoint, width: number): void {
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

function paintCubicPath(values: Set<string>, bounds: TerrainMask, start: GridPoint, controlA: GridPoint, controlB: GridPoint, end: GridPoint, width: number): void {
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
  return { column: Math.round(inv * inv * inv * start.column + 3 * inv * inv * t * controlA.column + 3 * inv * t * t * controlB.column + t * t * t * end.column), row: Math.round(inv * inv * inv * start.row + 3 * inv * inv * t * controlA.row + 3 * inv * t * t * controlB.row + t * t * t * end.row) };
}

function paintLine(values: Set<string>, bounds: TerrainMask, start: GridPoint, end: GridPoint, width: number): void {
  const steps = Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    paintDisc(values, bounds, Math.round(lerp(start.column, end.column, t)), Math.round(lerp(start.row, end.row, t)), width);
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

function paintDisc(values: Set<string>, bounds: TerrainMask, centerColumn: number, centerRow: number, radius: number, avoidMask?: TerrainMask): void {
  for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
    for (let column = centerColumn - radius; column <= centerColumn + radius; column += 1) {
      const dx = column - centerColumn;
      const dy = row - centerRow;
      if (dx * dx + dy * dy <= radius * radius && bounds.isFilled(column, row) && !avoidMask?.isFilled(column, row)) values.add(`${column}:${row}`);
    }
  }
}

function removeTinyIslands(values: Set<string>, columns: number, rows: number): void {
  const toDelete: string[] = [];
  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      const key = `${column}:${row}`;
      if (values.has(key) && countFilledNeighbors(values, column, row) <= 1) toDelete.push(key);
    }
  }
  for (const key of toDelete) values.delete(key);
}

function countFilledNeighbors(values: Set<string>, column: number, row: number): number {
  let count = 0;
  for (let y = row - 1; y <= row + 1; y += 1) {
    for (let x = column - 1; x <= column + 1; x += 1) {
      if ((x !== column || y !== row) && values.has(`${x}:${y}`)) count += 1;
    }
  }
  return count;
}

function setMask(columns: number, rows: number, values: Set<string>): TerrainMask {
  return { columns, rows, isFilled: (column, row) => column >= 0 && column < columns && row >= 0 && row < rows && values.has(`${column}:${row}`) };
}

function readStoredTerrainRuleSet(): EditorTerrainRuleSet | undefined {
  try {
    const raw = window.localStorage.getItem(DEFAULT_TERRAIN_RULE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rules)) return undefined;
    return parsed;
  } catch (error) {
    console.warn('[TerrainGenerator] Failed to load stored terrain rules.', error);
    return undefined;
  }
}

function readStoredTerrainShape(): TerrainGenerationShape { try { return window.localStorage.getItem(DEFAULT_TERRAIN_SHAPE_KEY) === 'island' ? 'island' : 'rect'; } catch { return 'rect'; } }
function readStoredTerrainSeed(): number { try { return normalizeSeed(Number(window.localStorage.getItem(DEFAULT_TERRAIN_SEED_KEY) ?? '1')); } catch { return 1; } }
function loadImageSize(url: string): Promise<{ width: number; height: number } | null> { return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => resolve(null); image.src = url; }); }
function createTilesetKey(id: string, url: string): string { return `${id}:${url}`; }
function isImageAssetUrl(url: string): boolean { return !url.startsWith('solid://') && !url.startsWith('editor://'); }
function getDefaultMovementMode(material: EditorTerrainMaterial): EditorTerrainMovementMode { if (material === 'water') return 'boatOnly'; if (material === 'rock') return 'blocked'; return 'passable'; }
function layeredNoise(column: number, row: number, seed: number, coarseScale: number, mediumScale: number, fineScale: number): number {
  const coarse = normalizedNoise(Math.floor(column / coarseScale), Math.floor(row / coarseScale), seed);
  const medium = normalizedNoise(Math.floor(column / mediumScale), Math.floor(row / mediumScale), seed + 101);
  const fine = normalizedNoise(Math.floor(column / fineScale), Math.floor(row / fineScale), seed + 211);
  return coarse * 0.58 + medium * 0.30 + fine * 0.12;
}
function normalizedNoise(x: number, y: number, seed: number): number { return seededNoise(x, y, seed) * 0.5 + 0.5; }
function seededNoise(x: number, y: number, seed: number): number { const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return (value - Math.floor(value)) * 2 - 1; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smoothStep(t: number): number { return t * t * (3 - 2 * t); }
function normalizeGridSize(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.min(256, Math.round(value as number))); }
function normalizeScale(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 1 : Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10)); }
function normalizeWeight(value: number | undefined): number { return !Number.isFinite(value) || (value as number) < 0 ? 1 : Math.max(0, Math.min(100, Math.round(value as number))); }
function normalizeSeed(value: number): number { return !Number.isFinite(value) ? 1 : Math.max(0, Math.min(999_999_999, Math.round(value))); }
function normalizePositiveInteger(value: number | undefined, fallback: number): number { return !Number.isFinite(value) ? fallback : Math.max(1, Math.round(value as number)); }
