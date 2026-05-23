import type { EditorTerrainMaterial, EditorTerrainMovementMode, EditorTerrainRuleSet, EditorTerrainTileRole, EditorTerrainTileRule, EditorTilePlacement, EditorTilesetAsset } from '../types';
import type { BasicTerrainGenerationOptions, TerrainGenerationShape } from './TerrainGenerator';

type Feature = 'water' | 'road';
type Zone = 'hub' | 'forest' | 'camp' | 'mine' | 'wild';
type Point = { c: number; r: number };
type Tile = { asset: EditorTilesetAsset; sourceRect: { x: number; y: number; width: number; height: number }; scale: number; weight: number; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; role: EditorTerrainTileRole };
type Family = { key: string; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; tiles: Tile[]; byRole: Map<EditorTerrainTileRole, Tile[]> };
type Cell = { land: boolean; base?: Family; feature?: Feature; featureFamily?: Family; zone?: Zone };
type Mask = { has(c: number, r: number): boolean };

const RULE_KEY = 'dalworld:editor-terrain-rules:dalworld-map';
const SHAPE_KEY = 'dalworld:editor-terrain-shape:dalworld-map';
const SEED_KEY = 'dalworld:editor-terrain-seed:dalworld-map';

export async function generateWorldPlanTerrainV2(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const grid = normInt(options.gridSize, 32);
  const seed = normSeed(options.seed ?? readSeed());
  const rules = options.terrainRuleSet ?? readRules();
  const cols = Math.max(1, Math.ceil(normInt(options.width, 3000) / grid));
  const rows = Math.max(1, Math.ceil(normInt(options.height, 3000) / grid));
  const max = normInt(options.maxPlacements, cols * rows * 4);
  const families = groupTiles(collectTiles(options.tilesets, rules, grid));
  const base = families.filter((family) => isBase(family.material));
  if (base.length === 0) return [];
  const water = families.filter((family) => family.material === 'water');
  const road = families.filter((family) => family.material === 'road');
  const decorations = families.flatMap((family) => family.material === 'water' || family.material === 'road' || family.material === 'rock' ? [] : family.byRole.get('decorative') ?? []);
  const plan = makePlan(cols, rows, seed);
  const landMask = (options.shape ?? readShape()) === 'island' ? islandMask(cols, rows, seed) : fullMask(cols, rows);
  const waterMask = water.length > 0 ? makeWater(cols, rows, landMask, plan, seed + 101) : emptyMask();
  const roadMask = road.length > 0 ? makeRoad(cols, rows, landMask, waterMask, plan, seed + 202) : emptyMask();
  const cells = buildCells(cols, rows, seed, landMask, waterMask, roadMask, plan, base, water, road);
  const placements: EditorTilePlacement[] = [];
  const counters = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  appendLayer(placements, cells, grid, seed, counters, max, 'base');
  appendLayer(placements, cells, grid, seed + 101, counters, max, 'water');
  appendLayer(placements, cells, grid, seed + 202, counters, max, 'road');
  appendDecorations(placements, cells, decorations, grid, seed + 303, max);
  return placements;
}

function buildCells(cols: number, rows: number, seed: number, landMask: Mask, waterMask: Mask, roadMask: Mask, plan: Record<Zone, Point>, base: Family[], water: Family[], road: Family[]): Cell[][] {
  const cells: Cell[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const line: Cell[] = [];
    for (let c = 0; c < cols; c += 1) {
      const land = landMask.has(c, r);
      const zone = land ? nearestZone(plan, c, r, seed) : undefined;
      line.push({ land, zone, base: land ? pickBase(base, zone, c, r, cols, rows, seed) : undefined });
    }
    cells.push(line);
  }
  each(cells, (cell, c, r) => {
    if (!cell.land) return;
    if (water.length > 0 && waterMask.has(c, r)) {
      cell.feature = 'water';
      cell.featureFamily = pickFamily(water, c, r, seed + 101);
    } else if (road.length > 0 && roadMask.has(c, r)) {
      cell.feature = 'road';
      cell.featureFamily = pickFamily(road, c, r, seed + 202);
    }
  });
  applyTransitions(cells, base, seed + 404);
  smoothBase(cells, 2);
  return cells;
}

