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
const ROCK_BORDER_TARGET_MATERIALS = new Set<EditorTerrainMaterial>(['grass', 'dirt', 'sand']);

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

  if (visualBaseCandidates.length === 0) return forceTransparentTerrain(placements);

  const roadCandidates = createRoleCandidateMap(placements, byCell, gridSize, 'road');
  const rockRoadBorders = createRockRoadBorders(byCell, roadCandidates);
  const layered: EditorTilePlacement[] = [];

  for (const placement of placements) {
    const role = resolvePlacementRole(placement, byCell, gridSize);
    if (shouldAddUnderlay(placement, role)) {
      const underlaySource = findNearestVisualBase(visualBaseCandidates, placement);
      if (underlaySource) layered.push(createVisualUnderlay(underlaySource, placement));
    }

    layered.push(forceTransparentPlacement(placement));

    const column = Math.round(placement.x / gridSize);
    const row = Math.round(placement.y / gridSize);
    const border = rockRoadBorders.get(`${column}:${row}`);
    if (border && shouldInsertBorderAfterPlacement(placement)) layered.push(border);
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
    const roleList = map.get(role) ?? [];
    roleList.push(placement);
    map.set(role, roleList);
    const allList = map.get('all') ?? [];
    allList.push(placement);
    map.set('all', allList);
  }
  return map;
}

function createRockRoadBorders(
  byCell: Map<string, EditorTilePlacement>,
  roadCandidates: Map<EditorTerrainTileRole | 'all', EditorTilePlacement[]>,
): Map<string, EditorTilePlacement> {
  const borders = new Map<string, EditorTilePlacement>();
  if ((roadCandidates.get('all') ?? []).length === 0) return borders;

  const borderCells = new Set<string>();
  for (const [key, placement] of byCell.entries()) {
    if (placement.terrainMaterial !== 'rock') continue;
    const rock = parseCellKey(key);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const column = rock.column + dx;
        const row = rock.row + dy;
        const neighborKey = `${column}:${row}`;
        const neighbor = byCell.get(neighborKey);
        if (!neighbor?.terrainMaterial) continue;
        if (!ROCK_BORDER_TARGET_MATERIALS.has(neighbor.terrainMaterial)) continue;
        borderCells.add(neighborKey);
      }
    }
  }

  for (const key of borderCells) {
    const cell = parseCellKey(key);
    const target = byCell.get(key);
    if (!target) continue;
    const role = resolveBorderRoleFromRock(cell.column, cell.row, byCell);
    const source = pickCandidateForRole(roadCandidates, role, cell.column, cell.row);
    if (!source) continue;
    borders.set(key, createVisualRoadBorder(source, target));
  }

  return borders;
}

function resolveBorderRoleFromRock(column: number, row: number, byCell: Map<string, EditorTilePlacement>): EditorTerrainTileRole {
  const rockTop = isRock(byCell, column, row - 1);
  const rockBottom = isRock(byCell, column, row + 1);
  const rockLeft = isRock(byCell, column - 1, row);
  const rockRight = isRock(byCell, column + 1, row);
  const rockTopLeft = isRock(byCell, column - 1, row - 1);
  const rockTopRight = isRock(byCell, column + 1, row - 1);
  const rockBottomLeft = isRock(byCell, column - 1, row + 1);
  const rockBottomRight = isRock(byCell, column + 1, row + 1);

  if (rockTop && rockLeft) return 'outerTopLeft';
  if (rockTop && rockRight) return 'outerTopRight';
  if (rockBottom && rockLeft) return 'outerBottomLeft';
  if (rockBottom && rockRight) return 'outerBottomRight';
  if (rockTop) return 'edgeTop';
  if (rockBottom) return 'edgeBottom';
  if (rockLeft) return 'edgeLeft';
  if (rockRight) return 'edgeRight';
  if (rockTopLeft) return 'outerTopLeft';
  if (rockTopRight) return 'outerTopRight';
  if (rockBottomLeft) return 'outerBottomLeft';
  if (rockBottomRight) return 'outerBottomRight';
  return 'center';
}

function isRock(byCell: Map<string, EditorTilePlacement>, column: number, row: number): boolean {
  return byCell.get(`${column}:${row}`)?.terrainMaterial === 'rock';
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
  if (!role) return false;
  return OVERLAY_ROLES.has(role);
}

function shouldInsertBorderAfterPlacement(placement: EditorTilePlacement): boolean {
  if (placement.layer !== 'ground') return false;
  return Boolean(placement.terrainMaterial && ROCK_BORDER_TARGET_MATERIALS.has(placement.terrainMaterial));
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

function parseCellKey(key: string): { column: number; row: number } {
  const [column, row] = key.split(':').map((value) => Number(value));
  return { column: Number.isFinite(column) ? column : 0, row: Number.isFinite(row) ? row : 0 };
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

function createVisualRoadBorder(source: EditorTilePlacement, target: EditorTilePlacement): EditorTilePlacement {
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

function forceTransparentTerrain(placements: EditorTilePlacement[]): EditorTilePlacement[] {
  return placements.map(forceTransparentPlacement);
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

function normalizeGridSize(value: number | undefined): number {
  return !Number.isFinite(value) || (value as number) <= 0 ? 32 : Math.max(1, Math.round(value as number));
}
