import type { EditorTerrainTileRole, EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainOrganicBase } from './TerrainWorldPlanOrganicBase';

type DebugPlacement = EditorTilePlacement & {
  terrainDebugRole?: EditorTerrainTileRole;
  terrainDebugSourceRect?: string;
  terrainDebugAssetId?: string;
  terrainDebugAssetUrl?: string;
};

export async function generateWorldPlanTerrainDebug(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainOrganicBase(options);
  const gridSize = normalizeGridSize(options.gridSize);
  const byCell = new Map<string, EditorTilePlacement>();

  for (const placement of placements) {
    if (placement.layer !== 'ground' || !placement.terrainMaterial) continue;
    const column = Math.round(placement.x / gridSize);
    const row = Math.round(placement.y / gridSize);
    byCell.set(`${column}:${row}`, placement);
  }

  const result = placements.map((placement) => {
    if (placement.terrainMaterial !== 'rock') return placement;
    const column = Math.round(placement.x / gridSize);
    const row = Math.round(placement.y / gridSize);
    const debugRole = resolveRole(column, row, (x, y) => byCell.get(`${x}:${y}`)?.terrainMaterial === 'rock');
    const rect = placement.sourceRect;
    const debugPlacement: DebugPlacement = {
      ...placement,
      terrainDebugRole: debugRole,
      terrainDebugSourceRect: rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : 'none',
      terrainDebugAssetId: placement.assetId,
      terrainDebugAssetUrl: placement.assetUrl,
    };
    return debugPlacement;
  });

  logRockDebug(result as DebugPlacement[]);
  return result;
}

function logRockDebug(placements: DebugPlacement[]): void {
  const rock = placements.filter((placement) => placement.terrainMaterial === 'rock');
  if (rock.length === 0) return;

  const summary = new Map<string, { role: string; sourceRect: string; count: number; assetId: string }>();
  for (const placement of rock) {
    const role = placement.terrainDebugRole ?? 'unknown';
    const sourceRect = placement.terrainDebugSourceRect ?? 'none';
    const key = `${role}|${sourceRect}|${placement.assetId}`;
    const current = summary.get(key) ?? { role, sourceRect, count: 0, assetId: placement.assetId };
    current.count += 1;
    summary.set(key, current);
  }

  if (typeof console !== 'undefined') {
    console.groupCollapsed(`[Terrain Debug] rock placements: ${rock.length}`);
    console.table([...summary.values()].sort((a, b) => b.count - a.count));
    console.groupEnd();
  }
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
