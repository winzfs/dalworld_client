import type { NetworkStatus } from '../../net/network';
import type { PlayerSnapshot } from '../../protocol/messages';
import type { BuildingModeSnapshot } from '../../systems/building/BuildingModeState';
import type { GameHud } from '../../ui/GameHud';
import type { GameWindows } from '../../ui/GameWindows';

export type HudSystemContext = {
  status: NetworkStatus;
  tick: number;
  player: PlayerSnapshot | null;
  latencyMs: number;
  buildingMode?: BuildingModeSnapshot;
};

/**
 * Owns frame-level UI rendering for HUD and game windows.
 * Gameplay state is still provided from SnapshotSystem/GameApp, so UI remains read-only.
 */
export class HudSystem {
  constructor(
    private readonly hud: GameHud,
    private readonly windows: GameWindows,
  ) {}

  update(context: HudSystemContext): void {
    this.hud.render({
      status: context.status,
      tick: context.tick,
      player: context.player,
      latencyMs: context.latencyMs,
    });

    this.windows.renderInventory(context.player?.inventory ?? null);

    if (context.buildingMode) {
      this.windows.renderBuildingMode(context.buildingMode);
    }
  }
}
