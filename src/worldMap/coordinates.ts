export type CellCoord = {
  cellX: number;
  cellY: number;
};

export type LocalPosition = {
  x: number;
  y: number;
};

export type WorldPosition = {
  worldX: number;
  worldY: number;
};

export type CellLocalPosition = CellCoord & LocalPosition;

export function getCellId(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

export function parseCellId(id: string): CellCoord | null {
  const [rawX, rawY] = id.split(':');
  const cellX = Number(rawX);
  const cellY = Number(rawY);

  if (!Number.isInteger(cellX) || !Number.isInteger(cellY)) {
    return null;
  }

  return { cellX, cellY };
}

export function toWorldPosition(position: CellLocalPosition, cellSize: number): WorldPosition {
  return {
    worldX: position.cellX * cellSize + position.x,
    worldY: position.cellY * cellSize + position.y,
  };
}

export function toCellLocalPosition(position: WorldPosition, cellSize: number): CellLocalPosition {
  const cellX = Math.floor(position.worldX / cellSize);
  const cellY = Math.floor(position.worldY / cellSize);

  return {
    cellX,
    cellY,
    x: position.worldX - cellX * cellSize,
    y: position.worldY - cellY * cellSize,
  };
}

export function clampLocalPosition(position: LocalPosition, cellSize: number): LocalPosition {
  return {
    x: clamp(position.x, 0, cellSize),
    y: clamp(position.y, 0, cellSize),
  };
}

export function normalizeCellCoord(cellX: number | undefined, cellY: number | undefined): CellCoord {
  return {
    cellX: Number.isFinite(cellX) ? Math.trunc(cellX as number) : 0,
    cellY: Number.isFinite(cellY) ? Math.trunc(cellY as number) : 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
