import type { EditorTerrainMaterial, EditorTerrainMovementMode, EditorTerrainTileRole, EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainV2 } from './TerrainWorldPlanV2';

type CellPoint = { column: number; row: number };
type BaseMaterial = 'grass' | 'dirt' | 'sand' | 'rock';
type BaseCell = {
  key: string;
  point: CellPoint;
  placement: EditorTilePlacement;
  material: BaseMaterial;
};
type Candidate = {
  placement: EditorTilePlacement;
  material: BaseMaterial;
  role: EditorTerrainTileRole;
};

const BASE_MATERIALS = new Set<EditorTerrainMaterial>(['grass', 'dirt', 'sand', 'rock']);

export async function generateWorldPlanTerrainOrganicBase(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainV2(options);
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredSeed());
  const baseCells = collectBaseCells(placements, gridSize);
  if (baseCells.length === 0) return placements;

  const candidates = collectCandidates(baseCells);
  const candidateMaterials = new Set(candidates.map((candidate) => candidate.material));
  if (candidateMaterials.size <= 1) return placements;

  const refinedMaterials = refineMaterials(baseCells, candidateMaterials, seed);
  smoothMaterials(refinedMaterials, 2);

  const rebuiltBase = rebuildBasePlacements(baseCells, refinedMaterials, candidates, seed);
  const rebuiltById = new Map(rebuiltBase.map((placement) => [placement.id, placement]));
  return placements.map((placement) => rebuiltById.get(placement.id) ?? placement);
}

function collectBaseCells(placements: EditorTilePlacement[], gridSize: number): BaseCell[] {
  const cells: BaseCell[] = [];
  for (const placement of placements) {
    if (placement.layer !== 'ground') continue;
    if (!placement.terrainMaterial || !BASE_MATERIALS.has(placement.terrainMaterial)) continue;
    if (!placement.sourceRect) continue;
    const point = cellPointFromPlacement(placement, gridSize);
    cells.push({ key: `${point.column}:${point.row}`, point, placement, material: placement.terrainMaterial as BaseMaterial });
  }
  return cells;
}

function collectCandidates(baseCells: BaseCell[]): Candidate[] {
  const byCell = new Map(baseCells.map((cell) => [cell.key, cell]));
  return baseCells.map((cell) => ({
    placement: cell.placement,
    material: cell.material,
    role: resolveRole(cell.point.column, cell.point.row, (column, row) => byCell.get(`${column}:${row}`)?.material === cell.material),
  }));
}

function refineMaterials(baseCells: BaseCell[], available: Set<BaseMaterial>, seed: number): Map<string, BaseMaterial> {
  const result = new Map<string, BaseMaterial>();
  for (const cell of baseCells) {
    const c = cell.point.column;
    const r = cell.point.row;
    const broad = layeredNoise(c, r, seed + 11, 58, 27, 11);
    const middle = layeredNoise(c + 91, r - 43, seed + 101, 32, 13, 5);
    const dry = layeredNoise(c - 67, r + 127, seed + 211, 72, 31, 13);
    const ridge = ridgeBand(c, r, seed + 307);
    let material = cell.material;

    if (available.has('rock') && shouldBecomeRock(cell.material, ridge, middle, broad)) material = 'rock';
    else if (available.has('sand') && shouldBecomeSand(cell.material, dry, broad, middle)) material = 'sand';
    else if (available.has('dirt') && shouldBecomeDirt(cell.material, broad, middle, dry)) material = 'dirt';
    else if (available.has('grass') && shouldBecomeGrass(cell.material, broad, middle, dry)) material = 'grass';

    result.set(cell.key, material);
  }
  return result;
}

function shouldBecomeRock(current: BaseMaterial, ridge: number, middle: number, broad: number): boolean {
  if (current === 'rock') return ridge > 0.38 || middle > 0.42;
  return ridge * 0.7 + middle * 0.22 + broad * 0.08 > 0.76;
}

function shouldBecomeSand(current: BaseMaterial, dry: number, broad: number, middle: number): boolean {
  if (current === 'rock') return false;
  if (current === 'sand') return dry > 0.38 || broad > 0.72;
  return dry > 0.78 && middle > 0.42;
}

function shouldBecomeDirt(current: BaseMaterial, broad: number, middle: number, dry: number): boolean {
  if (current === 'rock') return false;
  if (current === 'dirt') return broad < 0.66 || middle < 0.7;
  return (broad < 0.26 && middle < 0.62) || (dry < 0.24 && middle > 0.34);
}

function shouldBecomeGrass(current: BaseMaterial, broad: number, middle: number, dry: number): boolean {
  if (current === 'rock') return false;
  if (current === 'grass') return true;
  return broad > 0.68 && middle > 0.34 && dry < 0.84;
}

function smoothMaterials(materials: Map<string, BaseMaterial>, passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const changes: Array<[string, BaseMaterial]> = [];
    for (const [key, material] of materials.entries()) {
      const point = parseCellKey(key);
      const counts = new Map<BaseMaterial, number>();
      for (let y = point.row - 1; y <= point.row + 1; y += 1) {
        for (let x = point.column - 1; x <= point.column + 1; x += 1) {
          if (x === point.column && y === point.row) continue;
          const neighbor = materials.get(`${x}:${y}`);
          if (!neighbor) continue;
          counts.set(neighbor, (counts.get(neighbor) ?? 0) + 1);
        }
      }
      const currentCount = counts.get(material) ?? 0;
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 5 && currentCount <= 2) changes.push([key, best[0]]);
    }
    for (const [key, material] of changes) materials.set(key, material);
  }
}

