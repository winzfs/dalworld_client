export type WorldMapLayerId = 'ground' | 'object' | 'collision';

export type WorldMapSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldMapPlacement = {
  id: string;
  assetId: string;
  assetUrl: string;
  categoryId: string;
  x: number;
  y: number;
  layer: WorldMapLayerId;
  scale: number;
  sourceRect?: WorldMapSourceRect;
  solidColor?: number;
  transparentBlack?: boolean;
};

export type WorldMapCell = {
  gridX: number;
  gridY: number;
  placements: WorldMapPlacement[];
};

export type GameWorldMap = {
  version: 1;
  name: string;
  tileSize: number;
  cellSize: number;
  cells: WorldMapCell[];
};
