import type {
  ResourceSnapshot,
  ServerToClientMessage,
  WorldInfo,
  PublicGameplayConfig,
  CraftingServerEvent,
  CombatServerEvent,
  CombatHitEvent,
  ServerEvent,
} from '../../protocol/messages';
import type { TimeOfDayState } from '../../systems/timeOfDay/TimeOfDayTypes';
import type { BuildingServerEvent } from '../../systems/building/BuildingTypes';
import { PROTOCOL_VERSION } from '../../protocol/version';
import type { InputState } from '../InputController';
import type { SnapshotSystem } from './SnapshotSystem';
import type { CameraSystem } from './CameraSystem';
import type { PlayerRenderer } from '../../render/PlayerRenderer';
import type { ResourceRenderer } from '../../render/ResourceRenderer';
import type { MonsterRenderer } from '../../render/MonsterRenderer';
import { getActiveCell } from '../../worldMap/activeCellStore';
import { fetchRuntimeWorldMap } from '../../worldMap/fetchRuntimeWorldMap';
import { setRuntimeWorldMap } from '../../worldMap/runtimeMapStore';
import { emitSystemLog } from '../../ui/SystemLogHud';

export type ServerMessageRouterContext = {
  input: InputState;
  snapshotSystem: SnapshotSystem;
  cameraSystem: CameraSystem;
  playerRenderer: PlayerRenderer;
  resourceRenderer: ResourceRenderer;
  monsterRenderer: MonsterRenderer;
  getMyPlayerId: () => string | null;
  setMyPlayerId: (playerId: string) => void;
  setWorldInfo: (world: WorldInfo) => void;
  setGameplayConfig: (gameplay: PublicGameplayConfig | undefined) => void;
  setTimeOfDay?: (state: TimeOfDayState | undefined) => void;
  redrawWorld: () => void;
  reloadWorldMap: () => void;
  onBuildingEvent?: (event: BuildingServerEvent) => void;
  onCraftingEvent?: (event: CraftingServerEvent) => void;
  onCombatEvent?: (event: CombatServerEvent | CombatHitEvent) => void;
};

/** Routes server messages to client systems. */
export class ServerMessageRouter {
  constructor(private readonly context: ServerMessageRouterContext) {}

