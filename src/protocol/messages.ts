// 서버 src/protocol/messages.ts 와 동일한 프로토콜.
// 모노레포 의존을 피하기 위해 클라이언트 측에 복사해 둔다.

import type { BuildingClientMessage, BuildingServerEvent } from '../systems/building/BuildingTypes';
import type { CraftingRecipeId } from '../systems/crafting/CraftingTypes';
import type { InventoryItemStack, InventorySnapshot } from '../systems/inventory/InventoryTypes';
import type { TimeOfDayState } from '../systems/timeOfDay/TimeOfDayTypes';
import type { GameWorldMap, WorldMapSourceRect } from '../worldMap/types';

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
  inventoryItems?: InventoryItemStack[];
};

export type ResourceSnapshot = {
  id: string;
  type: ResourceType;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  assetUrl?: string;
  assetScale?: number;
  displayWidth?: number;
  displayHeight?: number;
  sourceRect?: WorldMapSourceRect;
  hp: number;
  maxHp: number;
  respawnAt: number;
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

export type CraftingClientMessage = {
  type: 'CRAFT_REQUEST';
  requestId: string;
  recipeId: CraftingRecipeId;
};

export type TimeOfDayToggleRequest = {
  type: 'TIME_OF_DAY_TOGGLE_REQUEST';
  requestId: string;
};

export type CraftingCompletedEvent = {
  type: 'CRAFT_COMPLETED';
  requestId: string;
  recipeId: CraftingRecipeId;
  inventory: InventorySnapshot;
};

export type CraftingRejectedEvent = {
  type: 'CRAFT_REJECTED';
  requestId: string;
  reason: string;
};

export type CraftingServerEvent = CraftingCompletedEvent | CraftingRejectedEvent;

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
      resourceId?: string;
    }
  | { type: 'ping'; now: number }
  | BuildingClientMessage
  | CraftingClientMessage
  | TimeOfDayToggleRequest;

export type ServerEvent =
  | { type: 'player_joined'; playerId: string }
  | { type: 'player_left'; playerId: string }
  | { type: 'resource_hit'; resourceId: string; resourceType: ResourceType; hpRemaining: number }
  | { type: 'resource_destroyed'; resourceId: string; resourceType: ResourceType }
  | { type: 'item_gained'; playerId: string; item: ItemType; amount: number };

export type ServerToClientMessage =
  | {
      type: 'welcome';
      protocolVersion?: number;
      playerId: string;
      world: WorldInfo;
      gameplay?: PublicGameplayConfig;
      map?: GameWorldMap | null;
      timeOfDay?: TimeOfDayState;
      serverTime: number;
    }
  | {
      type: 'snapshot';
      tick: number;
      serverTime: number;
      players: PlayerSnapshot[];
      resources: ResourceSnapshot[];
      monsters: MonsterSnapshot[];
      timeOfDay?: TimeOfDayState;
    }
  | { type: 'event'; serverTime: number; event: ServerEvent }
  | { type: 'pong'; now: number }
  | BuildingServerEvent
  | CraftingServerEvent;