function pickBase(base: Family[], zone: Zone | undefined, c: number, r: number, cols: number, rows: number, seed: number): Family {
  const grass = byMaterial(base, 'grass');
  const dirt = byMaterial(base, 'dirt');
  const sand = byMaterial(base, 'sand');
  const rock = byMaterial(base, 'rock');
  const nx = cols <= 1 ? 0 : c / (cols - 1);
  const ny = rows <= 1 ? 0 : r / (rows - 1);
  const edge = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2;
  const ridge = Math.max(ridgeScore(nx, ny, 0.14, 0.78, 0.88, 0.22), ridgeScore(nx, ny, 0.2, 0.12, 0.82, 0.78));
  const rough = layeredNoise(c, r, seed + 77, 14, 6, 3);
  const dry = layeredNoise(c + 91, r - 37, seed + 91, 42, 17, 7);
  let pool = grass.length > 0 ? grass : base;
  if (zone === 'mine') pool = rock.length > 0 && rough > 0.34 ? rock : dirt.length > 0 ? dirt : pool;
  else if (zone === 'hub') pool = dirt.length > 0 && layeredNoise(c, r, seed, 10, 4, 2) > 0.58 ? dirt : pool;
  else if (zone === 'camp') pool = dirt.length > 0 ? dirt : sand.length > 0 ? sand : pool;
  else if (zone === 'wild') pool = rock.length > 0 && ridge + edge * 0.2 > 0.58 ? rock : pool;
  if (rock.length > 0 && ridge * 0.68 + edge * 0.18 > 0.72) pool = rock;
  else if (sand.length > 0 && dry > 0.76 && zone !== 'hub') pool = sand;
  return pickFamily(pool, c, r, seed);
}

function applyTransitions(cells: Cell[][], base: Family[], seed: number): void {
  const grass = byMaterial(base, 'grass');
  const dirt = byMaterial(base, 'dirt');
  const sand = byMaterial(base, 'sand');
  const changes: Array<[number, number, Family]> = [];
  each(cells, (cell, c, r) => {
    if (!cell.land || cell.feature) return;
    const waterDistance = distanceToFeature(cells, c, r, 'water', 3);
    const roadDistance = distanceToFeature(cells, c, r, 'road', 3);
    let pool: Family[] = [];
    if (waterDistance === 1) pool = sand.length > 0 ? sand : dirt;
    else if (waterDistance === 2) pool = sand.length > 0 && noise(c, r, seed) > 0.45 ? sand : dirt;
    else if (roadDistance === 1) pool = dirt;
    else if (roadDistance > 0 && noise(c, r, seed + 9) > 0.55) pool = dirt.length > 0 ? dirt : grass;
    if (pool.length > 0) changes.push([c, r, pickFamily(pool, c, r, seed)]);
  });
  for (const [c, r, family] of changes) cells[r][c].base = family;
}

function appendLayer(out: EditorTilePlacement[], cells: Cell[][], grid: number, seed: number, counters: Map<string, Map<EditorTerrainTileRole | 'all', number>>, max: number, layer: 'base' | Feature): void {
  each(cells, (cell, c, r) => {
    if (out.length >= max || !cell.land) return;
    const family = layer === 'base' ? cell.base : cell.feature === layer ? cell.featureFamily : undefined;
    if (!family) return;
    const role = layer === 'base'
      ? roleAt(c, r, (x, y) => cells[y]?.[x]?.base?.material === family.material)
      : roleAt(c, r, (x, y) => cells[y]?.[x]?.feature === layer);
    out.push(createPlacement(tileForRole(family, role, c, r, seed, getCounters(counters, family)), c * grid, r * grid));
  });
}

function appendDecorations(out: EditorTilePlacement[], cells: Cell[][], tiles: Tile[], grid: number, seed: number, max: number): void {
  if (tiles.length === 0) return;
  each(cells, (cell, c, r) => {
    if (out.length >= max || !cell.land || cell.feature || cell.base?.material === 'rock') return;
    const factor = cell.zone === 'hub' ? 0.35 : cell.zone === 'forest' ? 1.2 : 0.8;
    if (noise(c * 19 + 3, r * 23 + 5, seed) < 0.14 * factor && noise(Math.floor(c / 5), Math.floor(r / 5), seed + 1) > 0.62) {
      out.push(createPlacement(pickWeighted(tiles, c, r, seed, 0), c * grid, r * grid));
    }
  });
}

