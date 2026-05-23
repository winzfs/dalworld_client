import type { EditorPlacementGameplay, EditorResourceType, EditorSourceRect, EditorTilePlacement, EditorTilesetAsset } from '../types';

export type EditorResourceGenerationRule = {
  id: string;
  enabled: boolean;
  asset: EditorTilesetAsset;
  sourceRect?: EditorSourceRect;
  resourceType: EditorResourceType;
  amount: number;
  scale: number;
};

export type ResourceGenerationOptions = {
  rules: EditorResourceGenerationRule[];
  placements: EditorTilePlacement[];
  gridSize: number;
  seed?: number;
};

type Cell = { column: number; row: number; x: number; y: number };

const PASSABLE_MATERIALS = new Set(['grass', 'dirt', 'sand']);
const BLOCKING_MOVEMENT = new Set(['blocked', 'boatOnly', 'swim']);

export function generateResourcePlacements(options: ResourceGenerationOptions): EditorTilePlacement[] {
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? 1);
  const candidates = collectPassableGroundCells(options.placements, gridSize);
  if (candidates.length === 0) return [];

  const occupied = collectOccupiedCells(options.placements, gridSize);
  const generated: EditorTilePlacement[] = [];
  const enabledRules = options.rules.filter((rule) => rule.enabled && rule.amount > 0);

  for (let ruleIndex = 0; ruleIndex < enabledRules.length; ruleIndex += 1) {
    const rule = enabledRules[ruleIndex];
    const amount = normalizeAmount(rule.amount);
    const clusters = createClusterCenters(candidates, Math.max(1, Math.ceil(amount / 8)), seed + ruleIndex * 997);
    let placed = 0;
    let attempts = 0;
    const maxAttempts = Math.max(250, amount * 90);

    while (placed < amount && attempts < maxAttempts) {
      attempts += 1;
      const cluster = clusters[Math.floor(rand(seed, ruleIndex * 31 + attempts, 11) * clusters.length)] ?? candidates[0];
      const radius = Math.max(2, Math.round(3 + rand(seed + 17, attempts, ruleIndex) * 7));
      const cell = pickNearCell(candidates, cluster, radius, seed + attempts * 13 + ruleIndex * 101);
      if (!cell) continue;
      const key = `${cell.column}:${cell.row}`;
      if (occupied.has(key)) continue;
      if (hasOccupiedNearby(cell, occupied, Math.max(1, Math.round(rule.scale * 1.35)))) continue;
      const placement = createResourcePlacement(rule, cell, gridSize, seed + attempts + ruleIndex * 409);
      generated.push(placement);
      occupied.add(key);
      placed += 1;
    }
  }

  return generated;
}

function collectPassableGroundCells(placements: EditorTilePlacement[], gridSize: number): Cell[] {
  const terrain = new Map<string, EditorTilePlacement>();
  for (const placement of placements) {
    if (placement.layer !== 'ground' || !placement.terrainMaterial) continue;
    const column = Math.round(placement.x / gridSize);
    const row = Math.round(placement.y / gridSize);
    terrain.set(`${column}:${row}`, placement);
  }

  const cells: Cell[] = [];
  for (const [key, placement] of terrain.entries()) {
    if (!placement.terrainMaterial || !PASSABLE_MATERIALS.has(placement.terrainMaterial)) continue;
    if (placement.terrainMovementMode && BLOCKING_MOVEMENT.has(placement.terrainMovementMode)) continue;
    const [columnRaw, rowRaw] = key.split(':').map(Number);
    const column = Number.isFinite(columnRaw) ? columnRaw : 0;
    const row = Number.isFinite(rowRaw) ? rowRaw : 0;
    cells.push({ column, row, x: column * gridSize, y: row * gridSize });
  }
  return cells;
}

function collectOccupiedCells(placements: EditorTilePlacement[], gridSize: number): Set<string> {
  const occupied = new Set<string>();
  for (const placement of placements) {
    if (placement.layer !== 'object' && placement.layer !== 'collision') continue;
    const column = Math.round(placement.x / gridSize);
    const row = Math.round(placement.y / gridSize);
    occupied.add(`${column}:${row}`);
  }
  return occupied;
}

function createClusterCenters(candidates: Cell[], count: number, seed: number): Cell[] {
  const centers: Cell[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(rand(seed, i * 37 + 3, 17) * candidates.length) % candidates.length;
    centers.push(candidates[index]);
  }
  return centers.length > 0 ? centers : [candidates[0]];
}

function pickNearCell(candidates: Cell[], center: Cell, radius: number, seed: number): Cell | null {
  const nearby = candidates.filter((cell) => Math.abs(cell.column - center.column) <= radius && Math.abs(cell.row - center.row) <= radius);
  const pool = nearby.length > 0 ? nearby : candidates;
  if (pool.length === 0) return null;
  const index = Math.floor(rand(seed, center.column + radius, center.row - radius) * pool.length) % pool.length;
  return pool[index];
}

function hasOccupiedNearby(cell: Cell, occupied: Set<string>, radius: number): boolean {
  for (let y = cell.row - radius; y <= cell.row + radius; y += 1) {
    for (let x = cell.column - radius; x <= cell.column + radius; x += 1) {
      if (occupied.has(`${x}:${y}`)) return true;
    }
  }
  return false;
}

function createResourcePlacement(rule: EditorResourceGenerationRule, cell: Cell, gridSize: number, seed: number): EditorTilePlacement {
  const sourceRect = rule.sourceRect ? { ...rule.sourceRect } : undefined;
  const width = sourceRect?.width ?? rule.asset.tileWidth ?? gridSize;
  const height = sourceRect?.height ?? rule.asset.tileHeight ?? gridSize;
  const jitter = Math.max(0, gridSize * 0.28);
  const offsetX = Math.round((rand(seed, cell.column, 1) - 0.5) * jitter);
  const offsetY = Math.round((rand(seed, cell.row, 2) - 0.5) * jitter);
  return {
    id: crypto.randomUUID(),
    assetId: rule.asset.id,
    assetUrl: rule.asset.url,
    categoryId: rule.asset.categoryId,
    x: cell.x + offsetX,
    y: cell.y + offsetY,
    layer: 'object',
    scale: normalizeScale(rule.scale),
    displayWidth: width,
    displayHeight: height,
    sourceRect,
    solidColor: rule.asset.solidColor,
    transparentBlack: rule.asset.solidColor === undefined,
    gameplay: createResourceGameplay(rule.resourceType),
  };
}

function createResourceGameplay(resourceType: EditorResourceType): EditorPlacementGameplay {
  if (resourceType === 'tree') return { kind: 'resource', resourceType: 'tree', blocksMovement: true, maxHp: 75, respawnMs: 25_000 };
  return { kind: 'resource', resourceType: 'stone', blocksMovement: true, maxHp: 100, respawnMs: 35_000 };
}

export function inferResourceTypeFromAsset(asset: EditorTilesetAsset): EditorResourceType {
  const text = `${asset.name} ${asset.url}`.toLowerCase();
  return text.includes('tree') ? 'tree' : 'stone';
}

function rand(seed: number, x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function normalizeGridSize(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.round(value as number)); }
function normalizeScale(value: number | undefined): number { return !Number.isFinite(value) || (value as number) <= 0 ? 1 : Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10)); }
function normalizeAmount(value: number): number { return !Number.isFinite(value) ? 0 : Math.max(0, Math.min(5000, Math.round(value))); }
function normalizeSeed(value: number): number { return !Number.isFinite(value) ? 1 : Math.max(0, Math.min(999999999, Math.round(value))); }
