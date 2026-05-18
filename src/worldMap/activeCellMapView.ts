import { getActiveCell, getCell, setActiveCell } from './activeCellStore';
import type { GameWorldMap } from './types';

export function createActiveCellMapView(map: GameWorldMap | null | undefined): GameWorldMap | null {
  if (!map) return null;

  const active = getActiveCell();
  const activeCell = getCell(map, active.gridX, active.gridY);
  const cell = activeCell ?? getCell(map, 0, 0) ?? map.cells[0] ?? null;
  if (!cell) return null;

  if (!activeCell) {
    setActiveCell(cell.gridX, cell.gridY);
    console.warn('[WorldMap] Active cell was missing. Falling back to:', `${cell.gridX}:${cell.gridY}`);
  }

  return {
    ...map,
    cells: [
      {
        ...cell,
        gridX: 0,
        gridY: 0,
        placements: cell.placements.map((placement) => ({ ...placement })),
      },
    ],
  };
}
