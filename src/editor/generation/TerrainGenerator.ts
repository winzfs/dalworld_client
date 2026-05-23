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

type FeatureKind = 'water' | 'road';
type Tile = { asset: EditorTilesetAsset; sourceRect: EditorSourceRect; scale: number; weight: number; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; role: EditorTerrainTileRole };
type Family = { key: string; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; tiles: Tile[]; nonDecorative: Tile[]; byRole: Map<EditorTerrainTileRole, Tile[]> };
type Cell = { land: boolean; base: Family | null; feature: FeatureKind | null; featureFamily: Family | null };
type Mask = { columns: number; rows: number; has(column: number, row: number): boolean };
type Point = { column: number; row: number };
type Region = { family: Family; column: number; row: number; radiusBias: number };

const DEFAULT_RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';
const DEFAULT_SHAPE_KEY = 'dalworld:editor-terrain-shape:dalworld-map';
const DEFAULT_SEED_KEY = 'dalworld:editor-terrain-seed:dalworld-map';
const DEFAULT_PLACEMENT_MULTIPLIER = 4;
const DECORATIVE_PATCH_THRESHOLD = 0.62;
const DECORATIVE_PATCH_CHANCE = 0.16;

export async function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredSeed());
  const ruleSet = options.terrainRuleSet ?? readStoredRuleSet();
  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const columns = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const maxPlacements = normalizePositiveInteger(options.maxPlacements, columns * rows * DEFAULT_PLACEMENT_MULTIPLIER);
  const families = await collectFamilies(options.tilesets, gridSize, ruleSet);
  const baseFamilies = families.filter((family) => isBaseMaterial(family.material) && family.nonDecorative.length > 0);
  if (baseFamilies.length === 0) return [];

  const waterFamilies = families.filter((family) => family.material === 'water' && family.nonDecorative.length > 0);
  const roadFamilies = families.filter((family) => family.material === 'road' && family.nonDecorative.length > 0);
  const decorativeFamilies = families.filter((family) => family.byRole.has('decorative') && !['water', 'road', 'rock'].includes(family.material));

  const shape = options.shape ?? readStoredShape();
  const landMask = shape === 'island' ? createIslandMask(columns, rows, seed) : createFullMask(columns, rows);
  const waterMask = waterFamilies.length > 0 ? createWaterMask(columns, rows, seed + 307, landMask) : createEmptyMask(columns, rows);
  const roadMask = roadFamilies.length > 0 ? createRoadMask(columns, rows, seed + 419, landMask, waterMask) : createEmptyMask(columns, rows);
  const cells = createCells({ columns, rows, seed, landMask, waterMask, roadMask, baseFamilies, waterFamilies, roadFamilies });
  const placements: EditorTilePlacement[] = [];
  const counters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  appendBasePlacements(placements, cells, gridSize, seed, counters, maxPlacements);
  appendFeaturePlacements(placements, cells, gridSize, seed + 307, counters, maxPlacements, 'water');
  appendFeaturePlacements(placements, cells, gridSize, seed + 419, counters, maxPlacements, 'road');
  appendDecorativePlacements(placements, cells, gridSize, seed + 613, maxPlacements, decorativeFamilies);
  return placements;
}

function createCells(options: { columns: number; rows: number; seed: number; landMask: Mask; waterMask: Mask; roadMask: Mask; baseFamilies: Family[]; waterFamilies: Family[]; roadFamilies: Family[] }): Cell[][] {
  const baseRegions = createRegions(options.baseFamilies, options.columns, options.rows, options.seed + 17, 1.7);
  const waterRegions = createRegions(options.waterFamilies, options.columns, options.rows, options.seed + 307, 1);
  const roadRegions = createRegions(options.roadFamilies, options.columns, options.rows, options.seed + 419, 1);
  const cells: Cell[][] = [];
  for (let row = 0; row < options.rows; row += 1) {
    const line: Cell[] = [];
    for (let column = 0; column < options.columns; column += 1) {
      const land = options.landMask.has(column, row);
      line.push({ land, base: land ? pickFamilyFromRegions(baseRegions, options.baseFamilies, column, row, options.seed + 17) : null, feature: null, featureFamily: null });
    }
    cells.push(line);
  }
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land) return;
    if (options.waterFamilies.length > 0 && options.waterMask.has(column, row)) {
      cell.feature = 'water';
      cell.featureFamily = pickFamilyFromRegions(waterRegions, options.waterFamilies, column, row, options.seed + 307);
      return;
    }
    if (options.roadFamilies.length > 0 && options.roadMask.has(column, row)) {
      cell.feature = 'road';
      cell.featureFamily = pickFamilyFromRegions(roadRegions, options.roadFamilies, column, row, options.seed + 419);
    }
  });
  applyRpgBiomePass(cells, options.baseFamilies, options.seed + 733);
  applyTransitionPass(cells, options.baseFamilies, options.seed + 809);
  smoothBase(cells, 3);
  return cells;
}

