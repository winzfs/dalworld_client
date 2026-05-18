import type { PlayerSnapshot, WorldInfo } from '../../protocol/messages';
import type { PlayerRenderer } from '../../render/PlayerRenderer';
import { getActiveCell, hasCell, setActiveCell } from '../../worldMap/activeCellStore';
import { getRuntimeWorldMap } from '../../worldMap/runtimeMapStore';
import type { CellTransitionSystem } from './CellTransitionSystem';
import type { SnapshotSystem } from './SnapshotSystem';
import type { CameraSystem } from './CameraSystem';

export type RuntimeCellTransitionControllerContext = {
  cellTransitionSystem: CellTransitionSystem;
  snapshotSystem: SnapshotSystem;
  playerRenderer: PlayerRenderer;
  cameraSystem: CameraSystem;
  getMyPlayerId: () => string | null;
  getWorldInfo: () => WorldInfo;
  getScreenSize: () => { width: number; height: number };
  loadWorldMap: () => Promise<void>;
};

export type RuntimeCellTransitionControllerResult = {
  transitioned: boolean;
};

export class RuntimeCellTransitionController {
  private transitioning = false;

  constructor(private readonly context: RuntimeCellTransitionControllerContext) {}

  get isTransitioning(): boolean {
    return this.transitioning;
  }

  tryStart(player: PlayerSnapshot | null): RuntimeCellTransitionControllerResult {
    const map = getRuntimeWorldMap();
    if (!map || !player || this.transitioning) {
      return { transitioned: false };
    }

    const active = getActiveCell();
    const transition = this.context.cellTransitionSystem.resolve({
      map,
      player,
      activeCell: active,
      hasCell: (gridX, gridY) => hasCell(map, gridX, gridY),
    });

    if (!transition.changed) {
      return { transitioned: false };
    }

    console.info('[RuntimeCellTransitionController] Cell transition', {
      active,
      target: { gridX: transition.nextGridX, gridY: transition.nextGridY },
      player: { x: player.x, y: player.y },
      spawn: { x: transition.nextX, y: transition.nextY },
      availableCells: map.cells.map((cell) => `${cell.gridX}:${cell.gridY}`),
    });

    this.transitioning = true;
    setActiveCell(transition.nextGridX, transition.nextGridY);

    const transitionedPlayer: PlayerSnapshot = {
      ...player,
      x: transition.nextX,
      y: transition.nextY,
      cellX: transition.nextGridX,
      cellY: transition.nextGridY,
    };

    this.context.snapshotSystem.setLocalPlayer(transitionedPlayer);

    void this.context.loadWorldMap()
      .then(() => {
        this.context.playerRenderer.sync(
          this.context.snapshotSystem.snapshot.players,
          this.context.getMyPlayerId(),
        );

        const screen = this.context.getScreenSize();
        this.context.cameraSystem.update({
          player: transitionedPlayer,
          world: this.context.getWorldInfo(),
          screenWidth: screen.width,
          screenHeight: screen.height,
        });
      })
      .finally(() => {
        this.transitioning = false;
      });

    return { transitioned: true };
  }
}
