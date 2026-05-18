export type EditorLayerId = 'ground' | 'object' | 'collision';

export type EditorTilesetAsset = {
  id: string;
  name: string;
  categoryId: string;
  url: string;
  /** Optional explicit placement width. Uses texture width when omitted. */
  tileWidth?: number;
  /** Optional explicit placement height. Uses texture height when omitted. */
  tileHeight?: number;
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
  /** Scale captured when this object was placed. Existing placements do not change when brush scale changes. */
  scale: number;
};

export type EditorMapDraft = {
  version: 1;
  name: string;
  tileSize: number;
  placements: EditorTilePlacement[];
};

export type EditorToolMode = 'paint' | 'erase';