  handle(message: ServerToClientMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        return;
      case 'snapshot':
        this.handleSnapshot(message);
        return;
      case 'event':
        this.handleEvent(message);
        return;
      case 'BUILD_PLACED':
      case 'BUILD_UPDATED':
      case 'BUILD_REMOVED':
      case 'BUILD_REJECTED':
      case 'BUILD_SNAPSHOT':
      case 'BUILD_DOOR_UPDATED':
      case 'INVENTORY_SNAPSHOT':
        this.context.onBuildingEvent?.(message);
        return;
      case 'CRAFT_STARTED':
        emitSystemLog({ message: '제작 시작', kind: 'info' });
        this.context.onCraftingEvent?.(message);
        return;
      case 'CRAFT_COMPLETED':
        emitSystemLog({ message: '제작 완료', kind: 'success' });
        this.context.onCraftingEvent?.(message);
        return;
      case 'CRAFT_REJECTED':
        emitSystemLog({ message: `제작 실패: ${message.reason}`, kind: 'warning' });
        this.context.onCraftingEvent?.(message);
        return;
      case 'COMBAT_ATTACK_CONFIRMED':
      case 'COMBAT_HIT':
      case 'COMBAT_MISSED':
      case 'COMBAT_REJECTED':
        this.context.onCombatEvent?.(message);
        return;
      case 'MONSTER_KILLED':
        emitSystemLog({ message: `${formatMonsterName(message.monsterType)} 처치`, kind: 'success' });
        this.context.onCombatEvent?.(message);
        return;
      case 'COMBAT_REWARD_GRANTED':
        emitSystemLog({ message: `${formatItemName(message.itemId)} +${message.amount}`, kind: 'success' });
        this.context.onCombatEvent?.(message);
        return;
      case 'PLAYER_EXPERIENCE_GAINED':
        emitSystemLog({ message: `EXP +${message.amount}`, kind: 'success' });
        this.context.onCombatEvent?.(message);
        return;
      case 'PLAYER_LEVEL_UP':
        emitSystemLog({ message: `레벨 업! Lv.${message.level}`, kind: 'success' });
        this.context.onCombatEvent?.(message);
        return;
      case 'pong':
        return;
    }
  }

  private handleWelcome(message: Extract<ServerToClientMessage, { type: 'welcome' }>): void {
    if (message.protocolVersion !== undefined && message.protocolVersion !== PROTOCOL_VERSION) {
      console.warn('[Protocol] Client/server protocol version mismatch.', {
        client: PROTOCOL_VERSION,
        server: message.protocolVersion,
      });
    }

    this.context.setMyPlayerId(message.playerId);
    this.context.setWorldInfo(message.world);
    this.context.setGameplayConfig(message.gameplay);
    this.context.setTimeOfDay?.(message.timeOfDay);
    setRuntimeWorldMap(message.map);
    this.context.cameraSystem.setWorldSize(message.world);
    this.context.redrawWorld();
    this.context.reloadWorldMap();

    void this.refreshRuntimeWorldMapFromHttp();
  }

  private async refreshRuntimeWorldMapFromHttp(): Promise<void> {
    try {
      const map = await fetchRuntimeWorldMap();
      setRuntimeWorldMap(map);
      this.context.reloadWorldMap();
      console.info('[WorldMap] Refreshed runtime world map from HTTP.', {
        cells: map?.cells.map((cell) => `${cell.gridX}:${cell.gridY}`) ?? [],
      });
    } catch (error) {
      console.warn('[WorldMap] Failed to refresh runtime world map from HTTP.', error);
    }
  }

  private handleSnapshot(message: Extract<ServerToClientMessage, { type: 'snapshot' }>): void {
    this.context.setTimeOfDay?.(message.timeOfDay);

    const snapshot = this.context.snapshotSystem.apply({
      myPlayerId: this.context.getMyPlayerId(),
      input: this.context.input,
      players: message.players,
      resources: message.resources,
      monsters: message.monsters,
      tick: message.tick,
    });

    this.context.playerRenderer.sync(snapshot.players, this.context.getMyPlayerId());
    this.context.resourceRenderer.sync(filterActiveCellResources(snapshot.resources));
    this.context.monsterRenderer.sync(snapshot.monsters);
  }

  private handleEvent(message: Extract<ServerToClientMessage, { type: 'event' }>): void {
    const log = formatServerEventLog(message.event);
    if (log) emitSystemLog(log);

    if (message.event.type === 'combat_hit') {
      this.context.onCombatEvent?.({
        type: 'COMBAT_HIT',
        requestId: message.event.requestId,
        attackerId: message.event.attackerId,
        targetId: message.event.targetId,
        targetType: message.event.targetType,
        damage: message.event.damage,
        hpRemaining: message.event.hpRemaining,
        maxHp: message.event.maxHp,
        x: message.event.x,
        y: message.event.y,
      });
    }
  }
}

function filterActiveCellResources(resources: ResourceSnapshot[]): ResourceSnapshot[] {
  const active = getActiveCell();
  return resources.filter((resource) => (
    resource.cellX === active.gridX &&
    resource.cellY === active.gridY
  ));
}

function formatServerEventLog(event: ServerEvent): { message: string; kind?: 'info' | 'success' | 'warning' } | null {
  switch (event.type) {
    case 'item_gained':
      return { message: `${formatItemName(event.item)} +${event.amount}`, kind: 'success' };
    case 'resource_destroyed':
      return { message: `${formatResourceName(event.resourceType)} 채집 완료`, kind: 'success' };
    default:
      return null;
  }
}

function formatMonsterName(type: string): string {
  switch (type) {
    case 'wild_slime':
      return '와일드 슬라임';
    case 'sheep':
      return '양';
    default:
      return type;
  }
}

function formatResourceName(type: string): string {
  switch (type) {
    case 'tree':
      return '나무';
    case 'stone':
      return '돌';
    default:
      return type;
  }
}

function formatItemName(type: string): string {
  switch (type) {
    case 'wood':
      return '나무';
    case 'stone':
      return '돌';
    default:
      return type;
  }
}
