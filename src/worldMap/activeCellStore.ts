import type { GameWorldMap, WorldMapCell } from './types';

type ActiveCell = {
  gridX: number;
  gridY: number;
};

let activeCell: ActiveCell = { gridX: 0, gridY: 0 };

export function getActiveCell(): ActiveCell {
  return { ...activeCell };
}

export function setActiveCell(gridX: number, gridY: number): void {
  activeCell = { gridX, gridY };
}

export function getCell(map: GameWorldMap | null | undefined, gridX: number, gridY: number): WorldMapCell | null {
  if (!map) return null;
  return map.cells.find((cell) => cell.gridX === gridX && cell.gridY === gridY) ?? null;
}

export function hasCell(map: GameWorldMap | null | undefined, gridX: number, gridY: number): boolean {
  return getCell(map, gridX, gridY) !== null;
}
