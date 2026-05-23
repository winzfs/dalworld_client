import type { EditorTerrainMaterial, EditorTerrainMovementMode, EditorTerrainRuleSet, EditorTerrainTileRole, EditorTerrainTileRule, EditorTilePlacement, EditorTilesetAsset } from '../types';
import type { BasicTerrainGenerationOptions, TerrainGenerationShape } from './TerrainGenerator';

type Feature = 'water' | 'road';
type Zone = 'hub' | 'forest' | 'camp' | 'mine' | 'wild';
type Tile = { asset: EditorTilesetAsset; sourceRect: { x: number; y: number; width: number; height: number }; scale: number; weight: number; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; role: EditorTerrainTileRole };
type Family = { key: string; material: EditorTerrainMaterial; movementMode: EditorTerrainMovementMode; tiles: Tile[]; byRole: Map<EditorTerrainTileRole, Tile[]> };
type Cell = { land: boolean; base?: Family; feature?: Feature; featureFamily?: Family; zone?: Zone };
type Point = { c: number; r: number };
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
  const base = families.filter((f) => isBase(f.material));
  if (base.length === 0) return [];
  const water = families.filter((f) => f.material === 'water');
  const road = families.filter((f) => f.material === 'road');
  const deco = families.flatMap((f) => f.material !== 'rock' && f.material !== 'water' && f.material !== 'road' ? f.byRole.get('decorative') ?? [] : []);
  const plan = makePlan(cols, rows, seed);
  const land = (options.shape ?? readShape()) === 'island' ? islandMask(cols, rows, seed) : fullMask(cols, rows);
  const waterMask = water.length ? makeWater(cols, rows, land, plan, seed + 101) : emptyMask();
  const roadMask = road.length ? makeRoad(cols, rows, land, waterMask, plan, seed + 202) : emptyMask();
  const cells = buildCells(cols, rows, seed, land, waterMask, roadMask, plan, base, water, road);
  const out: EditorTilePlacement[] = [];
  const counts = new Map<string, Map<EditorTerrainTileRole | 'all', number>>();
  append(out, cells, grid, seed, counts, max, 'base');
  append(out, cells, grid, seed + 101, counts, max, 'water');
  append(out, cells, grid, seed + 202, counts, max, 'road');
  appendDeco(out, cells, deco, grid, seed + 303, max);
  return out;
}

function buildCells(cols: number, rows: number, seed: number, land: Mask, waterMask: Mask, roadMask: Mask, plan: Record<Zone, Point>, base: Family[], water: Family[], road: Family[]): Cell[][] {
  const cells: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      const isLand = land.has(c, r);
      const zone = isLand ? nearestZone(plan, c, r, seed) : undefined;
      line.push({ land: isLand, zone, base: isLand ? pickBase(base, zone, c, r, cols, rows, seed) : undefined });
    }
    cells.push(line);
  }
  each(cells, (cell, c, r) => {
    if (!cell.land) return;
    if (water.length && waterMask.has(c, r)) { cell.feature = 'water'; cell.featureFamily = pick(water, c, r, seed + 101); }
    else if (road.length && roadMask.has(c, r)) { cell.feature = 'road'; cell.featureFamily = pick(road, c, r, seed + 202); }
  });
  transition(cells, base, seed + 404);
  smooth(cells, 2);
  return cells;
}

