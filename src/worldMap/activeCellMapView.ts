import { getActiveCell, getCell } from './activeCellStore';
import type { GameWorldMap } from './types';

export function createActiveCellMapView(map: GameWorldMap | null | undefined): GameWorldMap | null {
  if (!map) return null;

  const active = getActiveCell();
  const cell = getCell(map, active.gridX, active.gridY);
  if (!cell) return null;

  return {
    ...map,
    cells: [
      {
        ...cell,
        gridX: 0,
        gridY: 0,
      },
    ],
  };
}
