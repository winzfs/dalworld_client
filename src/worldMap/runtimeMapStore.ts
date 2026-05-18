import type { GameWorldMap, WorldMapPlacement } from './types';
import { getActiveCell, getCell } from './activeCellStore';

let currentMap: GameWorldMap | null = null;

export function setRuntimeWorldMap(map: GameWorldMap | null | undefined): void {
  currentMap = map ?? null;
}

export function getRuntimeWorldMap(): GameWorldMap | null {
  return currentMap;
}

export function getCollisionPlacements(): WorldMapPlacement[] {
  if (!currentMap) return [];

  const active = getActiveCell();
  const cell = getCell(currentMap, active.gridX, active.gridY);
  if (!cell) return [];

  return cell.placements.filter((placement) => placement.layer === 'collision');
}