function pickBase(base: Family[], zone: Zone | undefined, c: number, r: number, cols: number, rows: number, seed: number): Family {
  const grass = mat(base, 'grass'), dirt = mat(base, 'dirt'), sand = mat(base, 'sand'), rock = mat(base, 'rock');
  const nx = cols <= 1 ? 0 : c / (cols - 1), ny = rows <= 1 ? 0 : r / (rows - 1);
  const edge = Math.max(Math.abs(nx - .5), Math.abs(ny - .5)) * 2;
  const ridge = Math.max(ridgeScore(nx, ny, .14, .78, .88, .22), ridgeScore(nx, ny, .2, .12, .82, .78));
  const rough = layer(c, r, seed + 77, 14, 6, 3);
  const dry = layer(c + 91, r - 37, seed + 91, 42, 17, 7);
  let pool = grass.length ? grass : base;
  if (zone === 'mine') pool = rock.length && rough > .34 ? rock : dirt.length ? dirt : pool;
  else if (zone === 'hub') pool = dirt.length && layer(c, r, seed, 10, 4, 2) > .58 ? dirt : pool;
  else if (zone === 'camp') pool = dirt.length ? dirt : sand.length ? sand : pool;
  else if (zone === 'wild') pool = rock.length && ridge + edge * .2 > .58 ? rock : pool;
  if (rock.length && ridge * .68 + edge * .18 > .72) pool = rock;
  else if (sand.length && dry > .76 && zone !== 'hub') pool = sand;
  return pick(pool, c, r, seed);
}

function transition(cells: Cell[][], base: Family[], seed: number): void {
  const grass = mat(base, 'grass'), dirt = mat(base, 'dirt'), sand = mat(base, 'sand');
  const changes: [number, number, Family][] = [];
  each(cells, (cell, c, r) => {
    if (!cell.land || cell.feature) return;
    const wd = distFeature(cells, c, r, 'water', 3), rd = distFeature(cells, c, r, 'road', 3);
    let pool: Family[] = [];
    if (wd === 1) pool = sand.length ? sand : dirt;
    else if (wd === 2) pool = sand.length && noise(c, r, seed) > .45 ? sand : dirt;
    else if (rd === 1) pool = dirt;
    else if (rd > 0 && noise(c, r, seed + 9) > .55) pool = dirt.length ? dirt : grass;
    if (pool.length) changes.push([c, r, pick(pool, c, r, seed)]);
  });
  for (const [c, r, f] of changes) cells[r][c].base = f;
}

function append(out: EditorTilePlacement[], cells: Cell[][], grid: number, seed: number, counts: Map<string, Map<EditorTerrainTileRole | 'all', number>>, max: number, layer: 'base' | Feature): void {
  each(cells, (cell, c, r) => {
    if (out.length >= max || !cell.land) return;
    const family = layer === 'base' ? cell.base : cell.feature === layer ? cell.featureFamily : undefined;
    if (!family) return;
    const role = layer === 'base'
      ? roleAt(c, r, (x, y) => cells[y]?.[x]?.base?.material === family.material)
      : roleAt(c, r, (x, y) => cells[y]?.[x]?.feature === layer);
    out.push(place(tileForRole(family, role, c, r, seed, counter(counts, family)), c * grid, r * grid));
  });
}

function appendDeco(out: EditorTilePlacement[], cells: Cell[][], tiles: Tile[], grid: number, seed: number, max: number): void {
  if (!tiles.length) return;
  each(cells, (cell, c, r) => {
    if (out.length >= max || !cell.land || cell.feature || cell.base?.material === 'rock') return;
    const factor = cell.zone === 'hub' ? .35 : cell.zone === 'forest' ? 1.2 : .8;
    if (noise(c * 19 + 3, r * 23 + 5, seed) < .14 * factor && noise(Math.floor(c / 5), Math.floor(r / 5), seed + 1) > .62) out.push(place(weighted(tiles, c, r, seed, 0), c * grid, r * grid));
  });
}

function makePlan(cols: number, rows: number, seed: number): Record<Zone, Point> {
  return {
    hub: { c: clamp(Math.round(cols * (.43 + noise(seed, 1, seed) * .14)), 1, Math.max(1, cols - 2)), r: clamp(Math.round(rows * (.43 + noise(seed, 2, seed) * .14)), 1, Math.max(1, rows - 2)) },
    forest: { c: Math.round(cols * (.12 + noise(seed, 3, seed) * .35)), r: Math.round(rows * (.18 + noise(seed, 4, seed) * .35)) },
    camp: { c: Math.round(cols * (.55 + noise(seed, 5, seed) * .32)), r: Math.round(rows * (.14 + noise(seed, 6, seed) * .35)) },
    mine: { c: Math.round(cols * (.58 + noise(seed, 7, seed) * .3)), r: Math.round(rows * (.52 + noise(seed, 8, seed) * .34)) },
    wild: { c: Math.round(cols * (.1 + noise(seed, 9, seed) * .32)), r: Math.round(rows * (.6 + noise(seed, 10, seed) * .28)) },
  };
}