function makePlan(cols: number, rows: number, seed: number): Record<Zone, Point> {
  return {
    hub: { c: clamp(Math.round(cols * (0.43 + noise(seed, 1, seed) * 0.14)), 1, Math.max(1, cols - 2)), r: clamp(Math.round(rows * (0.43 + noise(seed, 2, seed) * 0.14)), 1, Math.max(1, rows - 2)) },
    forest: { c: Math.round(cols * (0.12 + noise(seed, 3, seed) * 0.35)), r: Math.round(rows * (0.18 + noise(seed, 4, seed) * 0.35)) },
    camp: { c: Math.round(cols * (0.55 + noise(seed, 5, seed) * 0.32)), r: Math.round(rows * (0.14 + noise(seed, 6, seed) * 0.35)) },
    mine: { c: Math.round(cols * (0.58 + noise(seed, 7, seed) * 0.3)), r: Math.round(rows * (0.52 + noise(seed, 8, seed) * 0.34)) },
    wild: { c: Math.round(cols * (0.1 + noise(seed, 9, seed) * 0.32)), r: Math.round(rows * (0.6 + noise(seed, 10, seed) * 0.28)) },
  };
}

function nearestZone(plan: Record<Zone, Point>, c: number, r: number, seed: number): Zone {
  let best: Zone = 'hub';
  let bestScore = Infinity;
  for (const key of Object.keys(plan) as Zone[]) {
    const point = plan[key];
    const dx = c - point.c + seededNoise(Math.floor(c / 9), Math.floor(r / 9), seed) * 2.5;
    const dy = r - point.r + seededNoise(Math.floor(c / 11), Math.floor(r / 11), seed + 1) * 2.5;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function makeWater(cols: number, rows: number, land: Mask, plan: Record<Zone, Point>, seed: number): Mask {
  const values = new Set<string>();
  const camp = plan.camp;
  const horizontal = seededNoise(seed, seed + 1, seed + 2) > 0;
  const start = horizontal ? { c: 0, r: Math.round(rows * (0.18 + noise(seed, 1, seed) * 0.64)) } : { c: Math.round(cols * (0.18 + noise(seed, 2, seed) * 0.64)), r: 0 };
  const end = horizontal ? { c: cols - 1, r: Math.round(rows * (0.18 + noise(seed, 3, seed) * 0.64)) } : { c: Math.round(cols * (0.18 + noise(seed, 4, seed) * 0.64)), r: rows - 1 };
  paintCubic(values, land, start, midpoint(start, camp), midpoint(end, camp), end, Math.max(1, Math.round(Math.min(cols, rows) * 0.022)));
  paintEllipse(values, land, camp.c, camp.r, Math.max(3, Math.round(cols * 0.055)), Math.max(3, Math.round(rows * 0.045)));
  return setMask(cols, rows, values);
}

function makeRoad(cols: number, rows: number, land: Mask, water: Mask, plan: Record<Zone, Point>, seed: number): Mask {
  const values = new Set<string>();
  const width = Math.max(1, Math.round(Math.min(cols, rows) * 0.011));
  const gates = [{ c: 0, r: Math.round(rows * 0.5) }, { c: cols - 1, r: Math.round(rows * 0.45) }, { c: Math.round(cols * 0.5), r: rows - 1 }];
  for (const gate of gates) paintCurve(values, land, water, gate, plan.hub, width, seed + gate.c + gate.r);
  for (const key of ['forest', 'camp', 'mine', 'wild'] as Zone[]) paintCurve(values, land, water, plan.hub, plan[key], width, seed + plan[key].c * 3);
  paintDisc(values, land, plan.hub.c, plan.hub.r, Math.max(3, width + 2), water);
  return setMask(cols, rows, values);
}

function collectTiles(tilesets: EditorTilesetAsset[], rules: EditorTerrainRuleSet | undefined, grid: number): Tile[] {
  if (!rules?.rules?.length) return [];
  const assets = new Map(tilesets.map((asset) => [tilesetKey(asset.id, asset.url), asset]));
  const settings = new Map((rules.tilesets ?? []).map((setting) => {
    const material = setting.material ?? 'grass';
    return [tilesetKey(setting.tilesetId, setting.tilesetUrl), { material, movementMode: setting.movementMode ?? defaultMovement(material), scale: normalizeScale(setting.scale) }];
  }));
  const out: Tile[] = [];
  const seen = new Set<string>();
  for (const rule of rules.rules) {
    const key = tilesetKey(rule.tilesetId, rule.tilesetUrl);
    const asset = assets.get(key);
    if (!asset || asset.solidColor !== undefined || !isImageUrl(asset.url)) continue;
    const setting = settings.get(key);
    const material = rule.material ?? setting?.material ?? 'grass';
    const scale = normalizeScale(setting?.scale ?? rule.scale);
    if (!ruleFitsGrid(rule, scale, grid)) continue;
    const movementMode = rule.movementMode ?? setting?.movementMode ?? defaultMovement(material);
    const weight = normalizeWeight(rule.weight);
    const role = rule.role ?? 'center';
    const id = `${key}:${rule.sourceRect.x}:${rule.sourceRect.y}:${rule.sourceRect.width}:${rule.sourceRect.height}:${role}:${scale}:${weight}:${material}:${movementMode}`;
    if (weight <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ asset, sourceRect: { ...rule.sourceRect }, scale, weight, material, movementMode, role });
  }
  return out;
}

function groupTiles(tiles: Tile[]): Family[] {
  const map = new Map<string, Family>();
  for (const tile of tiles) {
    const key = `${tile.asset.id}:${tile.asset.url}:${tile.material}:${tile.movementMode}`;
    let family = map.get(key);
    if (!family) {
      family = { key, material: tile.material, movementMode: tile.movementMode, tiles: [], byRole: new Map() };
      map.set(key, family);
    }
    family.tiles.push(tile);
    const roleTiles = family.byRole.get(tile.role) ?? [];
    roleTiles.push(tile);
    family.byRole.set(tile.role, roleTiles);
  }
  return [...map.values()];
}

function tileForRole(family: Family, role: EditorTerrainTileRole, c: number, r: number, seed: number, counters: Map<EditorTerrainTileRole | 'all', number>): Tile {
  const tiles = family.byRole.get(role) ?? family.byRole.get('center') ?? family.tiles;
  const key = family.byRole.has(role) ? role : family.byRole.has('center') ? 'center' : 'all';
  const index = counters.get(key) ?? 0;
  counters.set(key, index + 1);
  return pickWeighted(tiles, c, r, seed, index);
}

function pickFamily(families: Family[], c: number, r: number, seed: number): Family {
  const index = Math.floor(noise(c * 11 + 5, r * 13 + 7, seed) * families.length) % families.length;
  return families[index] ?? families[0];
}

function pickWeighted(tiles: Tile[], c: number, r: number, seed: number, salt: number): Tile {
  const total = tiles.reduce((sum, tile) => sum + tile.weight, 0);
  if (total <= 0) return tiles[0];
  let roll = noise(c * 31 + salt * 17, r * 37 + salt * 13, seed) * total;
  for (const tile of tiles) {
    roll -= tile.weight;
    if (roll <= 0) return tile;
  }
  return tiles[tiles.length - 1];
}

function createPlacement(tile: Tile, x: number, y: number): EditorTilePlacement {
  return { id: crypto.randomUUID(), assetId: tile.asset.id, assetUrl: tile.asset.url, categoryId: tile.asset.categoryId, x, y, layer: 'ground', scale: 1, displayWidth: Math.max(1, Math.round(tile.sourceRect.width * tile.scale)), displayHeight: Math.max(1, Math.round(tile.sourceRect.height * tile.scale)), sourceRect: { ...tile.sourceRect }, solidColor: undefined, transparentBlack: true, gameplay: undefined, terrainMaterial: tile.material, terrainMovementMode: tile.movementMode };
}

function roleAt(c: number, r: number, same: (c: number, r: number) => boolean): EditorTerrainTileRole {
  const top = same(c, r - 1);
  const bottom = same(c, r + 1);
  const left = same(c - 1, r);
  const right = same(c + 1, r);
  if (!top && !left) return 'outerTopLeft';
  if (!top && !right) return 'outerTopRight';
  if (!bottom && !left) return 'outerBottomLeft';
  if (!bottom && !right) return 'outerBottomRight';
  if (!top) return 'edgeTop';
  if (!bottom) return 'edgeBottom';
  if (!left) return 'edgeLeft';
  if (!right) return 'edgeRight';
  if (!same(c - 1, r - 1)) return 'innerTopLeft';
  if (!same(c + 1, r - 1)) return 'innerTopRight';
  if (!same(c - 1, r + 1)) return 'innerBottomLeft';
  if (!same(c + 1, r + 1)) return 'innerBottomRight';
  return 'center';
}

function smoothBase(cells: Cell[][], passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const changes: Array<[number, number, Family]> = [];
    each(cells, (cell, c, r) => {
      if (!cell.land || cell.feature || !cell.base) return;
      const counts = new Map<EditorTerrainMaterial, { family: Family; count: number }>();
      for (let y = r - 1; y <= r + 1; y += 1) {
        for (let x = c - 1; x <= c + 1; x += 1) {
          const next = cells[y]?.[x];
          if ((x !== c || y !== r) && next?.land && !next.feature && next.base) {
            const entry = counts.get(next.base.material) ?? { family: next.base, count: 0 };
            entry.count += 1;
            counts.set(next.base.material, entry);
          }
        }
      }
      let best: { family: Family; count: number } | undefined;
      for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
      if (best && best.count >= 5 && (counts.get(cell.base.material)?.count ?? 0) <= 2) changes.push([c, r, best.family]);
    });
    for (const [c, r, family] of changes) cells[r][c].base = family;
  }
}

