export type WorldMapLayerId = 'ground' | 'object' | 'collision';

export type WorldMapResourceType = 'tree' | 'stone';
export type WorldMapMonsterType = 'wild_slime' | 'sheep';

export type WorldMapItemCategory =
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

export type WorldMapItemFieldValue = string | number | boolean;

export type WorldMapItemOverride = {
  id: string;
  label?: string;
  description?: string;
  icon?: string;
  category?: WorldMapItemCategory;
  stackable?: boolean;
  maxStack?: number;
  fields?: Record<string, WorldMapItemFieldValue>;
};

export type WorldMapMonsterSpecOverrides = {
  maxHp?: number;
  moveSpeed?: number;
  detectRange?: number;
  loseRange?: number;
  attackRange?: number;
  attackDamage?: number;
  attackCooldownMs?: number;
};

export type WorldMapMonsterSpawnRule = {
  id: string;
  enabled: boolean;
  monsterType: WorldMapMonsterType;
  scope: 'world' | 'region';
  maxAlive: number;
  spawnsPerMinute: number;
  /** @deprecated older maps may still provide this. */
  spawnsPerHour?: number;
  spec?: WorldMapMonsterSpecOverrides;
};

export type WorldMapPlacementGameplay =
  | {
      kind: 'resource';
      resourceType: WorldMapResourceType;
      blocksMovement?: boolean;
      maxHp?: number;
      respawnMs?: number;
    }
  | {
      kind: 'monsterSpawn';
      monsterType: WorldMapMonsterType;
      spawnRadius: number;
      maxAlive: number;
      respawnMs: number;
      spawnsPerMinute?: number;
      /** @deprecated older maps may still provide this. */
      spawnsPerHour?: number;
      spec?: WorldMapMonsterSpecOverrides;
    };

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
  displayWidth?: number;
  displayHeight?: number;
  sourceRect?: WorldMapSourceRect;
  solidColor?: number;
  transparentBlack?: boolean;
  gameplay?: WorldMapPlacementGameplay;
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
  monsterSpawnRules?: WorldMapMonsterSpawnRule[];
  itemOverrides?: WorldMapItemOverride[];
};
