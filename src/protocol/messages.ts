// 서버 src/protocol/messages.ts 와 동일한 프로토콜.
// 모노레포 의존을 피하기 위해 클라이언트 측에 복사해 둔다.

import type { GameWorldMap } from '../worldMap/types';

export type MovementKeys = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type Facing = 'up' | 'down' | 'left' | 'right';

export type ResourceType = 'tree' | 'stone';
export type MonsterType = 'wild_slime' | 'sheep';
export type MonsterStateName = 'idle' | 'chase' | 'attack';
export type ItemType = 'wood' | 'stone';

export type Inventory = {
  wood: number;
  stone: number;
};

export type PlayerSnapshot = {
  id: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  facing: Facing;
  lastInputSeq: number;
  inventory: Inventory;
};

export type ResourceSnapshot = {
  id: string;
  type: ResourceType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 0 if alive, otherwise epoch ms when it will respawn */
  respawnAt: number;
  /** true when the resource is harvestable (hp > 0 and not waiting to respawn) */
  alive: boolean;
};

export type MonsterSnapshot = {
  id: string;
  type: MonsterType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: MonsterStateName;
  targetPlayerId: string | null;
};

export type WorldInfo = {
  width: number;
  height: number;
  tickRate: number;
};

export type PublicGameplayConfig = {
  playerRadius: number;
  playerSpeed: number;
  gatherRange: number;
};

export type PublicGameConfig = {
  world: WorldInfo;
  gameplay: PublicGameplayConfig;
};

export type ClientToServerMessage =
  | { type: 'hello'; name?: string }
  | {
      type: 'input';
      seq: number;
      keys: MovementKeys;
      facing?: Facing;
      clientX?: number;
      clientY?: number;
      cellX?: number;
      cellY?: number;
    }
  | {
      type: 'gather';
      seq: number;
      /** Preferred target; server picks nearest in range when omitted or invalid. */
      resourceId?: string;
    }
  | { type: 'ping'; now: number };

export type ServerEvent =
  | { type: 'player_joined'; playerId: string }
  | { type: 'player_left'; playerId: string }
  | { type: 'resource_hit'; resourceId: string; resourceType: ResourceType; hpRemaining: number }
  | { type: 'resource_destroyed'; resourceId: string; resourceType: ResourceType }
  | { type: 'item_gained'; playerId: string; item: ItemType; amount: number };

export type ServerToClientMessage =
  | {
      type: 'welcome';
      playerId: string;
      world: WorldInfo;
      /** New servers send this. Optional keeps older deployed Worker builds compatible. */
      gameplay?: PublicGameplayConfig;
      /** Editor-authored runtime map. Optional keeps older deployed Worker builds compatible. */
      map?: GameWorldMap | null;
      serverTime: number;
    }
  | {
      type: 'snapshot';
      tick: number;
      serverTime: number;
      players: PlayerSnapshot[];
      resources: ResourceSnapshot[];
      monsters: MonsterSnapshot[];
    }
  | { type: 'event'; serverTime: number; event: ServerEvent }
  | { type: 'pong'; now: number };