function applyRpgBiomePass(cells: Cell[][], baseFamilies: Family[], seed: number): void {
  const grass = baseFamilies.filter((family) => family.material === 'grass');
  const dirt = baseFamilies.filter((family) => family.material === 'dirt');
  const sand = baseFamilies.filter((family) => family.material === 'sand');
  const rock = baseFamilies.filter((family) => family.material === 'rock');
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  if (baseFamilies.length <= 1 || columns <= 0 || rows <= 0) return;
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land || cell.feature) return;
    const nx = columns <= 1 ? 0 : column / (columns - 1);
    const ny = rows <= 1 ? 0 : row / (rows - 1);
    const centerDx = nx - 0.5;
    const centerDy = ny - 0.5;
    const centerDistance = Math.sqrt(centerDx * centerDx + centerDy * centerDy) / 0.7071;
    const moisture = layeredNoise(column, row, seed, 36, 15, 6);
    const dryness = layeredNoise(column + 91, row - 37, seed + 191, 48, 18, 7);
    const roughness = layeredNoise(column - 57, row + 83, seed + 337, 22, 8, 3);
    const ridgeA = ridgeScore(nx, ny, 0.18 + normalizedNoise(1, 2, seed) * 0.18, 0.12 + normalizedNoise(3, 4, seed) * 0.18, 0.82, 0.76);
    const ridgeB = ridgeScore(nx, ny, 0.12, 0.78, 0.88, 0.24) * 0.78;
    const mountainScore = Math.max(ridgeA, ridgeB) * 0.65 + roughness * 0.35 + Math.max(0, centerDistance - 0.62) * 0.18;
    const clearingScore = normalizedNoise(Math.floor(column / 11), Math.floor(row / 11), seed + 503);
    let pool: Family[] = grass.length > 0 ? grass : baseFamilies;
    if (mountainScore > 0.77 && rock.length > 0) pool = rock;
    else if (dryness > 0.72 && sand.length > 0 && centerDistance > 0.34) pool = sand;
    else if ((moisture < 0.35 || clearingScore > 0.76) && dirt.length > 0) pool = dirt;
    else if (grass.length === 0) pool = dirt.length > 0 ? dirt : sand.length > 0 ? sand : rock.length > 0 ? rock : baseFamilies;
    const family = pickTransitionFamily(pool, column, row, seed + 17);
    if (family) cell.base = family;
  });
}

function applyTransitionPass(cells: Cell[][], baseFamilies: Family[], seed: number): void {
  const grass = baseFamilies.filter((family) => family.material === 'grass');
  const sand = baseFamilies.filter((family) => family.material === 'sand');
  const dirt = baseFamilies.filter((family) => family.material === 'dirt');
  if (sand.length === 0 && dirt.length === 0) return;
  const updates: Array<{ column: number; row: number; family: Family }> = [];
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land || cell.feature) return;
    const waterDistance = distanceToFeature(cells, column, row, 'water', 3);
    const roadDistance = distanceToFeature(cells, column, row, 'road', 3);
    if (waterDistance === 1) {
      const family = pickTransitionFamily(sand.length > 0 ? sand : dirt, column, row, seed + 31);
      if (family) updates.push({ column, row, family });
      return;
    }
    if (waterDistance === 2) {
      const pool = sand.length > 0 && dirt.length > 0 ? (normalizedNoise(column, row, seed + 53) > 0.45 ? sand : dirt) : sand.length > 0 ? sand : dirt;
      const family = pickTransitionFamily(pool, column, row, seed + 53);
      if (family) updates.push({ column, row, family });
      return;
    }
    if (roadDistance === 1 && dirt.length > 0) {
      const family = pickTransitionFamily(dirt, column, row, seed + 47);
      if (family) updates.push({ column, row, family });
      return;
    }
    if (roadDistance <= 3 && roadDistance > 0 && dirt.length > 0 && normalizedNoise(Math.floor(column / 2), Math.floor(row / 2), seed + 73) > 0.22) {
      const pool = grass.length > 0 && normalizedNoise(column, row, seed + 79) > 0.74 ? grass : dirt;
      const family = pickTransitionFamily(pool, column, row, seed + 79);
      if (family) updates.push({ column, row, family });
    }
  });
  for (const update of updates) cells[update.row][update.column].base = update.family;
}

