import type { EditorTerrainMaterial, EditorTerrainTileRole, EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainDebug } from './TerrainWorldPlanDebug';

type DebugPlacement = EditorTilePlacement & { terrainDebugRole?: EditorTerrainTileRole };
type CellPoint = { column: number; row: number };
type RoadOverlay = { placement: EditorTilePlacement; targetKey: string };

const OVERLAY_ROLES = new Set<EditorTerrainTileRole>([
  'edgeTop', 'edgeBottom', 'edgeLeft', 'edgeRight',
  'outerTopLeft', 'outerTopRight', 'outerBottomLeft', 'outerBottomRight',
  'innerTopLeft', 'innerTopRight', 'innerBottomLeft', 'innerBottomRight',
]);

const VISUAL_BASE_MATERIALS = new Set<EditorTerrainMaterial>(['grass', 'dirt', 'sand']);
const ROAD_RING_TARGET_MATERIALS = new Set<EditorTerrainMaterial>(['grass', 'dirt', 'sand']);

export async function generateWorldPlanTerrainLayeredV2(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainDebug(options) as DebugPlacement[];
  const gridSize = normalizeGridSize(options.gridSize);
  const byCell = createTerrainCellMap(placements, gridSize);
  const visualBaseCandidates = placements.filter((placement) =>
    placement.layer === 'ground'
    && Boolean(placement.sourceRect)
    && Boolean(placement.terrainMaterial)
    && VISUAL_BASE_MATERIALS.has(placement.terrainMaterial as EditorTerrainMaterial),
  );
  if (visualBaseCandidates.length === 0) return placements.map(forceTransparentPlacement);

  const roadCandidates = createRoleCandidateMap(placements, byCell, gridSize, 'road');
  const roadRing = createRockRoadRing(byCell, roadCandidates);
  const layered: EditorTilePlacement[] = [];

  for (const placement of placements) {
    const role = resolvePlacementRole(placement, byCell, gridSize);
    if (shouldAddUnderlay(placement, role)) {
      const underlaySource = findNearestVisualBase(visualBaseCandidates, placement);
      if (underlaySource) layered.push(createVisualUnderlay(underlaySource, placement));
    }

    layered.push(forceTransparentPlacement(placement));

    const key = toCellKeyFromPlacement(placement, gridSize);
    const overlay = roadRing.get(key);
    if (overlay && shouldInsertRoadOverlayAfter(placement)) layered.push(overlay.placement);
  }

  return layered;
}

function createRockRoadRing(
  byCell: Map<string, EditorTilePlacement>,
  roadCandidates: Map<EditorTerrainTileRole | 'all', EditorTilePlacement[]>,
): Map<string, RoadOverlay> {
  const result = new Map<string, RoadOverlay>();
  if ((roadCandidates.get('all') ?? []).length === 0) return result;

  const rockCells = new Set<string>();
  const centerRing = new Set<string>();
  const finishRing = new Set<string>();

  for (const [key, placement] of byCell.entries()) {
    if (placement.terrainMaterial === 'rock') rockCells.add(key);
  }

  for (const key of rockCells) {
    const rock = parseCellKey(key);
    forEachNeighbor8(rock.column, rock.row, (column, row) => {
      const neighborKey = `${column}:${row}`;
      const neighbor = byCell.get(neighborKey);
      if (!neighbor?.terrainMaterial) return;
      if (!ROAD_RING_TARGET_MATERIALS.has(neighbor.terrainMaterial)) return;
      centerRing.add(neighborKey);
    });
  }

  for (const key of centerRing) {
    const center = parseCellKey(key);
    forEachNeighbor8(center.column, center.row, (column, row) => {
      const neighborKey = `${column}:${row}`;
      if (rockCells.has(neighborKey) || centerRing.has(neighborKey)) return;
      const neighbor = byCell.get(neighborKey);
      if (!neighbor?.terrainMaterial) return;
      if (!ROAD_RING_TARGET_MATERIALS.has(neighbor.terrainMaterial)) return;
      finishRing.add(neighborKey);
    });
  }

  for (const key of centerRing) {
    const cell = parseCellKey(key);
    const target = byCell.get(key);
    if (!target) continue;
    const source = pickCandidateForRole(roadCandidates, 'center', cell.column, cell.row);
    if (!source) continue;
    result.set(key, { targetKey: key, placement: createVisualRoadOverlay(source, target) });
  }

  const insideMask = new Set<string>([...rockCells, ...centerRing]);
  for (const key of finishRing) {
    const cell = parseCellKey(key);
    const target = byCell.get(key);
    if (!target) continue;
    const role = resolveOutsideFinishRole(cell.column, cell.row, insideMask);
    const source = pickCandidateForRole(roadCandidates, role, cell.column, cell.row);
    if (!source) continue;
    result.set(key, { targetKey: key, placement: createVisualRoadOverlay(source, target) });
  }

  return result;
}

