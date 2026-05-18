export type EditorLayerId = 'ground' | 'object' | 'collision';

export type EditorTilesetAsset = {
  id: string;
  name: string;
  categoryId: string;
  url: string;
  width?: number;
  height?: number;
  tileWidth: number;
  tileHeight: number;
};

export type EditorTilesetCategory = {
  id: string;
  name: string;
  assets: EditorTilesetAsset[];
};

export type EditorTilePlacement = {
  id: string;
  assetId: string;
  assetUrl: string;
  categoryId: string;
  x: number;
  y: number;
  layer: EditorLayerId;
};

export type EditorMapDraft = {
  version: 1;
  name: string;
  tileSize: number;
  placements: EditorTilePlacement[];
};

export type EditorToolMode = 'paint' | 'erase';
