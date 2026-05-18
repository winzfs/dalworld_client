import type {
  MonsterSnapshot,
  PlayerSnapshot,
  ResourceSnapshot,
} from '../../protocol/messages';
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
 * For now, local movement is client-led, so the local player's predicted x/y is preserved.
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
    this.state = {
      ...this.state,
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

    if (!this.state.localPlayer) {
      return { ...serverMe };
    }

    return {
      ...serverMe,
      x: this.state.localPlayer.x,
      y: this.state.localPlayer.y,
      facing: input.facing,
    };
  }
}
