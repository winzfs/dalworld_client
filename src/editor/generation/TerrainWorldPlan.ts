import type { EditorTerrainMaterial, EditorTerrainMovementMode, EditorTerrainRuleSet, EditorTerrainTileRole, EditorTerrainTileRule, EditorTilePlacement, EditorTilesetAsset } from '../types';
import type { BasicTerrainGenerationOptions, TerrainGenerationShape } from './TerrainGenerator';

type FeatureKind = 'water' | 'road';
type ZoneKind = 'hub' | 'forest' | 'camp' | 'mine' | 'wild';
type Tile = { asset: EditorTilesetAsset; sourceRect: { x: number; y: number; width: number; height: number }; scale: number; weight: number; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; role: EditorTerrainTileRole };
type Family = { key: string; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; tiles: Tile[]; nonDecorative: Tile[]; byRole: Map<EditorTerrainTileRole, Tile[]> };
type Cell = { land: boolean; base: Family | null; feature: FeatureKind | null; featureFamily: Family | null; zone: ZoneKind | null };
type Mask = { columns: number; rows: number; has(column: number, row: number): boolean };
type Point = { column: number; row: number };
type Zone = Point & { kind: ZoneKind; radius: number; weight: number };
type WorldPlan = { hub: Zone; zones: Zone[]; entrances: Point[] };

const DEFAULT_RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';
const DEFAULT_SHAPE_KEY = 'dalworld:editor-terrain-shape:dalworld-map';
const DEFAULT_SEED_KEY = 'dalworld:editor-terrain-seed:dalworld-map';
const DEFAULT_PLACEMENT_MULTIPLIER = 4;

export async function generateWorldPlanTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredSeed());
  const ruleSet = options.terrainRuleSet ?? readStoredRuleSet();
  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const columns = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const max = normalizePositiveInteger(options.maxPlacements, columns * rows * DEFAULT_PLACEMENT_MULTIPLIER);
  const families = createFamilies(collectRuleTiles(options.tilesets, gridSize, ruleSet));
  const base = families.filter((family) => isBaseMaterial(family.material) && family.nonDecorative.length > 0);
  if (base.length === 0) return [];

  const water = families.filter((family) => family.material === 'water' && family.nonDecorative.length > 0);
  const road = families.filter((family) => family.material === 'road' && family.nonDecorative.length > 0);
  const deco = families.filter((family) => family.byRole.has('decorative') && !['water', 'road', 'rock'].includes(family.material));
  const plan = createWorldPlan(columns, rows, seed + 211);
  const shape = options.shape ?? readStoredShape();
  const land = shape === 'island' ? createIslandMask(columns, rows, seed) : createFullMask(columns, rows);
  const waterMask = water.length > 0 ? createWaterMask(columns, rows, seed + 307, land, plan) : createEmptyMask(columns, rows);
  const roadMask = road.length > 0 ? createRoadMask(columns, rows, seed + 419, land, waterMask, plan) : createEmptyMask(columns, rows);
  const cells = createCells(columns, rows, seed, land, waterMask, roadMask, plan, base, water, road);
  const placements: EditorTilePlacement[] = [];
  const counters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  appendLayer(placements, cells, gridSize, seed, counters, max, 'base');
  appendLayer(placements, cells, gridSize, seed + 307, counters, max, 'water');
  appendLayer(placements, cells, gridSize, seed + 419, counters, max, 'road');
  appendDecorations(placements, cells, gridSize, seed + 613, max, deco);
  return placements;
}

