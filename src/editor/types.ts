export type EditorLayerId = 'ground' | 'object' | 'collision';

export type EditorResourceType = 'tree' | 'stone';

export type EditorPlacementGameplay =
  | {
      kind: 'resource';
      resourceType: EditorResourceType;
      blocksMovement?: boolean;
      maxHp?: number;
      respawnMs?: number;
    };

export type EditorTilesetAsset = {
  id: string;
  name: string;
  categoryId: string;
  url: string;
  /** Optional explicit placement width. Uses texture width when omitted. */
  tileWidth?: number;
  /** Optional explicit placement height. Uses texture height when omitted. */
  tileHeight?: number;
  /** Optional solid fill color used for editor-generated paint tiles. */
  solidColor?: number;
  /** Optional default gameplay metadata applied when this sprite is placed. */
  gameplayDefaults?: EditorPlacementGameplay;
};

export type EditorTilesetCategory = {
  id: string;
  name: string;
  assets: EditorTilesetAsset[];
};

export type EditorSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorBrush = {
  asset: EditorTilesetAsset;
  sourceRect?: EditorSourceRect;
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
  /** Optional source rectangle used when placing one tile cut from a larger tileset image. */
  sourceRect?: EditorSourceRect;
  /** Optional solid fill color. When present, renderer does not load an external texture. */
  solidColor?: number;
  /** If true, near-black pixels are rendered transparent for this placement. */
  transparentBlack?: boolean;
  /** Gameplay metadata inferred from the sprite path or assigned by editor tools. */
  gameplay?: EditorPlacementGameplay;
};

export type EditorMapCoord = {
  gridX: number;
  gridY: number;
};

export type EditorMapCell = EditorMapCoord & {
  id: string;
  name: string;
};

export type EditorWorldMapDraft = {
  version: 1;
  cellSize: number;
  current: EditorMapCoord;
  cells: EditorMapCell[];
};

export type EditorMapDraft = {
  version: 1;
  name: string;
  tileSize: number;
  worldMap?: EditorWorldMapDraft;
  placements: EditorTilePlacement[];
};

export type EditorWorldCellDraft = EditorMapCoord & {
  draft: EditorMapDraft;
};

export type EditorWorldSave = {
  version: 1;
  name: string;
  tileSize: number;
  worldMap: EditorWorldMapDraft;
  cells: EditorWorldCellDraft[];
};

export type EditorToolMode = 'paint' | 'erase' | 'picker';
