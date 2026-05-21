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
  private lastInventorySignature = '';
  private lastBuildingModeSignature = '';

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

    const inventorySignature = createInventorySignature(context.player);
    if (inventorySignature !== this.lastInventorySignature) {
      this.lastInventorySignature = inventorySignature;
      this.windows.renderInventory(context.player ?? null);
    }

    if (context.buildingMode) {
      const buildingModeSignature = createBuildingModeSignature(context.buildingMode);
      if (buildingModeSignature !== this.lastBuildingModeSignature) {
        this.lastBuildingModeSignature = buildingModeSignature;
        this.windows.renderBuildingMode(context.buildingMode);
      }
    }
  }
}

function createInventorySignature(player: PlayerSnapshot | null): string {
  if (!player) return 'none';

  const items = player.inventoryItems
    ?.map((item) => `${item.itemId}:${item.quantity}`)
    .sort()
    .join('|') ?? `wood:${player.inventory.wood}|stone:${player.inventory.stone}`;

  return [
    player.id,
    player.characterName ?? '',
    player.level ?? 1,
    player.exp ?? 0,
    player.expToNextLevel ?? 0,
    Math.ceil(player.hp),
    player.maxHp,
    Math.ceil(player.stamina),
    player.maxStamina,
    player.alive ? 1 : 0,
    player.respawnAt,
    player.facing,
    player.cellX,
    player.cellY,
    Math.round(player.x),
    Math.round(player.y),
    items,
  ].join('::');
}

function createBuildingModeSignature(mode: BuildingModeSnapshot): string {
  return [
    mode.enabled ? 1 : 0,
    mode.toolMode,
    mode.selectedPartId ?? '',
    mode.rotation,
    mode.currentZ,
  ].join('::');
}
