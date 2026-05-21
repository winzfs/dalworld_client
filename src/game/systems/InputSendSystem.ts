import type { GameNetwork } from '../../net/network';
import { getActiveCell } from '../../worldMap/activeCellStore';
import type { Facing, PlayerSnapshot } from '../../protocol/messages';
import type { InputState } from '../InputController';

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
    if (!resourceId) return;

    this.network.send({
      type: 'gather',
      seq: this.nextSeq(),
      resourceId,
    });
  }

  sendAttack(input: { requestId: string; facing: Facing; targetId?: string }): void {
    this.network.send({
      type: 'COMBAT_ATTACK_REQUEST',
      requestId: input.requestId,
      seq: this.nextSeq(),
      facing: input.facing,
      targetId: input.targetId,
    });
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}