function createCells(columns: number, rows: number, seed: number, land: Mask, waterMask: Mask, roadMask: Mask, plan: WorldPlan, base: Family[], water: Family[], road: Family[]): Cell[][] {
  const cells: Cell[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: Cell[] = [];
    for (let column = 0; column < columns; column += 1) {
      const isLand = land.has(column, row);
      const zone = isLand ? resolveZone(plan, column, row, seed)?.kind ?? null : null;
      line.push({ land: isLand, base: isLand ? pickBaseFamily(base, zone, column, row, columns, rows, seed) : null, feature: null, featureFamily: null, zone });
    }
    cells.push(line);
  }
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land) return;
    if (water.length > 0 && waterMask.has(column, row)) {
      cell.feature = 'water';
      cell.featureFamily = pickFamily(water, column, row, seed + 307);
    } else if (road.length > 0 && roadMask.has(column, row)) {
      cell.feature = 'road';
      cell.featureFamily = pickFamily(road, column, row, seed + 419);
    }
  });
  applyTransitions(cells, base, seed + 809);
  applyStructuralDetails(cells, plan, base, seed + 991);
  smoothBase(cells, 2);
  return cells;
}

function pickBaseFamily(base: Family[], zone: ZoneKind | null, column: number, row: number, columns: number, rows: number, seed: number): Family {
  const grass = byMaterial(base, 'grass');
  const dirt = byMaterial(base, 'dirt');
  const sand = byMaterial(base, 'sand');
  const rock = byMaterial(base, 'rock');
  const nx = columns <= 1 ? 0 : column / (columns - 1);
  const ny = rows <= 1 ? 0 : row / (rows - 1);
  const edge = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2;
  const ridge = Math.max(ridgeScore(nx, ny, 0.12, 0.78, 0.88, 0.24), ridgeScore(nx, ny, 0.18, 0.12, 0.82, 0.78));
  const dry = layeredNoise(column + 91, row - 37, seed + 191, 46, 17, 7);
  const wet = layeredNoise(column, row, seed, 34, 13, 5);
  let pool = grass.length > 0 ? grass : base;
  if (zone === 'hub') pool = dirt.length > 0 && layeredNoise(column, row, seed, 10, 4, 2) > 0.58 ? dirt : grass.length > 0 ? grass : base;
  else if (zone === 'forest') pool = grass.length > 0 ? grass : dirt.length > 0 ? dirt : base;
  else if (zone === 'camp') pool = dirt.length > 0 ? dirt : sand.length > 0 ? sand : base;
  else if (zone === 'mine') pool = rock.length > 0 && layeredNoise(column, row, seed, 11, 5, 2) > 0.42 ? rock : dirt.length > 0 ? dirt : base;
  else if (zone === 'wild') pool = ridge + edge * 0.2 > 0.62 && rock.length > 0 ? rock : grass.length > 0 ? grass : base;
  if (ridge * 0.68 + edge * 0.18 > 0.78 && rock.length > 0) pool = rock;
  else if (dry > 0.74 && sand.length > 0 && zone !== 'hub') pool = sand;
  else if (wet < 0.32 && dirt.length > 0 && zone !== 'forest') pool = dirt;
  return pickFamily(pool, column, row, seed + 17);
}

function applyTransitions(cells: Cell[][], base: Family[], seed: number): void {
  const grass = byMaterial(base, 'grass');
  const sand = byMaterial(base, 'sand');
  const dirt = byMaterial(base, 'dirt');
  const updates: Array<{ column: number; row: number; family: Family }> = [];
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land || cell.feature) return;
    const water = distanceToFeature(cells, column, row, 'water', 3);
    const road = distanceToFeature(cells, column, row, 'road', 3);
    let pool: Family[] = [];
    if (water === 1) pool = sand.length > 0 ? sand : dirt;
    else if (water === 2) pool = sand.length > 0 && dirt.length > 0 ? (noise(column, row, seed) > 0.45 ? sand : dirt) : sand.length > 0 ? sand : dirt;
    else if (road === 1) pool = dirt;
    else if (road > 0 && noise(Math.floor(column / 2), Math.floor(row / 2), seed + 73) > 0.22) pool = grass.length > 0 && noise(column, row, seed + 79) > 0.74 ? grass : dirt;
    if (pool.length > 0) updates.push({ column, row, family: pickFamily(pool, column, row, seed) });
  });
  for (const update of updates) cells[update.row][update.column].base = update.family;
}