function smoothBase(cells: Cell[][], passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const updates: Array<{ column: number; row: number; family: Family }> = [];
    forEachCell(cells, (cell, column, row) => {
      if (!cell.land || cell.feature || !cell.base) return;
      const counts = new Map<string, { family: Family; count: number }>();
      for (let y = row - 1; y <= row + 1; y += 1) {
        for (let x = column - 1; x <= column + 1; x += 1) {
          if (x === column && y === row) continue;
          const neighbor = cells[y]?.[x];
          if (!neighbor?.land || neighbor.feature || !neighbor.base) continue;
          const entry = counts.get(neighbor.base.key) ?? { family: neighbor.base, count: 0 };
          entry.count += 1;
          counts.set(neighbor.base.key, entry);
        }
      }
      const currentCount = counts.get(cell.base.key)?.count ?? 0;
      let best: { family: Family; count: number } | null = null;
      for (const candidate of counts.values()) if (!best || candidate.count > best.count) best = candidate;
      if (best && best.count >= 5 && currentCount <= 2) updates.push({ column, row, family: best.family });
    });
    for (const update of updates) cells[update.row][update.column].base = update.family;
  }
}

function appendBasePlacements(placements: EditorTilePlacement[], cells: Cell[][], gridSize: number, seed: number, counters: Map<string, Map<EditorTerrainTileRole | 'all', number>>, max: number): void {
  forEachCell(cells, (cell, column, row) => {
    if (placements.length >= max || !cell.land || !cell.base) return;
    const tile = pickTileForRole(cell.base, resolveLandRole(cells, column, row), column, row, seed, getCounters(counters, cell.base));
    placements.push(createPlacement(tile, column * gridSize, row * gridSize));
  });
}

function appendFeaturePlacements(placements: EditorTilePlacement[], cells: Cell[][], gridSize: number, seed: number, counters: Map<string, Map<EditorTerrainTileRole | 'all', number>>, max: number, feature: FeatureKind): void {
  forEachCell(cells, (cell, column, row) => {
    if (placements.length >= max || cell.feature !== feature || !cell.featureFamily) return;
    const tile = pickTileForRole(cell.featureFamily, resolveFeatureRole(cells, column, row, feature), column, row, seed, getCounters(counters, cell.featureFamily));
    placements.push(createPlacement(tile, column * gridSize, row * gridSize));
  });
}

function appendDecorativePlacements(placements: EditorTilePlacement[], cells: Cell[][], gridSize: number, seed: number, max: number, families: Family[]): void {
  if (families.length === 0) return;
  forEachCell(cells, (cell, column, row) => {
    if (placements.length >= max || !cell.land || cell.feature || cell.base?.material === 'rock') return;
    const tile = pickDecorativeTile(families, column, row, seed);
    if (tile) placements.push(createPlacement(tile, column * gridSize, row * gridSize));
  });
}

async function collectFamilies(tilesets: EditorTilesetAsset[], gridSize: number, ruleSet: EditorTerrainRuleSet | undefined): Promise<Family[]> {
  const hasRules = Boolean(ruleSet && ruleSet.rules.length > 0);
  const ruleTiles = collectRuleTiles(tilesets, gridSize, ruleSet);
  if (ruleTiles.length > 0) return createFamilies(ruleTiles);
  if (hasRules) return [];
  return createFamilies(await collectFallbackTiles(tilesets, gridSize));
}