function rebuildBasePlacements(baseCells: BaseCell[], materials: Map<string, BaseMaterial>, candidates: Candidate[], seed: number): EditorTilePlacement[] {
  const cellMap = new Map(baseCells.map((cell) => [cell.key, cell]));
  return baseCells.map((cell) => {
    const material = materials.get(cell.key) ?? cell.material;
    const role = resolveRole(cell.point.column, cell.point.row, (column, row) => materials.get(`${column}:${row}`) === material);
    const candidate = pickCandidate(candidates, material, role, cell.point.column, cell.point.row, seed);
    if (!candidate) return cell.placement;
    return {
      ...cell.placement,
      assetId: candidate.placement.assetId,
      assetUrl: candidate.placement.assetUrl,
      categoryId: candidate.placement.categoryId,
      sourceRect: candidate.placement.sourceRect ? { ...candidate.placement.sourceRect } : undefined,
      displayWidth: candidate.placement.displayWidth,
      displayHeight: candidate.placement.displayHeight,
      scale: candidate.placement.scale,
      transparentBlack: true,
      terrainMaterial: material,
      terrainMovementMode: getMovementModeForMaterial(material, candidate.placement.terrainMovementMode),
    };
  });
}

function pickCandidate(candidates: Candidate[], material: BaseMaterial, role: EditorTerrainTileRole, column: number, row: number, seed: number): Candidate | undefined {
  const exact = candidates.filter((candidate) => candidate.material === material && candidate.role === role);
  const center = candidates.filter((candidate) => candidate.material === material && candidate.role === 'center');
  const any = candidates.filter((candidate) => candidate.material === material);
  const list = exact.length > 0 ? exact : center.length > 0 ? center : any;
  if (list.length === 0) return undefined;
  const index = Math.abs(Math.floor(noise(column * 31 + 3, row * 37 + 5, seed + role.length) * list.length)) % list.length;
  return list[index];
}

function getMovementModeForMaterial(material: BaseMaterial, fallback: EditorTerrainMovementMode | undefined): EditorTerrainMovementMode | undefined {
  if (material === 'rock') return 'blocked';
  return fallback ?? 'passable';
}

function ridgeBand(column: number, row: number, seed: number): number {
  const a = Math.abs(layeredNoise(column + 21, row - 19, seed, 64, 29, 13) - 0.5) * 2;
  const b = layeredNoise(column - 113, row + 71, seed + 41, 24, 10, 4);
  return Math.max(0, 1 - a * 1.35) * 0.72 + b * 0.28;
}

function resolveRole(column: number, row: number, same: (column: number, row: number) => boolean): EditorTerrainTileRole {
  const top = same(column, row - 1);
  const bottom = same(column, row + 1);
  const left = same(column - 1, row);
  const right = same(column + 1, row);
  if (!top && !left) return 'outerTopLeft';
  if (!top && !right) return 'outerTopRight';
  if (!bottom && !left) return 'outerBottomLeft';
  if (!bottom && !right) return 'outerBottomRight';
  if (!top) return 'edgeTop';
  if (!bottom) return 'edgeBottom';
  if (!left) return 'edgeLeft';
  if (!right) return 'edgeRight';
  if (!same(column - 1, row - 1)) return 'innerTopLeft';
  if (!same(column + 1, row - 1)) return 'innerTopRight';
  if (!same(column - 1, row + 1)) return 'innerBottomLeft';
  if (!same(column + 1, row + 1)) return 'innerBottomRight';
  return 'center';
}

function cellPointFromPlacement(placement: EditorTilePlacement, gridSize: number): CellPoint {
  return { column: Math.round(placement.x / gridSize), row: Math.round(placement.y / gridSize) };
}

function parseCellKey(key: string): CellPoint {
  const [column, row] = key.split(':').map((value) => Number(value));
  return { column: Number.isFinite(column) ? column : 0, row: Number.isFinite(row) ? row : 0 };
}

function layeredNoise(column: number, row: number, seed: number, coarseScale: number, mediumScale: number, fineScale: number): number {
  return noise(Math.floor(column / coarseScale), Math.floor(row / coarseScale), seed) * 0.52
    + noise(Math.floor(column / mediumScale), Math.floor(row / mediumScale), seed + 17) * 0.32
    + noise(Math.floor(column / fineScale), Math.floor(row / fineScale), seed + 37) * 0.16;
}

function noise(x: number, y: number, seed: number): number {
  return seededNoise(x, y, seed) * 0.5 + 0.5;
}

function seededNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function normalizeGridSize(value: number | undefined): number {
  return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.round(value as number));
}

function normalizeSeed(value: number): number {
  return !Number.isFinite(value) ? 1 : Math.max(0, Math.min(999999999, Math.round(value)));
}

function readStoredSeed(): number {
  try {
    return normalizeSeed(Number(window.localStorage.getItem('dalworld:editor-terrain-seed:dalworld-map') ?? '1'));
  } catch {
    return 1;
  }
}
