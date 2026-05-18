import type {
  MonsterSnapshot,
  PlayerSnapshot,
  ResourceSnapshot,
} from '../../protocol/messages';
import { getActiveCell } from '../../worldMap/activeCellStore';
import type { InputState } from '../InputController';

export type SnapshotSystemState = {
  tick: number;
  players: PlayerSnapshot[];
  resources: ResourceSnapshot[];
  monsters: MonsterSnapshot[];
  localPlayer: PlayerSnapshot | null;
};

export type ApplySnapshotContext = {
  myPlayerId: string | null;
  input: InputState;
  players: PlayerSnapshot[];
  resources: ResourceSnapshot[];
  monsters: MonsterSnapshot[];
  tick: number;
};

/**
 * Owns server snapshot ingestion and local-player prediction reconciliation.
 * The local player keeps client-predicted cell-local position and active cell while the server validates it.
 */
export class SnapshotSystem {
  private state: SnapshotSystemState = {
    tick: 0,
    players: [],
    resources: [],
    monsters: [],
    localPlayer: null,
  };

  get snapshot(): SnapshotSystemState {
    return this.state;
  }

  setLocalPlayer(player: PlayerSnapshot | null): void {
    const players = player
      ? upsertPlayer(this.state.players, player)
      : this.state.players;

    this.state = {
      ...this.state,
      players,
      localPlayer: player,
    };
  }

  apply(context: ApplySnapshotContext): SnapshotSystemState {
    const localPlayer = this.mergeLocalPlayer(
      context.myPlayerId,
      context.players,
      context.input,
    );

    this.state = {
      tick: context.tick,
      players: context.players.map((player) => (
        player.id === context.myPlayerId && localPlayer ? localPlayer : player
      )),
      resources: context.resources,
      monsters: context.monsters,
      localPlayer,
    };

    return this.state;
  }

  findMe(myPlayerId: string | null): PlayerSnapshot | null {
    if (!myPlayerId) return null;

    for (const player of this.state.players) {
      if (player.id === myPlayerId) return player;
    }

    return null;
  }

  private mergeLocalPlayer(
    myPlayerId: string | null,
    serverPlayers: PlayerSnapshot[],
    input: InputState,
  ): PlayerSnapshot | null {
    if (!myPlayerId) return null;

    const serverMe = serverPlayers.find((player) => player.id === myPlayerId) ?? null;
    if (!serverMe) return this.state.localPlayer;

    const activeCell = getActiveCell();

    if (!this.state.localPlayer) {
      return {
        ...serverMe,
        cellX: activeCell.gridX,
        cellY: activeCell.gridY,
      };
    }

    return {
      ...serverMe,
      x: this.state.localPlayer.x,
      y: this.state.localPlayer.y,
      cellX: activeCell.gridX,
      cellY: activeCell.gridY,
      facing: input.facing,
    };
  }
}

function upsertPlayer(players: PlayerSnapshot[], player: PlayerSnapshot): PlayerSnapshot[] {
  let replaced = false;
  const next = players.map((item) => {
    if (item.id !== player.id) return item;
    replaced = true;
    return player;
  });

  if (!replaced) {
    next.push(player);
  }

  return next;
}