function collectRuleTiles(tilesets: EditorTilesetAsset[], gridSize: number, ruleSet: EditorTerrainRuleSet | undefined): Tile[] {
  if (!ruleSet || ruleSet.rules.length === 0) return [];
  const assetByKey = new Map<string, EditorTilesetAsset>();
  for (const asset of tilesets) assetByKey.set(createTilesetKey(asset.id, asset.url), asset);
  const settingsByKey = new Map<string, { material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; scale: number }>();
  for (const setting of ruleSet.tilesets ?? []) {
    const material = setting.material ?? 'grass';
    settingsByKey.set(createTilesetKey(setting.tilesetId, setting.tilesetUrl), { material, movementMode: setting.movementMode ?? getDefaultMovementMode(material), scale: normalizeScale(setting.scale) });
  }
  const result: Tile[] = [];
  const seen = new Set<string>();
  for (const rule of ruleSet.rules) {
    const key = createTilesetKey(rule.tilesetId, rule.tilesetUrl);
    const asset = assetByKey.get(key);
    if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue;
    const settings = settingsByKey.get(key);
    const material = rule.material ?? settings?.material ?? 'grass';
    const movementMode = rule.movementMode ?? settings?.movementMode ?? getDefaultMovementMode(material);
    const scale = normalizeScale(settings?.scale ?? rule.scale);
    if (!ruleFitsGrid(rule, scale, gridSize)) continue;
    const weight = normalizeWeight(rule.weight);
    if (weight <= 0) continue;
    const role = rule.role ?? 'center';
    const identity = `${key}:${rule.sourceRect.x}:${rule.sourceRect.y}:${rule.sourceRect.width}:${rule.sourceRect.height}:${role}:${scale}:${weight}:${material}:${movementMode}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push({ asset, sourceRect: { ...rule.sourceRect }, scale, weight, material, movementMode, role });
  }
  return result;
}

async function collectFallbackTiles(tilesets: EditorTilesetAsset[], gridSize: number): Promise<Tile[]> {
  const result: Tile[] = [];
  const seen = new Set<string>();
  for (const asset of tilesets) {
    if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue;
    const size = await loadImageSize(asset.url);
    if (!size) continue;
    for (let y = 0; y + gridSize <= size.height; y += gridSize) {
      for (let x = 0; x + gridSize <= size.width; x += gridSize) {
        const sourceRect = { x, y, width: gridSize, height: gridSize };
        const identity = `${asset.id}:${asset.url}:${x}:${y}:${gridSize}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        result.push({ asset, sourceRect, scale: 1, weight: 1, material: 'grass', movementMode: 'passable', role: 'center' });
      }
    }
  }
  return result;
}

function createFamilies(tiles: Tile[]): Family[] {
  const map = new Map<string, Family>();
  for (const tile of tiles) {
    const key = `${tile.asset.id}:${tile.asset.url}:${tile.material}:${tile.movementMode}`;
    let family = map.get(key);
    if (!family) {
      family = { key, material: tile.material, movementMode: tile.movementMode, tiles: [], nonDecorative: [], byRole: new Map() };
      map.set(key, family);
    }
    family.tiles.push(tile);
    if (tile.role !== 'decorative') family.nonDecorative.push(tile);
    const list = family.byRole.get(tile.role) ?? [];
    list.push(tile);
    family.byRole.set(tile.role, list);
  }
  return [...map.values()].filter((family) => family.tiles.length > 0);
}