function distanceToFeature(cells: Cell[][], c: number, r: number, feature: Feature, radius: number): number {
  for (let d = 1; d <= radius; d += 1) {
    for (let y = r - d; y <= r + d; y += 1) {
      for (let x = c - d; x <= c + d; x += 1) {
        if (Math.max(Math.abs(x - c), Math.abs(y - r)) === d && cells[y]?.[x]?.feature === feature) return d;
      }
    }
  }
  return 0;
}

function each(cells: Cell[][], callback: (cell: Cell, c: number, r: number) => void): void {
  for (let r = 0; r < cells.length; r += 1) for (let c = 0; c < cells[r].length; c += 1) callback(cells[r][c], c, r);
}

function getCounters(store: Map<string, Map<EditorTerrainTileRole | 'all', number>>, family: Family): Map<EditorTerrainTileRole | 'all', number> {
  let counters = store.get(family.key);
  if (!counters) {
    counters = new Map<EditorTerrainTileRole | 'all', number>();
    store.set(family.key, counters);
  }
  return counters;
}

function byMaterial(families: Family[], material: EditorTerrainMaterial): Family[] { return families.filter((family) => family.material === material); }
function isBase(material: EditorTerrainMaterial): boolean { return material === 'grass' || material === 'dirt' || material === 'sand' || material === 'rock'; }
function fullMask(cols: number, rows: number): Mask { return { has: (c, r) => c >= 0 && c < cols && r >= 0 && r < rows }; }
function emptyMask(): Mask { return { has: () => false }; }
function setMask(cols: number, rows: number, values: Set<string>): Mask { return { has: (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && values.has(`${c}:${r}`) }; }

function islandMask(cols: number, rows: number, seed: number): Mask {
  const values = new Set<string>();
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const rx = Math.max(2, cols * 0.47);
  const ry = Math.max(2, rows * 0.47);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const nx = (c - cx) / rx;
      const ny = (r - cy) / ry;
      if (Math.sqrt(nx * nx + ny * ny) <= 0.93 + seededNoise(Math.round(Math.atan2(ny, nx) * 8), 0, seed) * 0.09) values.add(`${c}:${r}`);
    }
  }
  return setMask(cols, rows, values);
}

