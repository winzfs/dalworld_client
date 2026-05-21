import type { GameWorldMap, WorldMapPlacement } from './types';
import { getActiveCell, getCell } from './activeCellStore';
import { setRuntimeItemOverrides } from '../systems/inventory/ItemRuntimeOverrides';

let currentMap: GameWorldMap | null = null;

export function setRuntimeWorldMap(map: GameWorldMap | null | undefined): void {
  currentMap = map ?? null;
  setRuntimeItemOverrides(currentMap?.itemOverrides);
  window.dispatchEvent(new CustomEvent('dalworld:item-overrides-updated'));
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
