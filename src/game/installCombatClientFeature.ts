import type { Application, Container } from 'pixi.js';
import type { ServerToClientMessage } from '../protocol/messages';
import type { GameNetwork } from '../net/network';
import type { InputController } from './InputController';
import type { InputSendSystem } from './systems/InputSendSystem';
import type { SnapshotSystem } from './systems/SnapshotSystem';
import { CombatInputSystem } from './systems/CombatInputSystem';
import { CombatEffectRenderer } from '../render/CombatEffectRenderer';
import { DeathOverlay } from './DeathOverlay';

type CombatFeatureHost = {
  app: Application;
  world: Container;
  input: InputController;
  network: GameNetwork;
  inputSendSystem: InputSendSystem;
  snapshotSystem: SnapshotSystem;
  myPlayerId: string | null;
};

/**
 * Client combat feature composition.
 *
 * The client owns only responsiveness: attack input edges, local preview slash effects,
 * floating combat feedback, and death overlay presentation. Damage, hit validation,
 * cooldowns, death, respawn, and rewards remain server-authoritative.
 */
export function installCombatClientFeature(game: unknown): void {
  const host = game as Partial<CombatFeatureHost>;
  if (!host.app || !host.world || !host.input || !host.network || !host.inputSendSystem || !host.snapshotSystem) {
    console.warn('[Combat] GameApp host is not compatible with combat client feature.');
    return;
  }

  const effects = new CombatEffectRenderer(host.world);
  const inputSystem = new CombatInputSystem(host.inputSendSystem, effects);
  const deathOverlay = new DeathOverlay();
  const getMyPlayerId = () => host.myPlayerId ?? null;

  host.app.ticker.add((ticker) => {
    const player = host.snapshotSystem?.findMe(getMyPlayerId()) ?? null;
    inputSystem.update({
      input: host.input!,
      player,
      monsters: host.snapshotSystem?.snapshot.monsters ?? [],
    });
    deathOverlay.update(player);
    effects.update(ticker.deltaMS / 1000);
  });

  host.network.onMessage((message) => routeCombatMessage(message, effects, getMyPlayerId));
}

function routeCombatMessage(
  message: ServerToClientMessage,
  effects: CombatEffectRenderer,
  getMyPlayerId: () => string | null,
): void {
  if (message.type === 'COMBAT_ATTACK_CONFIRMED') {
    if (message.attackerId !== getMyPlayerId()) {
      effects.showServerAttack({ x: message.x, y: message.y, facing: message.facing });
    }
    return;
  }

  if (message.type === 'COMBAT_HIT') {
    effects.showHit(message);
    return;
  }

  if (message.type === 'COMBAT_MISSED') {
    // Local attack previews already provide immediate feedback. A miss has no damage text,
    // so keep this intentionally quiet until a dedicated miss UI is added.
    return;
  }

  if (message.type === 'event' && message.event.type === 'combat_hit') {
    effects.showHit({
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
