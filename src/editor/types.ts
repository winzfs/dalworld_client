export type EditorLayerId = 'ground' | 'object' | 'collision';

export type EditorResourceType = 'tree' | 'stone';
export type EditorMonsterType = 'wild_slime' | 'sheep';

export type EditorItemCategory =
  | 'resource'
  | 'consumable'
  | 'equipment'
  | 'weapon'
  | 'tool'
  | 'crafting_material'
  | 'crafting_station'
  | 'building_part'
  | 'capture'
  | 'pet';

export type EditorItemFieldValue = string | number | boolean;

export type EditorItemOverride = {
  id: string;
  label?: string;
  description?: string;
  icon?: string;
  category?: EditorItemCategory;
  stackable?: boolean;
  maxStack?: number;
  fields?: Record<string, EditorItemFieldValue>;
};

export type EditorMonsterSpecOverrides = {
  maxHp?: number;
  moveSpeed?: number;
  detectRange?: number;
  loseRange?: number;
  attackRange?: number;
  attackDamage?: number;
  attackCooldownMs?: number;
};

export type EditorMonsterSpawnRuleScope = 'world' | 'region';

export type EditorMonsterSpawnRule = {
  id: string;
  enabled: boolean;
  monsterType: EditorMonsterType;
  scope: EditorMonsterSpawnRuleScope;
  maxAlive: number;
  spawnsPerMinute: number;
  /** @deprecated kept only for older local/server map saves. New saves use spawnsPerMinute. */
  spawnsPerHour?: number;
  spec?: EditorMonsterSpecOverrides;
};

export type EditorPlacementGameplay =
  | {
      kind: 'resource';
      resourceType: EditorResourceType;
      blocksMovement?: boolean;
      maxHp?: number;
      respawnMs?: number;
    }
  | {
      kind: 'monsterSpawn';
      monsterType: EditorMonsterType;
      spawnRadius: number;
      maxAlive: number;
      respawnMs: number;
      spawnsPerMinute?: number;
      /** @deprecated kept only for older map saves. */
      spawnsPerHour?: number;
      spec?: EditorMonsterSpecOverrides;
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

export type EditorTerrainTileRole =
  | 'center'
  | 'edgeTop'
  | 'edgeBottom'
  | 'edgeLeft'
  | 'edgeRight'
  | 'outerTopLeft'
  | 'outerTopRight'
  | 'outerBottomLeft'
  | 'outerBottomRight'
  | 'innerTopLeft'
  | 'innerTopRight'
  | 'innerBottomLeft'
  | 'innerBottomRight'
  | 'decorative';

export type EditorTerrainMaterial =
  | 'grass'
  | 'water'
  | 'road'
  | 'sand'
  | 'dirt'
  | 'rock';

export type EditorTerrainMovementMode =
  | 'passable'
  | 'blocked'
  | 'shallow'
  | 'swim'
  | 'boatOnly';

export type EditorTerrainTilesetMaterial = {
  tilesetId: string;
  tilesetUrl: string;
  material: EditorTerrainMaterial;
  movementMode?: EditorTerrainMovementMode;
  blocksMovement?: boolean;
};

export type EditorTerrainTileRule = {
  id: string;
  tilesetId: string;
  tilesetName: string;
  tilesetUrl: string;
  tileSize: number;
  role: EditorTerrainTileRole;
  sourceRect: EditorSourceRect;
  weight?: number;
  scale?: number;
  material?: EditorTerrainMaterial;
  movementMode?: EditorTerrainMovementMode;
  blocksMovement?: boolean;
};

export type EditorTerrainRuleSet = {
  version: 1;
  rules: EditorTerrainTileRule[];
  tilesets?: EditorTerrainTilesetMaterial[];
  updatedAt: number;
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
  /** Display width before scale. Captured so server can derive center interaction points. */
  displayWidth?: number;
  /** Display height before scale. Captured so server can derive center interaction points. */
  displayHeight?: number;
  /** Optional source rectangle used when placing one tile cut from a larger tileset image. */
  sourceRect?: EditorSourceRect;
  /** Optional solid fill color. When present, renderer does not load an external texture. */
  solidColor?: number;
  /** If true, near-black pixels are rendered transparent for this placement. */
  transparentBlack?: boolean;
  /** Gameplay metadata inferred from the sprite path or assigned by editor tools. */
  gameplay?: EditorPlacementGameplay;
  /** Terrain material marker used by server-authoritative movement and gameplay rules. */
  terrainMaterial?: EditorTerrainMaterial;
  /** Movement marker for terrain. Server decides final movement validity from this mode. */
  terrainMovementMode?: EditorTerrainMovementMode;
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
  monsterSpawnRules?: EditorMonsterSpawnRule[];
  itemOverrides?: EditorItemOverride[];
  terrainRuleSet?: EditorTerrainRuleSet;
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