function nearestZone(plan: Record<Zone, Point>, c: number, r: number, seed: number): Zone {
  let best: Zone = 'hub', score = Infinity;
  for (const key of Object.keys(plan) as Zone[]) {
    const p = plan[key];
    const dx = c - p.c + seeded(Math.floor(c / 9), Math.floor(r / 9), seed) * 2.5;
    const dy = r - p.r + seeded(Math.floor(c / 11), Math.floor(r / 11), seed + 1) * 2.5;
    const s = dx * dx + dy * dy;
    if (s < score) { score = s; best = key; }
  }
  return best;
}

function makeWater(cols: number, rows: number, land: Mask, plan: Record<Zone, Point>, seed: number): Mask {
  const v = new Set<string>(), camp = plan.camp;
  const horizontal = seeded(seed, seed + 1, seed + 2) > 0;
  const start = horizontal ? { c: 0, r: Math.round(rows * (.18 + noise(seed, 1, seed) * .64)) } : { c: Math.round(cols * (.18 + noise(seed, 2, seed) * .64)), r: 0 };
  const end = horizontal ? { c: cols - 1, r: Math.round(rows * (.18 + noise(seed, 3, seed) * .64)) } : { c: Math.round(cols * (.18 + noise(seed, 4, seed) * .64)), r: rows - 1 };
  cubic(v, land, start, mid(start, camp), mid(end, camp), end, Math.max(1, Math.round(Math.min(cols, rows) * .022)));
  ellipse(v, land, camp.c, camp.r, Math.max(3, Math.round(cols * .055)), Math.max(3, Math.round(rows * .045)));
  return setMask(cols, rows, v);
}

function makeRoad(cols: number, rows: number, land: Mask, water: Mask, plan: Record<Zone, Point>, seed: number): Mask {
  const v = new Set<string>(), w = Math.max(1, Math.round(Math.min(cols, rows) * .011));
  const gates = [{ c: 0, r: Math.round(rows * .5) }, { c: cols - 1, r: Math.round(rows * .45) }, { c: Math.round(cols * .5), r: rows - 1 }];
  for (const gate of gates) curve(v, land, water, gate, plan.hub, w, seed + gate.c + gate.r);
  for (const key of ['forest', 'camp', 'mine', 'wild'] as Zone[]) curve(v, land, water, plan.hub, plan[key], w, seed + plan[key].c * 3);
  disc(v, land, plan.hub.c, plan.hub.r, Math.max(3, w + 2), water);
  return setMask(cols, rows, v);
}

function collectTiles(tilesets: EditorTilesetAsset[], rules: EditorTerrainRuleSet | undefined, grid: number): Tile[] {
  if (!rules?.rules?.length) return [];
  const assets = new Map(tilesets.map((asset) => [key(asset.id, asset.url), asset]));
  const settings = new Map((rules.tilesets ?? []).map((s) => { const m = s.material ?? 'grass'; return [key(s.tilesetId, s.tilesetUrl), { material: m, movementMode: s.movementMode ?? defaultMove(m), scale: normScale(s.scale) }]; }));
  const out: Tile[] = [], seen = new Set<string>();
  for (const rule of rules.rules) {
    const k = key(rule.tilesetId, rule.tilesetUrl), asset = assets.get(k);
    if (!asset || asset.solidColor !== undefined || !imageUrl(asset.url)) continue;
    const set = settings.get(k), material = rule.material ?? set?.material ?? 'grass', scale = normScale(set?.scale ?? rule.scale);
    if (!fits(rule, scale, grid)) continue;
    const movementMode = rule.movementMode ?? set?.movementMode ?? defaultMove(material), weight = normWeight(rule.weight), role = rule.role ?? 'center';
    const id = `${k}:${rule.sourceRect.x}:${rule.sourceRect.y}:${rule.sourceRect.width}:${rule.sourceRect.height}:${role}:${scale}:${weight}:${material}:${movementMode}`;
    if (weight <= 0 || seen.has(id)) continue;
    seen.add(id); out.push({ asset, sourceRect: { ...rule.sourceRect }, scale, weight, material, movementMode, role });
  }
  return out;
}