function applyStructuralDetails(cells: Cell[][], plan: WorldPlan, base: Family[], seed: number): void {
  const grass = byMaterial(base, 'grass');
  const dirt = byMaterial(base, 'dirt');
  const sand = byMaterial(base, 'sand');
  const rock = byMaterial(base, 'rock');
  const updates: Array<{ column: number; row: number; family: Family }> = [];
  forEachCell(cells, (cell, column, row) => {
    if (!cell.land || cell.feature || !cell.base) return;
    const zone = resolveZone(plan, column, row, seed + 211);
    const cluster = layeredNoise(column, row, seed, 8, 4, 2);
    const road = distanceToFeature(cells, column, row, 'road', 4);
    const water = distanceToFeature(cells, column, row, 'water', 4);
    let pool: Family[] = [];
    if (zone?.kind === 'mine' && cluster > 0.56) pool = rock.length > 0 ? rock : dirt;
    else if (zone?.kind === 'forest' && cluster > 0.66) pool = grass;
    else if (zone?.kind === 'hub' && cluster > 0.58) pool = dirt.length > 0 ? dirt : grass;
    else if (road > 0 && road <= 4 && cluster > 0.52) pool = dirt.length > 0 ? dirt : grass;
    else if (water > 0 && water <= 4 && cluster > 0.5) pool = sand.length > 0 ? sand : dirt;
    if (pool.length > 0) updates.push({ column, row, family: pickFamily(pool, column, row, seed + 37) });
  });
  for (const update of updates) cells[update.row][update.column].base = update.family;
}

function createWorldPlan(columns: number, rows: number, seed: number): WorldPlan {
  const side = Math.max(1, Math.min(columns, rows));
  const hub: Zone = { kind: 'hub', column: clampInt(Math.round(columns * (0.43 + noise(seed, 11, seed) * 0.14)), 1, Math.max(1, columns - 2)), row: clampInt(Math.round(rows * (0.43 + noise(seed, 13, seed) * 0.14)), 1, Math.max(1, rows - 2)), radius: Math.max(4, Math.round(side * 0.075)), weight: 1.35 };
  const zones = [hub, zone('forest', columns, rows, seed, 0.18, 0.25, 0.35, 0.34, Math.max(5, Math.round(side * 0.16)), 1.05), zone('camp', columns, rows, seed + 37, 0.55, 0.16, 0.34, 0.34, Math.max(4, Math.round(side * 0.105)), 1.1), zone('mine', columns, rows, seed + 71, 0.60, 0.55, 0.30, 0.32, Math.max(5, Math.round(side * 0.135)), 1.22), zone('wild', columns, rows, seed + 113, 0.12, 0.62, 0.30, 0.25, Math.max(6, Math.round(side * 0.18)), 0.96)];
  return { hub, zones, entrances: entrances(columns, rows, seed + 151) };
}

