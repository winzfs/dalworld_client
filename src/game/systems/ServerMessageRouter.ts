import type { ResourceSnapshot, ServerToClientMessage, WorldInfo, PublicGameplayConfig } from '../../protocol/messages';
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
  redrawWorld: () => void;
  reloadWorldMap: () => void;
  onBuildingEvent?: (event: BuildingServerEvent) => void;
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

  private handleEvent(_message: Extract<ServerToClientMessage, { type: 'event' }>): void {
    // Gameplay events will be dispatched here as systems are added.
  }
}

function filterActiveCellResources(resources: ResourceSnapshot[]): ResourceSnapshot[] {
  const active = getActiveCell();
  return resources.filter((resource) => (
    resource.cellX === active.gridX &&
    resource.cellY === active.gridY
  ));
}
