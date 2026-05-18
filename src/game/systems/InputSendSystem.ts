import type { GameNetwork } from '../../net/network';
import { getActiveCell } from '../../worldMap/activeCellStore';
import type { InputState } from '../InputController';
import type { PlayerSnapshot } from '../../protocol/messages';

export type InputSendContext = {
  input: InputState;
  player: PlayerSnapshot | null;
};

/**
 * Sends movement inputs at a fixed cadence.
 * Position fields are kept because this project intentionally lets the client own responsive movement,
 * while the server can clamp/validate/correct the resulting position.
 */
export class InputSendSystem {
  private accumulator = 0;
  private seq = 0;

  constructor(
    private readonly network: GameNetwork,
    private readonly sendHz: number,
  ) {}

  update(context: InputSendContext, dt: number): void {
    this.accumulator += dt;

    if (this.accumulator < 1 / this.sendHz) {
      return;
    }

    this.accumulator = 0;
    const player = context.player;
    const activeCell = getActiveCell();

    this.network.send({
      type: 'input',
      seq: this.nextSeq(),
      keys: { ...context.input.keys },
      facing: context.input.facing,
      clientX: player?.x,
      clientY: player?.y,
      cellX: activeCell.gridX,
      cellY: activeCell.gridY,
    });
  }

  sendGather(resourceId: string | undefined): void {
    this.network.send({
      type: 'gather',
      seq: this.nextSeq(),
      resourceId,
    });
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}
