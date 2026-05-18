import type { PlayerSnapshot } from '../../protocol/messages';
import type { GameWorldMap } from '../../worldMap/types';

export type ActiveCellCoord = {
  gridX: number;
  gridY: number;
};

export type CellTransitionConfig = {
  triggerPadding: number;
  spawnPadding: number;
};

export type CellTransitionContext = {
  map: GameWorldMap;
  player: PlayerSnapshot;
  activeCell: ActiveCellCoord;
  hasCell: (gridX: number, gridY: number) => boolean;
};

export type CellTransitionResult =
  | { changed: false }
  | {
      changed: true;
      nextGridX: number;
      nextGridY: number;
      nextX: number;
      nextY: number;
    };

export class CellTransitionSystem {
  constructor(private readonly config: CellTransitionConfig) {}

  resolve(context: CellTransitionContext): CellTransitionResult {
    const { map, player, activeCell } = context;
    let nextGridX = activeCell.gridX;
    let nextGridY = activeCell.gridY;
    let nextX = player.x;
    let nextY = player.y;

    if (player.x >= map.cellSize - this.config.triggerPadding) {
      nextGridX += 1;
      nextX = this.config.spawnPadding;
    } else if (player.x <= this.config.triggerPadding) {
      nextGridX -= 1;
      nextX = map.cellSize - this.config.spawnPadding;
    }

    if (player.y >= map.cellSize - this.config.triggerPadding) {
      nextGridY += 1;
      nextY = this.config.spawnPadding;
    } else if (player.y <= this.config.triggerPadding) {
      nextGridY -= 1;
      nextY = map.cellSize - this.config.spawnPadding;
    }

    if (nextGridX === activeCell.gridX && nextGridY === activeCell.gridY) {
      return { changed: false };
    }

    if (!context.hasCell(nextGridX, nextGridY)) {
      return { changed: false };
    }

    return {
      changed: true,
      nextGridX,
      nextGridY,
      nextX,
      nextY,
    };
  }
}
