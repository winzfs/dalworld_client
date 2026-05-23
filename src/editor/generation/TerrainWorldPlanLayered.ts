import type { EditorTerrainMaterial, EditorTerrainTileRole, EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainDebug } from './TerrainWorldPlanDebug';

type DebugPlacement = EditorTilePlacement & {
  terrainDebugRole?: EditorTerrainTileRole;
};

const OVERLAY_ROLES = new Set<EditorTerrainTileRole>([
  'edgeTop',
  'edgeBottom',
  'edgeLeft',
  'edgeRight',
  'outerTopLeft',
  'outerTopRight',
  'outerBottomLeft',
  'outerBottomRight',
  'innerTopLeft',
  'innerTopRight',
  'innerBottomLeft',
  'innerBottomRight',
]);

const VISUAL_BASE_MATERIALS = new Set<EditorTerrainMaterial>(['grass', 'dirt', 'sand']);

export async function generateWorldPlanTerrainLayered(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainDebug(options) as DebugPlacement[];
  const gridSize = normalizeGridSize(options.gridSize);
  const byCell = createTerrainCellMap(placements, gridSize);
  const visualBaseCandidates = placements.filter((placement) =>
    placement.layer === 'ground'
    && placement.sourceRect
    && placement.terrainMaterial
    && VISUAL_BASE_MATERIALS.has(placement.terrainMaterial),
  );

  if (visualBaseCandidates.length === 0) return placements;

  const layered: EditorTilePlacement[] = [];
  for (const placement of placements) {
    const role = resolvePlacementRole(placement, byCell, gridSize);
    if (shouldAddUnderlay(placement, role)) {
      const underlaySource = findNearestVisualBase(visualBaseCandidates, placement);
      if (underlaySource) layered.push(createVisualUnderlay(underlaySource, placement));
    }
    layered.push(placement);
  }

  return layered;
}

function createTerrainCellMap(placements: EditorTilePlacement[], gridSize: number): Map<string, EditorTilePlacement> {
  const map = new Map<string, EditorTilePlacement>();
  for (const placement of placements) {
    if (placement.layer !== 'ground' || !placement.terrainMaterial) continue;
    const column = Math.round(placement.x / gridSize);
    const row = Math.round(placement.y / gridSize);
    map.set(`${column}:${row}`, placement);
  }
  return map;
}

function resolvePlacementRole(placement: DebugPlacement, byCell: Map<string, EditorTilePlacement>, gridSize: number): EditorTerrainTileRole | undefined {
  if (placement.layer !== 'ground' || !placement.terrainMaterial) return undefined;
  if (placement.terrainDebugRole) return placement.terrainDebugRole;
  const column = Math.round(placement.x / gridSize);
  const row = Math.round(placement.y / gridSize);
  const material = placement.terrainMaterial;
  return resolveRole(column, row, (x, y) => byCell.get(`${x}:${y}`)?.terrainMaterial === material);
}

function shouldAddUnderlay(placement: DebugPlacement, role: EditorTerrainTileRole | undefined): boolean {
  if (placement.layer !== 'ground') return false;
  if (!placement.terrainMaterial) return false;
  if (placement.terrainMaterial === 'grass' && role === 'center') return false;
  if (!role) return false;
  return OVERLAY_ROLES.has(role);
}

function findNearestVisualBase(candidates: EditorTilePlacement[], target: EditorTilePlacement): EditorTilePlacement | undefined {
  let best: EditorTilePlacement | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.x - target.x;
    const dy = candidate.y - target.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function createVisualUnderlay(source: EditorTilePlacement, target: EditorTilePlacement): EditorTilePlacement {
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
  };
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

function normalizeGridSize(value: number | undefined): number {
  return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.round(value as number));
}