function zone(kind: ZoneKind, columns: number, rows: number, seed: number, bx: number, by: number, sx: number, sy: number, radius: number, weight: number): Zone { return { kind, column: clampInt(Math.round(columns * (bx + noise(seed, 3, seed) * sx)), 1, Math.max(1, columns - 2)), row: clampInt(Math.round(rows * (by + noise(seed, 7, seed) * sy)), 1, Math.max(1, rows - 2)), radius, weight }; }
function entrances(columns: number, rows: number, seed: number): Point[] { const h = seededNoise(seed, seed + 5, seed + 11) > 0; const a = h ? { column: 0, row: clampInt(Math.round(rows * (0.22 + noise(seed, 31, seed) * 0.56)), 0, rows - 1) } : { column: clampInt(Math.round(columns * (0.22 + noise(seed, 37, seed) * 0.56)), 0, columns - 1), row: 0 }; const b = h ? { column: columns - 1, row: clampInt(Math.round(rows * (0.22 + noise(seed, 41, seed) * 0.56)), 0, rows - 1) } : { column: clampInt(Math.round(columns * (0.22 + noise(seed, 43, seed) * 0.56)), 0, columns - 1), row: rows - 1 }; const c = h ? { column: clampInt(Math.round(columns * (0.2 + noise(seed, 47, seed) * 0.6)), 0, columns - 1), row: seededNoise(seed, 51, seed) > 0 ? 0 : rows - 1 } : { column: seededNoise(seed, 53, seed) > 0 ? 0 : columns - 1, row: clampInt(Math.round(rows * (0.2 + noise(seed, 59, seed) * 0.6)), 0, rows - 1) }; return [a, b, c]; }
function resolveZone(plan: WorldPlan, column: number, row: number, seed: number): Zone | null { let best: Zone | null = null; let score = Number.POSITIVE_INFINITY; for (const zone of plan.zones) { const dx = column - zone.column + seededNoise(Math.floor(column / 9), Math.floor(row / 9), seed + zone.radius) * 2.5; const dy = row - zone.row + seededNoise(Math.floor(column / 11), Math.floor(row / 11), seed + zone.radius * 3) * 2.5; const next = (dx * dx + dy * dy) / Math.max(1, zone.radius * zone.radius * zone.weight); if (next < score) { score = next; best = zone; } } return best; }
function createWaterMask(columns: number, rows: number, seed: number, land: Mask, plan: WorldPlan): Mask { const values = new Set<string>(); const camp = plan.zones.find((z) => z.kind === 'camp') ?? plan.hub; createRiver(values, columns, rows, seed, land, camp); paintEllipse(values, land, camp.column, camp.row, Math.max(3, Math.round(columns * 0.055)), Math.max(3, Math.round(rows * 0.045))); removeTinyIslands(values, columns, rows); return setMask(columns, rows, values); }
function createRiver(values: Set<string>, columns: number, rows: number, seed: number, land: Mask, camp: Point): void { const horizontal = seededNoise(seed, seed + 13, seed + 29) > 0; const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.022)); const start = horizontal ? { column: 0, row: Math.round(rows * (0.18 + noise(seed, 1, seed) * 0.64)) } : { column: Math.round(columns * (0.18 + noise(seed, 2, seed) * 0.64)), row: 0 }; const end = horizontal ? { column: columns - 1, row: Math.round(rows * (0.18 + noise(seed, 3, seed) * 0.64)) } : { column: Math.round(columns * (0.18 + noise(seed, 4, seed) * 0.64)), row: rows - 1 }; paintCubic(values, land, start, { column: Math.round((start.column + camp.column) / 2), row: Math.round((start.row + camp.row) / 2) }, { column: Math.round((end.column + camp.column) / 2), row: Math.round((end.row + camp.row) / 2) }, end, width); }
function createRoadMask(columns: number, rows: number, seed: number, land: Mask, water: Mask, plan: WorldPlan): Mask { const values = new Set<string>(); const width = Math.max(1, Math.round(Math.min(columns, rows) * 0.011)); for (const entrance of plan.entrances) paintCurvedRoad(values, land, water, entrance, plan.hub, width, seed + entrance.column * 7 + entrance.row * 11); for (const z of plan.zones) if (z.kind !== 'hub') paintCurvedRoad(values, land, water, plan.hub, z, width, seed + z.column * 3 + z.row * 5); paintDisc(values, land, plan.hub.column, plan.hub.row, Math.max(width + 2, 3), water); return setMask(columns, rows, values); }
function appendLayer(out: EditorTilePlacement[], cells: Cell[][], gridSize: number, seed: number, counters: Map<string, Map<EditorTerrainTileRole | 'all', number>>, max: number, layer: 'base' | FeatureKind): void { forEachCell(cells, (cell, column, row) => { if (out.length >= max) return; const family = layer === 'base' ? cell.base : cell.feature === layer ? cell.featureFamily : null; if (!cell.land || !family) return; const role = layer === 'base' ? resolveRole(column, row, (x, y) => Boolean(cells[y]?.[x]?.land)) : resolveRole(column, row, (x, y) => cells[y]?.[x]?.feature === layer); out.push(createPlacement(pickTileForRole(family, role, column, row, seed, getCounters(counters, family)), column * gridSize, row * gridSize)); }); }
function appendDecorations(out: EditorTilePlacement[], cells: Cell[][], gridSize: number, seed: number, max: number, families: Family[]): void { if (families.length === 0) return; const tiles = families.flatMap((f) => f.byRole.get('decorative') ?? []); if (tiles.length === 0) return; forEachCell(cells, (cell, column, row) => { if (out.length >= max || !cell.land || cell.feature || cell.base?.material === 'rock') return; const zoneFactor = cell.zone === 'hub' ? 0.38 : cell.zone === 'forest' ? 1.15 : 0.82; if (noise(column * 19 + 3, row * 23 + 5, seed + 193) > 0.16 * zoneFactor) return; if (noise(Math.floor(column / 5), Math.floor(row / 5), seed + 71) < 0.62) return; out.push(createPlacement(pickWeighted(tiles, column + 101, row + 203, seed + 389, 0), column * gridSize, row * gridSize)); }); }
function collectRuleTiles(tilesets: EditorTilesetAsset[], gridSize: number, rules: EditorTerrainRuleSet | undefined): Tile[] { if (!rules?.rules?.length) return []; const assets = new Map(tilesets.map((asset) => [key(asset.id, asset.url), asset])); const settings = new Map((rules.tilesets ?? []).map((s) => [key(s.tilesetId, s.tilesetUrl), { material: s.material ?? 'grass', movementMode: s.movementMode ?? getDefaultMovementMode(s.material ?? 'grass'), scale: normalizeScale(s.scale) }])); const result: Tile[] = []; const seen = new Set<string>(); for (const rule of rules.rules) { const k = key(rule.tilesetId, rule.tilesetUrl); const asset = assets.get(k); if (!asset || asset.solidColor !== undefined || !isImageAssetUrl(asset.url)) continue; const set = settings.get(k); const material = rule.material ?? set?.material ?? 'grass'; const movementMode = rule.movementMode ?? set?.movementMode ?? getDefaultMovementMode(material); const scale = normalizeScale(set?.scale ?? rule.scale); if (!ruleFits(rule, scale, gridSize)) continue; const weight = normalizeWeight(rule.weight); if (weight <= 0) continue; const role = rule.role ?? 'center'; const id = `${k}:${rule.sourceRect.x}:${rule.sourceRect.y}:${rule.sourceRect.width}:${rule.sourceRect.height}:${role}:${scale}:${weight}:${material}:${movementMode}`; if (seen.has(id)) continue; seen.add(id); result.push({ asset, sourceRect: { ...rule.sourceRect }, scale, weight, material, movementMode, role }); } return result; }
function createFamilies(tiles: Tile[]): Family[] { const map = new Map<string, Family>(); for (const tile of tiles) { const k = `${tile.asset.id}:${tile.asset.url}:${tile.material}:${tile.movementMode}`; let f = map.get(k); if (!f) { f = { key: k, material: tile.material, movementMode: tile.movementMode, tiles: [], nonDecorative: [], byRole: new Map() }; map.set(k, f); } f.tiles.push(tile); if (tile.role !== 'decorative') f.nonDecorative.push(tile); const list = f.byRole.get(tile.role) ?? []; list.push(tile); f.byRole.set(tile.role, list); } return [...map.values()].filter((f) => f.tiles.length > 0); }
function pickTileForRole(f: Family, role: EditorTerrainTileRole, c: number, r: number, seed: number, counters: Map<EditorTerrainTileRole | 'all', number>): Tile { const candidates = f.byRole.get(role) ?? f.byRole.get('center') ?? f.nonDecorative; const k = f.byRole.has(role) ? role : f.byRole.has('center') ? 'center' : 'all'; const i = counters.get(k) ?? 0; counters.set(k, i + 1); return pickWeighted(candidates.length > 0 ? candidates : f.tiles, c, r, seed, i); }
function pickFamily(families: Family[], c: number, r: number, seed: number): Family { return families[Math.floor(noise(c * 11 + 5, r * 13 + 7, seed) * families.length) % families.length] ?? families[0]; }
function pickWeighted(tiles: Tile[], c: number, r: number, seed: number, salt: number): Tile { const total = tiles.reduce((s, t) => s + t.weight, 0); const roll = noise(c * 31 + salt * 17, r * 37 + salt * 13, seed + 541) * total; let cursor = 0; for (const tile of tiles) { cursor += tile.weight; if (roll <= cursor) return tile; } return tiles[tiles.length - 1]; }
function createPlacement(t: Tile, x: number, y: number): EditorTilePlacement { return { id: crypto.randomUUID(), assetId: t.asset.id, assetUrl: t.asset.url, categoryId: t.asset.categoryId, x, y, layer: 'ground', scale: 1, displayWidth: Math.max(1, Math.round(t.sourceRect.width * t.scale)), displayHeight: Math.max(1, Math.round(t.sourceRect.height * t.scale)), sourceRect: { ...t.sourceRect }, solidColor: undefined, transparentBlack: false, gameplay: undefined, terrainMaterial: t.material, terrainMovementMode: t.movementMode }; }
function smoothBase(cells: Cell[][], passes: number): void { for (let pass = 0; pass < passes; pass += 1) { const updates: Array<{ column: number; row: number; family: Family }> = []; forEachCell(cells, (cell, column, row) => { if (!cell.land || cell.feature || !cell.base) return; const counts = new Map<string, { family: Family; count: number }>(); for (let y = row - 1; y <= row + 1; y += 1) for (let x = column - 1; x <= column + 1; x += 1) { if (x === column && y === row) continue; const n = cells[y]?.[x]; if (!n?.land || n.feature || !n.base) continue; const e = counts.get(n.base.key) ?? { family: n.base, count: 0 }; e.count += 1; counts.set(n.base.key, e); } const current = counts.get(cell.base.key)?.count ?? 0; let best: { family: Family; count: number } | null = null; for (const v of counts.values()) if (!best || v.count > best.count) best = v; if (best && best.count >= 5 && current <= 2) updates.push({ column, row, family: best.family }); }); for (const u of updates) cells[u.row][u.column].base = u.family; } }
function getCounters(store: Map<string, Map<EditorTerrainTileRole | 'all', number>>, f: Family): Map<EditorTerrainTileRole | 'all', number> { let c = store.get(f.key); if (!c) { c = new Map(); store.set(f.key, c); } return c; }
function byMaterial(f: Family[], m: EditorTerrainMaterial): Family[] { return f.filter((x) => x.material === m); }
function isBaseMaterial(m: EditorTerrainMaterial): boolean { return m === 'grass' || m === 'dirt' || m === 'sand' || m === 'rock'; }
function ruleFits(rule: EditorTerrainTileRule, scale: number, grid: number): boolean { return Math.round(rule.sourceRect.width * scale) === grid && Math.round(rule.sourceRect.height * scale) === grid; }
function key(id: string, url: string): string { return `${id}:${url}`; }
function resolveRole(c: number, r: number, same: (c: number, r: number) => boolean): EditorTerrainTileRole { const t = same(c, r - 1), b = same(c, r + 1), l = same(c - 1, r), rr = same(c + 1, r); if (!t && !l) return 'outerTopLeft'; if (!t && !rr) return 'outerTopRight'; if (!b && !l) return 'outerBottomLeft'; if (!b && !rr) return 'outerBottomRight'; if (!t) return 'edgeTop'; if (!b) return 'edgeBottom'; if (!l) return 'edgeLeft'; if (!rr) return 'edgeRight'; if (!same(c - 1, r - 1)) return 'innerTopLeft'; if (!same(c + 1, r - 1)) return 'innerTopRight'; if (!same(c - 1, r + 1)) return 'innerBottomLeft'; if (!same(c + 1, r + 1)) return 'innerBottomRight'; return 'center'; }
function distanceToFeature(cells: Cell[][], c: number, r: number, f: FeatureKind, radius: number): number { for (let d = 1; d <= radius; d += 1) for (let y = r - d; y <= r + d; y += 1) for (let x = c - d; x <= c + d; x += 1) if (Math.max(Math.abs(x - c), Math.abs(y - r)) === d && cells[y]?.[x]?.feature === f) return d; return 0; }
function createFullMask(columns: number, rows: number): Mask { return { columns, rows, has: (c, r) => c >= 0 && c < columns && r >= 0 && r < rows }; }
function createEmptyMask(columns: number, rows: number): Mask { return { columns, rows, has: () => false }; }
function createIslandMask(columns: number, rows: number, seed: number): Mask { const values = new Set<string>(); const cx = (columns - 1) / 2, cy = (rows - 1) / 2, rx = Math.max(2, columns * 0.47), ry = Math.max(2, rows * 0.47); for (let r = 0; r < rows; r += 1) for (let c = 0; c < columns; c += 1) { const nx = (c - cx) / rx, ny = (r - cy) / ry; if (Math.sqrt(nx * nx + ny * ny) <= 0.93 + seededNoise(Math.round(Math.atan2(ny, nx) * 8), 0, seed) * 0.09) values.add(`${c}:${r}`); } removeTinyIslands(values, columns, rows); return setMask(columns, rows, values); }
function paintCurvedRoad(values: Set<string>, land: Mask, avoid: Mask, a: Point, b: Point, width: number, seed: number): void { const m1 = { column: Math.round(lerp(a.column, b.column, 0.33) + seededNoise(a.column, a.row, seed) * 8), row: Math.round(lerp(a.row, b.row, 0.33) + seededNoise(a.row, a.column, seed + 11) * 8) }; const m2 = { column: Math.round(lerp(a.column, b.column, 0.66) + seededNoise(b.column, b.row, seed + 23) * 8), row: Math.round(lerp(a.row, b.row, 0.66) + seededNoise(b.row, b.column, seed + 37) * 8) }; paintCubic(values, { columns: land.columns, rows: land.rows, has: (c, r) => land.has(c, r) && !avoid.has(c, r) }, a, m1, m2, b, width); }
function paintCubic(values: Set<string>, mask: Mask, a: Point, b: Point, c: Point, d: Point, width: number): void { const steps = Math.max(mask.columns, mask.rows) * 2; let prev = a; for (let i = 0; i <= steps; i += 1) { const t = i / Math.max(1, steps); const next = cubicPoint(a, b, c, d, t); paintLine(values, mask, prev, next, width); prev = next; } }
function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point { const i = 1 - t; return { column: Math.round(i * i * i * a.column + 3 * i * i * t * b.column + 3 * i * t * t * c.column + t * t * t * d.column), row: Math.round(i * i * i * a.row + 3 * i * i * t * b.row + 3 * i * t * t * c.row + t * t * t * d.row) }; }
function paintLine(values: Set<string>, mask: Mask, a: Point, b: Point, width: number): void { const steps = Math.max(Math.abs(b.column - a.column), Math.abs(b.row - a.row), 1); for (let i = 0; i <= steps; i += 1) paintDisc(values, mask, Math.round(lerp(a.column, b.column, i / steps)), Math.round(lerp(a.row, b.row, i / steps)), width); }
function paintEllipse(values: Set<string>, mask: Mask, cc: number, rr: number, rx: number, ry: number): void { for (let r = rr - ry; r <= rr + ry; r += 1) for (let c = cc - rx; c <= cc + rx; c += 1) { const nx = (c - cc) / Math.max(1, rx), ny = (r - rr) / Math.max(1, ry); if (nx * nx + ny * ny <= 1 && mask.has(c, r)) values.add(`${c}:${r}`); } }
function paintDisc(values: Set<string>, mask: Mask, cc: number, rr: number, radius: number, avoid?: Mask): void { for (let r = rr - radius; r <= rr + radius; r += 1) for (let c = cc - radius; c <= cc + radius; c += 1) { const dx = c - cc, dy = r - rr; if (dx * dx + dy * dy <= radius * radius && mask.has(c, r) && !avoid?.has(c, r)) values.add(`${c}:${r}`); } }
function removeTinyIslands(values: Set<string>, columns: number, rows: number): void { const rm: string[] = []; for (let r = 1; r < rows - 1; r += 1) for (let c = 1; c < columns - 1; c += 1) if (values.has(`${c}:${r}`) && countNeighbors(values, c, r) <= 1) rm.push(`${c}:${r}`); for (const k of rm) values.delete(k); }
function countNeighbors(values: Set<string>, c: number, r: number): number { let n = 0; for (let y = r - 1; y <= r + 1; y += 1) for (let x = c - 1; x <= c + 1; x += 1) if ((x !== c || y !== r) && values.has(`${x}:${y}`)) n += 1; return n; }
function setMask(columns: number, rows: number, values: Set<string>): Mask { return { columns, rows, has: (c, r) => c >= 0 && c < columns && r >= 0 && r < rows && values.has(`${c}:${r}`) }; }
function forEachCell(cells: Cell[][], cb: (cell: Cell, c: number, r: number) => void): void { for (let r = 0; r < cells.length; r += 1) for (let c = 0; c < cells[r].length; c += 1) cb(cells[r][c], c, r); }
function clampInt(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function readStoredRuleSet(): EditorTerrainRuleSet | undefined { try { const raw = window.localStorage.getItem(DEFAULT_RULE_KEY); if (!raw) return undefined; const parsed = JSON.parse(raw) as EditorTerrainRuleSet; return parsed?.version === 1 && Array.isArray(parsed.rules) ? parsed : undefined; } catch { return undefined; } }
function readStoredShape(): TerrainGenerationShape { try { return window.localStorage.getItem(DEFAULT_SHAPE_KEY) === 'island' ? 'island' : 'rect'; } catch { return 'rect'; } }
function readStoredSeed(): number { try { return normalizeSeed(Number(window.localStorage.getItem(DEFAULT_SEED_KEY) ?? '1')); } catch { return 1; } }
function isImageAssetUrl(url: string): boolean { return !url.startsWith('solid://') && !url.startsWith('editor://'); }
function getDefaultMovementMode(m: EditorTerrainMaterial): EditorTerrainMovementMode { if (m === 'water') return 'boatOnly'; if (m === 'rock') return 'blocked'; return 'passable'; }
function ridgeScore(nx: number, ny: number, ax: number, ay: number, bx: number, by: number): number { const abx = bx - ax, aby = by - ay, apx = nx - ax, apy = ny - ay; const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / Math.max(0.0001, abx * abx + aby * aby))); return Math.max(0, 1 - Math.hypot(nx - (ax + abx * t), ny - (ay + aby * t)) / 0.16); }
function layeredNoise(c: number, r: number, seed: number, a: number, b: number, d: number): number { return noise(Math.floor(c / a), Math.floor(r / a), seed) * 0.58 + noise(Math.floor(c / b), Math.floor(r / b), seed + 101) * 0.3 + noise(Math.floor(c / d), Math.floor(r / d), seed + 211) * 0.12; }
function noise(x: number, y: number, seed: number): number { return seededNoise(x, y, seed) * 0.5 + 0.5; }
function seededNoise(x: number, y: number, seed: number): number { const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function normalizeGridSize(v: number | undefined): number { return !Number.isFinite(v) || (v as number) <= 0 ? 32 : Math.max(1, Math.min(256, Math.round(v as number))); }
function normalizeScale(v: number | undefined): number { return !Number.isFinite(v) || (v as number) <= 0 ? 1 : Math.max(0.1, Math.min(10, Math.round((v as number) * 10) / 10)); }
function normalizeWeight(v: number | undefined): number { return !Number.isFinite(v) || (v as number) < 0 ? 1 : Math.max(0, Math.min(100, Math.round(v as number))); }
function normalizeSeed(v: number): number { return !Number.isFinite(v) ? 1 : Math.max(0, Math.min(999999999, Math.round(v))); }
function normalizePositiveInteger(v: number | undefined, f: number): number { return !Number.isFinite(v) ? f : Math.max(1, Math.round(v as number)); }