function groupTiles(tiles: Tile[]): Family[] { const m = new Map<string, Family>(); for (const t of tiles) { const k = `${t.asset.id}:${t.asset.url}:${t.material}:${t.movementMode}`; let f = m.get(k); if (!f) { f = { key: k, material: t.material, movementMode: t.movementMode, tiles: [], byRole: new Map() }; m.set(k, f); } f.tiles.push(t); const list = f.byRole.get(t.role) ?? []; list.push(t); f.byRole.set(t.role, list); } return [...m.values()]; }
function tileForRole(f: Family, role: EditorTerrainTileRole, c: number, r: number, seed: number, counts: Map<EditorTerrainTileRole | 'all', number>): Tile { const list = f.byRole.get(role) ?? f.byRole.get('center') ?? f.tiles; const k = f.byRole.has(role) ? role : f.byRole.has('center') ? 'center' : 'all'; const i = counts.get(k) ?? 0; counts.set(k, i + 1); return weighted(list, c, r, seed, i); }
function weighted(list: Tile[], c: number, r: number, seed: number, salt: number): Tile { const total = list.reduce((s, t) => s + t.weight, 0); let roll = noise(c * 31 + salt * 17, r * 37 + salt * 13, seed) * total; for (const t of list) { roll -= t.weight; if (roll <= 0) return t; } return list[list.length - 1]; }
function place(t: Tile, x: number, y: number): EditorTilePlacement { return { id: crypto.randomUUID(), assetId: t.asset.id, assetUrl: t.asset.url, categoryId: t.asset.categoryId, x, y, layer: 'ground', scale: 1, displayWidth: Math.max(1, Math.round(t.sourceRect.width * t.scale)), displayHeight: Math.max(1, Math.round(t.sourceRect.height * t.scale)), sourceRect: { ...t.sourceRect }, solidColor: undefined, transparentBlack: false, gameplay: undefined, terrainMaterial: t.material, terrainMovementMode: t.movementMode }; }
function roleAt(c: number, r: number, same: (c: number, r: number) => boolean): EditorTerrainTileRole { const t = same(c, r - 1), b = same(c, r + 1), l = same(c - 1, r), rr = same(c + 1, r); if (!t && !l) return 'outerTopLeft'; if (!t && !rr) return 'outerTopRight'; if (!b && !l) return 'outerBottomLeft'; if (!b && !rr) return 'outerBottomRight'; if (!t) return 'edgeTop'; if (!b) return 'edgeBottom'; if (!l) return 'edgeLeft'; if (!rr) return 'edgeRight'; if (!same(c - 1, r - 1)) return 'innerTopLeft'; if (!same(c + 1, r - 1)) return 'innerTopRight'; if (!same(c - 1, r + 1)) return 'innerBottomLeft'; if (!same(c + 1, r + 1)) return 'innerBottomRight'; return 'center'; }
function smooth(cells: Cell[][], passes: number): void { for (let p = 0; p < passes; p++) { const changes: [number, number, Family][] = []; each(cells, (cell, c, r) => { if (!cell.land || cell.feature || !cell.base) return; const counts = new Map<EditorTerrainMaterial, { f: Family; n: number }>(); for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) { const n = cells[y]?.[x]; if ((x !== c || y !== r) && n?.land && !n.feature && n.base) { const e = counts.get(n.base.material) ?? { f: n.base, n: 0 }; e.n++; counts.set(n.base.material, e); } } let best: { f: Family; n: number } | undefined; for (const e of counts.values()) if (!best || e.n > best.n) best = e; if (best && best.n >= 5 && (counts.get(cell.base.material)?.n ?? 0) <= 2) changes.push([c, r, best.f]); }); for (const [c, r, f] of changes) cells[r][c].base = f; } }
function distFeature(cells: Cell[][], c: number, r: number, f: Feature, radius: number): number { for (let d = 1; d <= radius; d++) for (let y = r - d; y <= r + d; y++) for (let x = c - d; x <= c + d; x++) if (Math.max(Math.abs(x - c), Math.abs(y - r)) === d && cells[y]?.[x]?.feature === f) return d; return 0; }
function each(cells: Cell[][], fn: (cell: Cell, c: number, r: number) => void): void { for (let r = 0; r < cells.length; r++) for (let c = 0; c < cells[r].length; c++) fn(cells[r][c], c, r); }
function counter(m: Map<string, Map<EditorTerrainTileRole | 'all', number>>, f: Family): Map<EditorTerrainTileRole | 'all', number> { let c = m.get(f.key); if (!c) { c = new Map(); m.set(f.key, c); } return c; }
function mat(f: Family[], material: EditorTerrainMaterial): Family[] { return f.filter((x) => x.material === material); }
function isBase(m: EditorTerrainMaterial): boolean { return m === 'grass' || m === 'dirt' || m === 'sand' || m === 'rock'; }
function fullMask(cols: number, rows: number): Mask { return { has: (c, r) => c >= 0 && c < cols && r >= 0 && r < rows }; }
function emptyMask(): Mask { return { has: () => false }; }
function islandMask(cols: number, rows: number, seed: number): Mask { const v = new Set<string>(), cx = (cols - 1) / 2, cy = (rows - 1) / 2, rx = Math.max(2, cols * .47), ry = Math.max(2, rows * .47); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const nx = (c - cx) / rx, ny = (r - cy) / ry; if (Math.sqrt(nx * nx + ny * ny) <= .93 + seeded(Math.round(Math.atan2(ny, nx) * 8), 0, seed) * .09) v.add(`${c}:${r}`); } return setMask(cols, rows, v); }
function setMask(cols: number, rows: number, v: Set<string>): Mask { return { has: (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && v.has(`${c}:${r}`) }; }
function curve(v: Set<string>, land: Mask, avoid: Mask, a: Point, b: Point, w: number, seed: number): void { const p1 = { c: Math.round(lerp(a.c, b.c, .33) + seeded(a.c, a.r, seed) * 8), r: Math.round(lerp(a.r, b.r, .33) + seeded(a.r, a.c, seed + 1) * 8) }; const p2 = { c: Math.round(lerp(a.c, b.c, .66) + seeded(b.c, b.r, seed + 2) * 8), r: Math.round(lerp(a.r, b.r, .66) + seeded(b.r, b.c, seed + 3) * 8) }; cubic(v, { has: (c, r) => land.has(c, r) && !avoid.has(c, r) }, a, p1, p2, b, w); }
function cubic(v: Set<string>, mask: Mask, a: Point, b: Point, c: Point, d: Point, w: number): void { const steps = 160; let prev = a; for (let i = 0; i <= steps; i++) { const t = i / steps, n = cubicPoint(a, b, c, d, t); line(v, mask, prev, n, w); prev = n; } }
function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point { const i = 1 - t; return { c: Math.round(i * i * i * a.c + 3 * i * i * t * b.c + 3 * i * t * t * c.c + t * t * t * d.c), r: Math.round(i * i * i * a.r + 3 * i * i * t * b.r + 3 * i * t * t * c.r + t * t * t * d.r) }; }
function line(v: Set<string>, mask: Mask, a: Point, b: Point, w: number): void { const steps = Math.max(Math.abs(b.c - a.c), Math.abs(b.r - a.r), 1); for (let i = 0; i <= steps; i++) disc(v, mask, Math.round(lerp(a.c, b.c, i / steps)), Math.round(lerp(a.r, b.r, i / steps)), w); }
function ellipse(v: Set<string>, mask: Mask, cc: number, rr: number, rx: number, ry: number): void { for (let r = rr - ry; r <= rr + ry; r++) for (let c = cc - rx; c <= cc + rx; c++) { const nx = (c - cc) / Math.max(1, rx), ny = (r - rr) / Math.max(1, ry); if (nx * nx + ny * ny <= 1 && mask.has(c, r)) v.add(`${c}:${r}`); } }
function disc(v: Set<string>, mask: Mask, cc: number, rr: number, rad: number, avoid?: Mask): void { for (let r = rr - rad; r <= rr + rad; r++) for (let c = cc - rad; c <= cc + rad; c++) { const dx = c - cc, dy = r - rr; if (dx * dx + dy * dy <= rad * rad && mask.has(c, r) && !avoid?.has(c, r)) v.add(`${c}:${r}`); } }
function mid(a: Point, b: Point): Point { return { c: Math.round((a.c + b.c) / 2), r: Math.round((a.r + b.r) / 2) }; }
function ridgeScore(nx: number, ny: number, ax: number, ay: number, bx: number, by: number): number { const abx = bx - ax, aby = by - ay, apx = nx - ax, apy = ny - ay, t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / Math.max(.0001, abx * abx + aby * aby))); return Math.max(0, 1 - Math.hypot(nx - (ax + abx * t), ny - (ay + aby * t)) / .16); }
function layer(c: number, r: number, seed: number, a: number, b: number, d: number): number { return noise(Math.floor(c / a), Math.floor(r / a), seed) * .58 + noise(Math.floor(c / b), Math.floor(r / b), seed + 1) * .3 + noise(Math.floor(c / d), Math.floor(r / d), seed + 2) * .12; }
function noise(x: number, y: number, seed: number): number { return seeded(x, y, seed) * .5 + .5; }
function seeded(x: number, y: number, seed: number): number { const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function key(id: string, url: string): string { return `${id}:${url}`; }
function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function fits(rule: EditorTerrainTileRule, scale: number, grid: number): boolean { return Math.round(rule.sourceRect.width * scale) === grid && Math.round(rule.sourceRect.height * scale) === grid; }
function imageUrl(url: string): boolean { return !url.startsWith('solid://') && !url.startsWith('editor://'); }
function defaultMove(m: EditorTerrainMaterial): EditorTerrainMovementMode { if (m === 'water') return 'boatOnly'; if (m === 'rock') return 'blocked'; return 'passable'; }
function readRules(): EditorTerrainRuleSet | undefined { try { const raw = window.localStorage.getItem(RULE_KEY); if (!raw) return undefined; const parsed = JSON.parse(raw) as EditorTerrainRuleSet; return parsed?.version === 1 && Array.isArray(parsed.rules) ? parsed : undefined; } catch { return undefined; } }
function readShape(): TerrainGenerationShape { try { return window.localStorage.getItem(SHAPE_KEY) === 'island' ? 'island' : 'rect'; } catch { return 'rect'; } }
function readSeed(): number { try { return normSeed(Number(window.localStorage.getItem(SEED_KEY) ?? '1')); } catch { return 1; } }
function normInt(v: number | undefined, f: number): number { return !Number.isFinite(v) || (v as number) <= 0 ? f : Math.round(v as number); }
function normScale(v: number | undefined): number { return !Number.isFinite(v) || (v as number) <= 0 ? 1 : Math.max(.1, Math.min(10, Math.round((v as number) * 10) / 10)); }
function normWeight(v: number | undefined): number { return !Number.isFinite(v) || (v as number) < 0 ? 1 : Math.max(0, Math.min(100, Math.round(v as number))); }
function normSeed(v: number): number { return !Number.isFinite(v) ? 1 : Math.max(0, Math.min(999999999, Math.round(v))); }
