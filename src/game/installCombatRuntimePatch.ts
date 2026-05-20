import type { Application, Container } from 'pixi.js';
import type { ServerToClientMessage } from '../protocol/messages';
import type { GameNetwork } from '../net/network';
import type { InputController } from './InputController';
import type { InputSendSystem } from './systems/InputSendSystem';
import type { SnapshotSystem } from './systems/SnapshotSystem';
import { CombatInputSystem } from './systems/CombatInputSystem';
import { CombatEffectRenderer } from '../render/CombatEffectRenderer';
import { DeathOverlay } from './DeathOverlay';

type CombatPatchTarget = {
  app: Application;
  world: Container;
  input: InputController;
  network: GameNetwork;
  inputSendSystem: InputSendSystem;
  snapshotSystem: SnapshotSystem;
  myPlayerId: string | null;
};

/**
 * Installs combat without adding more responsibilities to GameApp.ts.
 * Client-side attack feedback is immediate; server messages remain authoritative.
 */
export function installCombatRuntimePatch(game: unknown): void {
  const target = game as Partial<CombatPatchTarget>;
  if (!target.app || !target.world || !target.input || !target.network || !target.inputSendSystem || !target.snapshotSystem) {
    console.warn('[Combat] GameApp shape is not compatible with combat runtime patch.');
    return;
  }

  const effects = new CombatEffectRenderer(target.world);
  const inputSystem = new CombatInputSystem(target.inputSendSystem, effects);
  const deathOverlay = new DeathOverlay();
  const getMyPlayerId = () => target.myPlayerId ?? null;

  target.app.ticker.add((ticker) => {
    const snapshot = target.snapshotSystem?.snapshot;
    const player = target.snapshotSystem?.findMe(getMyPlayerId()) ?? null;
    inputSystem.update({
      input: target.input!,
      player,
      monsters: snapshot?.monsters ?? [],
    });
    deathOverlay.update(player);
    effects.update(ticker.deltaMS / 1000);
  });

  target.network.onMessage((message) => routeCombatMessage(message, effects, getMyPlayerId));
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