function resolveOutsideFinishRole(column: number, row: number, insideMask: Set<string>): EditorTerrainTileRole {
  const top = insideMask.has(`${column}:${row - 1}`);
  const bottom = insideMask.has(`${column}:${row + 1}`);
  const left = insideMask.has(`${column - 1}:${row}`);
  const right = insideMask.has(`${column + 1}:${row}`);
  const topLeft = insideMask.has(`${column - 1}:${row - 1}`);
  const topRight = insideMask.has(`${column + 1}:${row - 1}`);
  const bottomLeft = insideMask.has(`${column - 1}:${row + 1}`);
  const bottomRight = insideMask.has(`${column + 1}:${row + 1}`);

  if (top && left) return 'outerTopLeft';
  if (top && right) return 'outerTopRight';
  if (bottom && left) return 'outerBottomLeft';
  if (bottom && right) return 'outerBottomRight';
  if (top) return 'edgeTop';
  if (bottom) return 'edgeBottom';
  if (left) return 'edgeLeft';
  if (right) return 'edgeRight';
  if (topLeft) return 'outerTopLeft';
  if (topRight) return 'outerTopRight';
  if (bottomLeft) return 'outerBottomLeft';
  if (bottomRight) return 'outerBottomRight';
  return 'center';
}

function createTerrainCellMap(placements: EditorTilePlacement[], gridSize: number): Map<string, EditorTilePlacement> {
  const map = new Map<string, EditorTilePlacement>();
  for (const placement of placements) {
    if (placement.layer !== 'ground' || !placement.terrainMaterial) continue;
    map.set(toCellKeyFromPlacement(placement, gridSize), placement);
  }
  return map;
}

function createRoleCandidateMap(
  placements: DebugPlacement[],
  byCell: Map<string, EditorTilePlacement>,
  gridSize: number,
  material: EditorTerrainMaterial,
): Map<EditorTerrainTileRole | 'all', EditorTilePlacement[]> {
  const map = new Map<EditorTerrainTileRole | 'all', EditorTilePlacement[]>();
  for (const placement of placements) {
    if (placement.layer !== 'ground' || placement.terrainMaterial !== material || !placement.sourceRect) continue;
    const role = resolvePlacementRole(placement, byCell, gridSize) ?? 'center';
    pushCandidate(map, role, placement);
    pushCandidate(map, 'all', placement);
  }
  return map;
}

function pushCandidate(map: Map<EditorTerrainTileRole | 'all', EditorTilePlacement[]>, role: EditorTerrainTileRole | 'all', placement: EditorTilePlacement): void {
  const list = map.get(role) ?? [];
  list.push(placement);
  map.set(role, list);
}

function resolvePlacementRole(placement: DebugPlacement, byCell: Map<string, EditorTilePlacement>, gridSize: number): EditorTerrainTileRole | undefined {
  if (placement.layer !== 'ground' || !placement.terrainMaterial) return undefined;
  if (placement.terrainDebugRole) return placement.terrainDebugRole;
  const point = cellPointFromPlacement(placement, gridSize);
  const material = placement.terrainMaterial;
  return resolveRole(point.column, point.row, (column, row) => byCell.get(`${column}:${row}`)?.terrainMaterial === material);
}

function shouldAddUnderlay(placement: DebugPlacement, role: EditorTerrainTileRole | undefined): boolean {
  if (placement.layer !== 'ground') return false;
  if (!placement.terrainMaterial) return false;
  if (!role) return false;
  return OVERLAY_ROLES.has(role);
}

function shouldInsertRoadOverlayAfter(placement: EditorTilePlacement): boolean {
  if (placement.layer !== 'ground') return false;
  return Boolean(placement.terrainMaterial && ROAD_RING_TARGET_MATERIALS.has(placement.terrainMaterial));
}

function pickCandidateForRole(
  candidates: Map<EditorTerrainTileRole | 'all', EditorTilePlacement[]>,
  role: EditorTerrainTileRole,
  column: number,
  row: number,
): EditorTilePlacement | undefined {
  const list = candidates.get(role) ?? candidates.get('center') ?? candidates.get('all') ?? [];
  if (list.length === 0) return undefined;
  const index = Math.abs((column * 31 + row * 17) % list.length);
  return list[index];
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

function createVisualRoadOverlay(source: EditorTilePlacement, target: EditorTilePlacement): EditorTilePlacement {
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

function forceTransparentPlacement(placement: EditorTilePlacement): EditorTilePlacement {
  if (placement.layer !== 'ground') return placement;
  if (!placement.assetUrl || placement.assetUrl.startsWith('solid://')) return placement;
  return { ...placement, transparentBlack: true };
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

function forEachNeighbor8(column: number, row: number, callback: (column: number, row: number) => void): void {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      callback(column + dx, row + dy);
    }
  }
}

function toCellKeyFromPlacement(placement: EditorTilePlacement, gridSize: number): string {
  const point = cellPointFromPlacement(placement, gridSize);
  return `${point.column}:${point.row}`;
}

function cellPointFromPlacement(placement: EditorTilePlacement, gridSize: number): CellPoint {
  return { column: Math.round(placement.x / gridSize), row: Math.round(placement.y / gridSize) };
}

function parseCellKey(key: string): CellPoint {
  const [column, row] = key.split(':').map((value) => Number(value));
  return { column: Number.isFinite(column) ? column : 0, row: Number.isFinite(row) ? row : 0 };
}

function normalizeGridSize(value: number | undefined): number {
  return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.round(value as number));
}