function isBaseMaterial(material: EditorTerrainMaterial): boolean { return material === 'grass' || material === 'dirt' || material === 'sand' || material === 'rock'; }
function ruleFitsGrid(rule: EditorTerrainTileRule, scale: number, gridSize: number): boolean { const width = normalizePositiveInteger(rule.sourceRect?.width, normalizeGridSize(rule.tileSize)); const height = normalizePositiveInteger(rule.sourceRect?.height, normalizeGridSize(rule.tileSize)); return Math.round(width * scale) === gridSize && Math.round(height * scale) === gridSize; }
function createRegions(families: Family[], columns: number, rows: number, seed: number, density: number): Region[] { if (families.length === 0) return []; if (families.length === 1) return [{ family: families[0], column: columns / 2, row: rows / 2, radiusBias: 1 }]; const count = Math.max(families.length, Math.min(families.length * 3, Math.round(Math.sqrt(columns * rows) / 16 * density))); const regions: Region[] = []; for (let index = 0; index < count; index += 1) regions.push({ family: families[index % families.length], column: normalizedNoise(seed + index * 17, index * 31 + 3, seed) * columns, row: normalizedNoise(seed + index * 29, index * 37 + 7, seed + 101) * rows, radiusBias: 0.7 + normalizedNoise(seed + index * 41, index * 43 + 11, seed + 203) * 0.75 }); return regions; }
function pickFamilyFromRegions(regions: Region[], fallback: Family[], column: number, row: number, seed: number): Family { if (regions.length === 0) return fallback[0]; if (regions.length === 1) return regions[0].family; const sampleColumn = column + seededNoise(Math.floor(column / 7), Math.floor(row / 7), seed + 911) * 4; const sampleRow = row + seededNoise(Math.floor(column / 9), Math.floor(row / 9), seed + 1291) * 4; let best = regions[0]; let bestScore = Number.POSITIVE_INFINITY; for (const region of regions) { const dx = sampleColumn - region.column; const dy = sampleRow - region.row; const score = (dx * dx + dy * dy) / Math.max(0.1, region.radiusBias); if (score < bestScore) { bestScore = score; best = region; } } return best.family; }
function pickTransitionFamily(families: Family[], column: number, row: number, seed: number): Family | null { if (families.length === 0) return null; const index = Math.floor(normalizedNoise(column * 11 + 5, row * 13 + 7, seed) * families.length) % families.length; return families[index] ?? families[0]; }
function pickTileForRole(family: Family, role: EditorTerrainTileRole, column: number, row: number, seed: number, counters: Map<EditorTerrainTileRole | 'all', number>): Tile { const candidates = family.byRole.get(role) ?? family.byRole.get('center') ?? family.nonDecorative; const counterKey = family.byRole.has(role) ? role : family.byRole.has('center') ? 'center' : 'all'; const index = counters.get(counterKey) ?? 0; counters.set(counterKey, index + 1); return pickWeighted(candidates.length > 0 ? candidates : family.tiles, column, row, seed, index); }
function pickDecorativeTile(families: Family[], column: number, row: number, seed: number): Tile | null { const candidates = families.flatMap((family) => family.byRole.get('decorative') ?? []); if (candidates.length === 0) return null; if (normalizedNoise(Math.floor(column / 5), Math.floor(row / 5), seed + 71) < DECORATIVE_PATCH_THRESHOLD) return null; if (normalizedNoise(column * 19 + 3, row * 23 + 5, seed + 193) > DECORATIVE_PATCH_CHANCE) return null; return pickWeighted(candidates, column + 101, row + 203, seed + 389, 0); }
function pickWeighted(candidates: Tile[], column: number, row: number, seed: number, salt: number): Tile { const total = candidates.reduce((sum, tile) => sum + tile.weight, 0); if (total <= 0) return candidates[0]; const roll = normalizedNoise(column * 31 + salt * 17, row * 37 + salt * 13, seed + 541) * total; let cursor = 0; for (const tile of candidates) { cursor += tile.weight; if (roll <= cursor) return tile; } return candidates[candidates.length - 1]; }
function createPlacement(tile: Tile, x: number, y: number): EditorTilePlacement { const sourceRect = { ...tile.sourceRect }; return { id: crypto.randomUUID(), assetId: tile.asset.id, assetUrl: tile.asset.url, categoryId: tile.asset.categoryId, x, y, layer: 'ground', scale: 1, displayWidth: Math.max(1, Math.round(sourceRect.width * tile.scale)), displayHeight: Math.max(1, Math.round(sourceRect.height * tile.scale)), sourceRect, solidColor: undefined, transparentBlack: false, gameplay: undefined, terrainMaterial: tile.material, terrainMovementMode: tile.movementMode }; }
function getCounters(store: Map<string, Map<EditorTerrainTileRole | 'all', number>>, family: Family): Map<EditorTerrainTileRole | 'all', number> { let counters = store.get(family.key); if (!counters) { counters = new Map<EditorTerrainTileRole | 'all', number>(); store.set(family.key, counters); } return counters; }
function resolveLandRole(cells: Cell[][], column: number, row: number): EditorTerrainTileRole { return resolveRole(column, row, (x, y) => Boolean(cells[y]?.[x]?.land)); }
function resolveFeatureRole(cells: Cell[][], column: number, row: number, feature: FeatureKind): EditorTerrainTileRole { return resolveRole(column, row, (x, y) => cells[y]?.[x]?.feature === feature); }
function resolveRole(column: number, row: number, same: (column: number, row: number) => boolean): EditorTerrainTileRole { const top = same(column, row - 1); const bottom = same(column, row + 1); const left = same(column - 1, row); const right = same(column + 1, row); if (!top && !left) return 'outerTopLeft'; if (!top && !right) return 'outerTopRight'; if (!bottom && !left) return 'outerBottomLeft'; if (!bottom && !right) return 'outerBottomRight'; if (!top) return 'edgeTop'; if (!bottom) return 'edgeBottom'; if (!left) return 'edgeLeft'; if (!right) return 'edgeRight'; if (!same(column - 1, row - 1)) return 'innerTopLeft'; if (!same(column + 1, row - 1)) return 'innerTopRight'; if (!same(column - 1, row + 1)) return 'innerBottomLeft'; if (!same(column + 1, row + 1)) return 'innerBottomRight'; return 'center'; }
function distanceToFeature(cells: Cell[][], column: number, row: number, feature: FeatureKind, radius: number): number { for (let distance = 1; distance <= radius; distance += 1) { for (let y = row - distance; y <= row + distance; y += 1) { for (let x = column - distance; x <= column + distance; x += 1) { if (Math.max(Math.abs(x - column), Math.abs(y - row)) !== distance) continue; if (cells[y]?.[x]?.feature === feature) return distance; } } } return 0; }
function forEachCell(cells: Cell[][], callback: (cell: Cell, column: number, row: number) => void): void { for (let row = 0; row < cells.length; row += 1) { const line = cells[row]; for (let column = 0; column < line.length; column += 1) callback(line[column], column, row); } }
function createFullMask(columns: number, rows: number): Mask { return { columns, rows, has: (column, row) => column >= 0 && column < columns && row >= 0 && row < rows }; }
function createEmptyMask(columns: number, rows: number): Mask { return { columns, rows, has: () => false }; }
function createIslandMask(columns: number, rows: number, seed: number): Mask { const values = new Set<string>(); const centerX = (columns - 1) / 2; const centerY = (rows - 1) / 2; const radiusX = Math.max(2, columns * 0.47); const radiusY = Math.max(2, rows * 0.47); const vertexCount = 14; const radii = Array.from({ length: vertexCount }, (_, index) => 0.88 + seededNoise(index, seed * 0.01, seed + 17) * 0.11); for (let row = 0; row < rows; row += 1) { for (let column = 0; column < columns; column += 1) { const nx = (column - centerX) / radiusX; const ny = (row - centerY) / radiusY; const distance = Math.sqrt(nx * nx + ny * ny); let angle = Math.atan2(ny, nx); if (angle < 0) angle += Math.PI * 2; const segment = (angle / (Math.PI * 2)) * vertexCount; const index = Math.floor(segment) % vertexCount; const allowedRadius = lerp(radii[index], radii[(index + 1) % vertexCount], smoothStep(segment - Math.floor(segment))); if (distance <= allowedRadius) values.add(`${column}:${row}`); } } removeTinyIslands(values, columns, rows); return setMask(columns, rows, values); }
function createWaterMask(columns: number, rows: number, seed: number, landMask: Mask): Mask { const values = new Set<string>(); createRiver(values, columns, rows, seed, landMask); if (seededNoise(seed, seed + 13, seed + 29) > -0.15) createLake(values, columns, rows, seed + 71, landMask); removeTinyIslands(values, columns, rows); return setMask(columns, rows, values); }
function createLake(values: Set<string>, columns: number, rows: number, seed: number, landMask: Mask): void { const count = Math.min(3, Math.max(1, Math.floor(Math.min(columns, rows) / 64) + 1)); for (let index = 0; index < count; index += 1) paintEllipse(values, landMask, Math.round(columns * (0.22 + normalizedNoise(seed + index * 11, 7, seed) * 0.56)), Math.round(rows * (0.22 + normalizedNoise(seed + index * 17, 13, seed) * 0.56)), Math.max(3, Math.round(columns * (0.035 + normalizedNoise(seed, index + 23, seed) * 0.032))), Math.max(3, Math.round(rows * (0.035 + normalizedNoise(seed + 31, index, seed) * 0.032)))); }
function createRiver(values: Set<string>, columns: number, rows: number, seed: number, landMask: Mask): void { const horizontal = seededNoise(seed, seed + 13, seed + 29) > 0; const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.022)); const start = horizontal ? { column: 0, row: Math.round(rows * (0.2 + normalizedNoise(seed, 1, seed) * 0.6)) } : { column: Math.round(columns * (0.2 + normalizedNoise(seed, 2, seed) * 0.6)), row: 0 }; const end = horizontal ? { column: columns - 1, row: Math.round(rows * (0.2 + normalizedNoise(seed, 3, seed) * 0.6)) } : { column: Math.round(columns * (0.2 + normalizedNoise(seed, 4, seed) * 0.6)), row: rows - 1 }; const a = horizontal ? { column: Math.round(columns * 0.32), row: Math.round(rows * (0.12 + normalizedNoise(seed, 5, seed) * 0.76)) } : { column: Math.round(columns * (0.12 + normalizedNoise(seed, 6, seed) * 0.76)), row: Math.round(rows * 0.32) }; const b = horizontal ? { column: Math.round(columns * 0.68), row: Math.round(rows * (0.12 + normalizedNoise(seed, 7, seed) * 0.76)) } : { column: Math.round(columns * (0.12 + normalizedNoise(seed, 8, seed) * 0.76)), row: Math.round(rows * 0.68) }; paintCubic(values, landMask, start, a, b, end, width); }
function createRoadMask(columns: number, rows: number, seed: number, landMask: Mask, waterMask: Mask): Mask { const values = new Set<string>(); const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.011)); const hub = { column: Math.round(columns * (0.44 + normalizedNoise(seed, 19, seed) * 0.12)), row: Math.round(rows * (0.44 + normalizedNoise(seed, 29, seed) * 0.12)) }; const horizontal = seededNoise(seed, seed + 5, seed + 11) > 0; const entranceA = horizontal ? { column: 0, row: Math.round(rows * (0.22 + normalizedNoise(seed, 31, seed) * 0.56)) } : { column: Math.round(columns * (0.22 + normalizedNoise(seed, 37, seed) * 0.56)), row: 0 }; const entranceB = horizontal ? { column: columns - 1, row: Math.round(rows * (0.22 + normalizedNoise(seed, 41, seed) * 0.56)) } : { column: Math.round(columns * (0.22 + normalizedNoise(seed, 43, seed) * 0.56)), row: rows - 1 }; const entranceC = horizontal ? { column: Math.round(columns * (0.2 + normalizedNoise(seed, 47, seed) * 0.6)), row: seededNoise(seed, 51, seed) > 0 ? 0 : rows - 1 } : { column: seededNoise(seed, 53, seed) > 0 ? 0 : columns - 1, row: Math.round(rows * (0.2 + normalizedNoise(seed, 59, seed) * 0.6)) }; paintCurvedRoad(values, landMask, waterMask, entranceA, hub, width, seed + 101); paintCurvedRoad(values, landMask, waterMask, hub, entranceB, width, seed + 203); if (normalizedNoise(seed, 61, seed + 307) > 0.35) paintCurvedRoad(values, landMask, waterMask, hub, entranceC, width, seed + 409); paintDisc(values, landMask, hub.column, hub.row, Math.max(width + 2, 3), waterMask); return setMask(columns, rows, values); }
function paintCurvedRoad(values: Set<string>, landMask: Mask, avoidMask: Mask, start: Point, end: Point, width: number, seed: number): void { const midA = { column: Math.round(lerp(start.column, end.column, 0.33) + seededNoise(start.column, start.row, seed) * 8), row: Math.round(lerp(start.row, end.row, 0.33) + seededNoise(start.row, start.column, seed + 11) * 8) }; const midB = { column: Math.round(lerp(start.column, end.column, 0.66) + seededNoise(end.column, end.row, seed + 23) * 8), row: Math.round(lerp(start.row, end.row, 0.66) + seededNoise(end.row, end.column, seed + 37) * 8) }; paintCubic(values, { columns: landMask.columns, rows: landMask.rows, has: (column, row) => landMask.has(column, row) && !avoidMask.has(column, row) }, start, midA, midB, end, width); }
function paintStepped(values: Set<string>, landMask: Mask, avoidMask: Mask, start: Point, end: Point, width: number): void { paintCurvedRoad(values, landMask, avoidMask, start, end, width, 1); }
function paintCubic(values: Set<string>, mask: Mask, start: Point, a: Point, b: Point, end: Point, width: number): void { const steps = Math.max(mask.columns, mask.rows) * 2; let previous = start; for (let i = 0; i <= steps; i += 1) { const t = i / Math.max(1, steps); const next = cubicPoint(start, a, b, end, t); paintLine(values, mask, previous, next, width); previous = next; } }
function cubicPoint(start: Point, a: Point, b: Point, end: Point, t: number): Point { const inv = 1 - t; return { column: Math.round(inv * inv * inv * start.column + 3 * inv * inv * t * a.column + 3 * inv * t * t * b.column + t * t * t * end.column), row: Math.round(inv * inv * inv * start.row + 3 * inv * inv * t * a.row + 3 * inv * t * t * b.row + t * t * t * end.row) }; }
function paintLine(values: Set<string>, mask: Mask, start: Point, end: Point, width: number): void { const steps = Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row), 1); for (let i = 0; i <= steps; i += 1) { const t = i / steps; paintDisc(values, mask, Math.round(lerp(start.column, end.column, t)), Math.round(lerp(start.row, end.row, t)), width); } }
function paintEllipse(values: Set<string>, mask: Mask, centerColumn: number, centerRow: number, radiusX: number, radiusY: number): void { for (let row = centerRow - radiusY; row <= centerRow + radiusY; row += 1) { for (let column = centerColumn - radiusX; column <= centerColumn + radiusX; column += 1) { const nx = (column - centerColumn) / Math.max(1, radiusX); const ny = (row - centerRow) / Math.max(1, radiusY); if (nx * nx + ny * ny <= 1 && mask.has(column, row)) values.add(`${column}:${row}`); } } }
function paintDisc(values: Set<string>, mask: Mask, centerColumn: number, centerRow: number, radius: number, avoidMask?: Mask): void { for (let row = centerRow - radius; row <= centerRow + radius; row += 1) { for (let column = centerColumn - radius; column <= centerColumn + radius; column += 1) { const dx = column - centerColumn; const dy = row - centerRow; if (dx * dx + dy * dy <= radius * radius && mask.has(column, row) && !avoidMask?.has(column, row)) values.add(`${column}:${row}`); } } }
function removeTinyIslands(values: Set<string>, columns: number, rows: number): void { const remove: string[] = []; for (let row = 1; row < rows - 1; row += 1) { for (let column = 1; column < columns - 1; column += 1) { const key = `${column}:${row}`; if (values.has(key) && countNeighbors(values, column, row) <= 1) remove.push(key); } } for (const key of remove) values.delete(key); }
function countNeighbors(values: Set<string>, column: number, row: number): number { let count = 0; for (let y = row - 1; y <= row + 1; y += 1) for (let x = column - 1; x <= column + 1; x += 1) if ((x !== column || y !== row) && values.has(`${x}:${y}`)) count += 1; return count; }
function setMask(columns: number, rows: number, values: Set<string>): Mask { return { columns, rows, has: (column, row) => column >= 0 && column < columns && row >= 0 && row < rows && values.has(`${column}:${row}`) }; }
function readStoredRuleSet(): EditorTerrainRuleSet | undefined { try { const raw = window.localStorage.getItem(DEFAULT_RULE_KEY); if (!raw) return undefined; const parsed = JSON.parse(raw) as EditorTerrainRuleSet; return parsed && parsed.version === 1 && Array.isArray(parsed.rules) ? parsed : undefined; } catch { return undefined; } }
function readStoredShape(): TerrainGenerationShape { try { return window.localStorage.getItem(DEFAULT_SHAPE_KEY) === 'island' ? 'island' : 'rect'; } catch { return 'rect'; } }
function readStoredSeed(): number { try { return normalizeSeed(Number(window.localStorage.getItem(DEFAULT_SEED_KEY) ?? '1')); } catch { return 1; } }
function loadImageSize(url: string): Promise<{ width: number; height: number } | null> { return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => resolve(null); image.src = url; }); }
function createTilesetKey(id: string, url: string): string { return `${id}:${url}`; }
function isImageAssetUrl(url: string): boolean { return !url.startsWith('solid://') && !url.startsWith('editor://'); }
function getDefaultMovementMode(material: EditorTerrainMaterial): EditorTerrainMovementMode { if (material === 'water') return 'boatOnly'; if (material === 'rock') return 'blocked'; return 'passable'; }
function ridgeScore(nx: number, ny: number, ax: number, ay: number, bx: number, by: number): number { const abx = bx - ax; const aby = by - ay; const apx = nx - ax; const apy = ny - ay; const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / Math.max(0.0001, abx * abx + aby * aby))); const px = ax + abx * t; const py = ay + aby * t; const distance = Math.hypot(nx - px, ny - py); return Math.max(0, 1 - distance / 0.16); }
function layeredNoise(column: number, row: number, seed: number, coarseScale: number, mediumScale: number, fineScale: number): number { const coarse = normalizedNoise(Math.floor(column / coarseScale), Math.floor(row / coarseScale), seed); const medium = normalizedNoise(Math.floor(column / mediumScale), Math.floor(row / mediumScale), seed + 101); const fine = normalizedNoise(Math.floor(column / fineScale), Math.floor(row / fineScale), seed + 211); return coarse * 0.58 + medium * 0.30 + fine * 0.12; }
function normalizedNoise(x: number, y: number, seed: number): number { return seededNoise(x, y, seed) * 0.5 + 0.5; }
function seededNoise(x: number, y: number, seed: number): number { const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return (value - Math.floor(value)) * 2 - 1; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smoothStep(t: number): number { return t * t * (3 - 2 * t); }
function normalizeGridSize(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.min(256, Math.round(value as number))); }
function normalizeScale(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 1 : Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10)); }
function normalizeWeight(value: number | undefined): number { return !Number.isFinite(value) || (value as number) < 0 ? 1 : Math.max(0, Math.min(100, Math.round(value as number))); }
function normalizeSeed(value: number): number { return !Number.isFinite(value) ? 1 : Math.max(0, Math.min(999_999_999, Math.round(value))); }
function normalizePositiveInteger(value: number | undefined, fallback: number): number { return !Number.isFinite(value) ? fallback : Math.max(1, Math.round(value as number)); }
