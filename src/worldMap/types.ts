export type WorldMapLayerId = 'ground' | 'object' | 'collision';

export type WorldMapResourceType = 'tree' | 'stone';
export type WorldMapMonsterType = 'wild_slime' | 'sheep';

export type WorldMapMonsterSpecOverrides = {
  maxHp?: number;
  moveSpeed?: number;
  detectRange?: number;
  loseRange?: number;
  attackRange?: number;
  attackDamage?: number;
  attackCooldownMs?: number;
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
};