function paintCurve(values: Set<string>, land: Mask, avoid: Mask, start: Point, end: Point, width: number, seed: number): void {
  const a = { c: Math.round(lerp(start.c, end.c, 0.33) + seededNoise(start.c, start.r, seed) * 8), r: Math.round(lerp(start.r, end.r, 0.33) + seededNoise(start.r, start.c, seed + 1) * 8) };
  const b = { c: Math.round(lerp(start.c, end.c, 0.66) + seededNoise(end.c, end.r, seed + 2) * 8), r: Math.round(lerp(start.r, end.r, 0.66) + seededNoise(end.r, end.c, seed + 3) * 8) };
  paintCubic(values, { has: (c, r) => land.has(c, r) && !avoid.has(c, r) }, start, a, b, end, width);
}

function paintCubic(values: Set<string>, mask: Mask, start: Point, a: Point, b: Point, end: Point, width: number): void {
  const steps = 160;
  let previous = start;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const next = cubicPoint(start, a, b, end, t);
    paintLine(values, mask, previous, next, width);
    previous = next;
  }
}

function cubicPoint(start: Point, a: Point, b: Point, end: Point, t: number): Point {
  const inv = 1 - t;
  return { c: Math.round(inv * inv * inv * start.c + 3 * inv * inv * t * a.c + 3 * inv * t * t * b.c + t * t * t * end.c), r: Math.round(inv * inv * inv * start.r + 3 * inv * inv * t * a.r + 3 * inv * t * t * b.r + t * t * t * end.r) };
}

