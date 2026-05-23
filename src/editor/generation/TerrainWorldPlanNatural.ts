import type { EditorTerrainMaterial, EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainLayeredV2 } from './TerrainWorldPlanLayeredV2';

type CellPoint = { column: number; row: number };

type MaterialCandidate = {
  material: EditorTerrainMaterial;
  placements: EditorTilePlacement[];
};

const PATCH_SOURCE_MATERIALS: EditorTerrainMaterial[] = ['grass', 'dirt', 'sand'];
const PATCH_TARGET_MATERIALS = new Set<EditorTerrainMaterial>(['grass', 'dirt', 'sand']);

export async function generateWorldPlanTerrainNatural(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainLayeredV2(options);
  const gridSize = normalizeGridSize(options.gridSize);
  const seed = normalizeSeed(options.seed ?? readStoredSeed());
  const candidates = collectCandidates(placements);
  if (candidates.length === 0) return placements;

  const result: EditorTilePlacement[] = [];
  const occupiedOverlayCells = new Set<string>();

  for (const placement of placements) {
    result.push(placement);

    if (!isPatchTarget(placement)) continue;
    const point = cellPointFromPlacement(placement, gridSize);
    const key = `${point.column}:${point.row}`;
    if (occupiedOverlayCells.has(key)) continue;

    const patchMaterial = choosePatchMaterial(placement.terrainMaterial as EditorTerrainMaterial, point.column, point.row, seed);
    if (!patchMaterial || patchMaterial === placement.terrainMaterial) continue;

    const source = pickCandidate(candidates, patchMaterial, point.column, point.row, seed);
    if (!source) continue;

    const opacityRoll = layeredNoise(point.column + 17, point.row - 31, seed + 701, 9, 4, 2);
    if (opacityRoll < 0.42) continue;

    result.push(createVisualPatch(source, placement, opacityRoll));
    occupiedOverlayCells.add(key);
  }

  return result;
}

function collectCandidates(placements: EditorTilePlacement[]): MaterialCandidate[] {
  const byMaterial = new Map<EditorTerrainMaterial, EditorTilePlacement[]>();
  for (const placement of placements) {
    if (placement.layer !== 'ground') continue;
    if (!placement.sourceRect || !placement.terrainMaterial) continue;
    if (!PATCH_SOURCE_MATERIALS.includes(placement.terrainMaterial)) continue;
    const list = byMaterial.get(placement.terrainMaterial) ?? [];
    list.push(placement);
    byMaterial.set(placement.terrainMaterial, list);
  }
  return [...byMaterial.entries()].map(([material, materialPlacements]) => ({ material, placements: materialPlacements }));
}

function isPatchTarget(placement: EditorTilePlacement): boolean {
  if (placement.layer !== 'ground') return false;
  if (!placement.terrainMaterial) return false;
  if (!PATCH_TARGET_MATERIALS.has(placement.terrainMaterial)) return false;
  if (!placement.sourceRect) return false;
  return true;
}

function choosePatchMaterial(current: EditorTerrainMaterial, column: number, row: number, seed: number): EditorTerrainMaterial | undefined {
  const broad = layeredNoise(column, row, seed + 101, 38, 17, 7);
  const detail = layeredNoise(column + 211, row - 89, seed + 307, 15, 6, 3);
  const dry = layeredNoise(column - 73, row + 151, seed + 509, 55, 23, 9);

  if (current === 'grass') {
    if (dry > 0.78 && detail > 0.52) return 'sand';
    if (broad < 0.27 || detail < 0.18) return 'dirt';
    return undefined;
  }

  if (current === 'dirt') {
    if (broad > 0.82 && detail > 0.46) return 'grass';
    if (dry > 0.82 && detail > 0.58) return 'sand';
    return undefined;
  }

  if (current === 'sand') {
    if (broad < 0.3 && detail < 0.45) return 'dirt';
    if (broad > 0.86 && detail > 0.56) return 'grass';
    return undefined;
  }

  return undefined;
}

function pickCandidate(candidates: MaterialCandidate[], material: EditorTerrainMaterial, column: number, row: number, seed: number): EditorTilePlacement | undefined {
  const group = candidates.find((candidate) => candidate.material === material);
  if (!group || group.placements.length === 0) return undefined;
  const index = Math.abs(Math.floor(noise(column * 19 + 5, row * 23 + 7, seed) * group.placements.length)) % group.placements.length;
  return group.placements[index];
}

function createVisualPatch(source: EditorTilePlacement, target: EditorTilePlacement, noiseValue: number): EditorTilePlacement {
  return {
    id: crypto.randomUUID(),
    assetId: source.assetId,
    assetUrl: source.assetUrl,
    categoryId: source.categoryId,
    x: target.x,
    y: target.y,
    layer: 'ground',
    scale: source.scale,
    displayWidth: source.displayWidth,
    displayHeight: source.displayHeight,
    sourceRect: source.sourceRect ? { ...source.sourceRect } : undefined,
    solidColor: source.solidColor,
    transparentBlack: true,
    gameplay: undefined,
    terrainMaterial: undefined,
    terrainMovementMode: undefined,
    opacity: clamp(0.18 + noiseValue * 0.22, 0.24, 0.38),
  };
}

function cellPointFromPlacement(placement: EditorTilePlacement, gridSize: number): CellPoint {
  return { column: Math.round(placement.x / gridSize), row: Math.round(placement.y / gridSize) };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