function paintLine(values: Set<string>, mask: Mask, start: Point, end: Point, width: number): void {
  const steps = Math.max(Math.abs(end.c - start.c), Math.abs(end.r - start.r), 1);
  for (let i = 0; i <= steps; i += 1) paintDisc(values, mask, Math.round(lerp(start.c, end.c, i / steps)), Math.round(lerp(start.r, end.r, i / steps)), width);
}

function paintEllipse(values: Set<string>, mask: Mask, centerC: number, centerR: number, radiusC: number, radiusR: number): void {
  for (let r = centerR - radiusR; r <= centerR + radiusR; r += 1) {
    for (let c = centerC - radiusC; c <= centerC + radiusC; c += 1) {
      const nx = (c - centerC) / Math.max(1, radiusC);
      const ny = (r - centerR) / Math.max(1, radiusR);
      if (nx * nx + ny * ny <= 1 && mask.has(c, r)) values.add(`${c}:${r}`);
    }
  }
}

function paintDisc(values: Set<string>, mask: Mask, centerC: number, centerR: number, radius: number, avoid?: Mask): void {
  for (let r = centerR - radius; r <= centerR + radius; r += 1) {
    for (let c = centerC - radius; c <= centerC + radius; c += 1) {
      const dc = c - centerC;
      const dr = r - centerR;
      if (dc * dc + dr * dr <= radius * radius && mask.has(c, r) && !avoid?.has(c, r)) values.add(`${c}:${r}`);
    }
  }
}

function midpoint(a: Point, b: Point): Point { return { c: Math.round((a.c + b.c) / 2), r: Math.round((a.r + b.r) / 2) }; }
function ridgeScore(nx: number, ny: number, ax: number, ay: number, bx: number, by: number): number { const abx = bx - ax; const aby = by - ay; const apx = nx - ax; const apy = ny - ay; const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / Math.max(0.0001, abx * abx + aby * aby))); return Math.max(0, 1 - Math.hypot(nx - (ax + abx * t), ny - (ay + aby * t)) / 0.16); }
function layeredNoise(c: number, r: number, seed: number, a: number, b: number, d: number): number { return noise(Math.floor(c / a), Math.floor(r / a), seed) * 0.58 + noise(Math.floor(c / b), Math.floor(r / b), seed + 1) * 0.3 + noise(Math.floor(c / d), Math.floor(r / d), seed + 2) * 0.12; }
function noise(x: number, y: number, seed: number): number { return seededNoise(x, y, seed) * 0.5 + 0.5; }
function seededNoise(x: number, y: number, seed: number): number { const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return (value - Math.floor(value)) * 2 - 1; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function tilesetKey(id: string, url: string): string { return `${id}:${url}`; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function ruleFitsGrid(rule: EditorTerrainTileRule, scale: number, grid: number): boolean { return Math.round(rule.sourceRect.width * scale) === grid && Math.round(rule.sourceRect.height * scale) === grid; }
function isImageUrl(url: string): boolean { return !url.startsWith('solid://') && !url.startsWith('editor://'); }
function defaultMovement(material: EditorTerrainMaterial): EditorTerrainMovementMode { if (material === 'water') return 'boatOnly'; if (material === 'rock') return 'blocked'; return 'passable'; }

function readRules(): EditorTerrainRuleSet | undefined {
  try {
    const raw = window.localStorage.getItem(RULE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
    return parsed?.version === 1 && Array.isArray(parsed.rules) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readShape(): TerrainGenerationShape {
  try { return window.localStorage.getItem(SHAPE_KEY) === 'island' ? 'island' : 'rect'; } catch { return 'rect'; }
}

function readSeed(): number {
  try { return normSeed(Number(window.localStorage.getItem(SEED_KEY) ?? '1')); } catch { return 1; }
}

function normInt(value: number | undefined, fallback: number): number { return !Number.isFinite(value) || (value as number) <= 0 ? fallback : Math.round(value as number); }
function normalizeScale(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 1 : Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10)); }
function normalizeWeight(value: number | undefined): number { return !Number.isFinite(value) || (value as number) < 0 ? 1 : Math.max(0, Math.min(100, Math.round(value as number))); }
function normSeed(value: number): number { return !Number.isFinite(value) ? 1 : Math.max(0, Math.min(999999999, Math.round(value))); }
