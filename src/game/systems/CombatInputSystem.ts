import type { MonsterSnapshot, PlayerSnapshot } from '../../protocol/messages';
import type { InputController } from '../InputController';
import type { InputSendSystem } from './InputSendSystem';
import type { CombatEffectRenderer } from '../../render/CombatEffectRenderer';

export type CombatInputSystemContext = {
  input: InputController;
  player: PlayerSnapshot | null;
  monsters: MonsterSnapshot[];
};

const CLIENT_ATTACK_COOLDOWN_MS = 260;
const TARGET_RANGE = 104;

export class CombatInputSystem {
  private nextLocalAttackAt = 0;

  constructor(
    private readonly sender: InputSendSystem,
    private readonly effects: CombatEffectRenderer,
  ) {}

  update(context: CombatInputSystemContext): void {
    if (!context.input.consumeAttack()) return;
    const player = context.player;
    if (!player) return;

    const now = performance.now();
    if (now < this.nextLocalAttackAt) return;
    this.nextLocalAttackAt = now + CLIENT_ATTACK_COOLDOWN_MS;

    const requestId = crypto.randomUUID();
    const target = findLikelyTarget(player, context.monsters);

    this.effects.showLocalAttack({ x: player.x, y: player.y, facing: player.facing });
    this.sender.sendAttack({ requestId, facing: player.facing, targetId: target?.id });
  }
}

function findLikelyTarget(player: PlayerSnapshot, monsters: MonsterSnapshot[]): MonsterSnapshot | null {
  let best: MonsterSnapshot | null = null;
  let bestDistance = TARGET_RANGE;

  for (const monster of monsters) {
    if (monster.hp <= 0) continue;
    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > bestDistance) continue;
    if (!isInFront(player.facing, dx, dy)) continue;
    best = monster;
    bestDistance = d;
  }

  return best;
}

function isInFront(facing: PlayerSnapshot['facing'], dx: number, dy: number): boolean {
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return true;

  const nx = dx / length;
  const ny = dy / length;

  switch (facing) {
    case 'up': return -ny >= -0.2;
    case 'down': return ny >= -0.2;
    case 'left': return -nx >= -0.2;
    case 'right': return nx >= -0.2;
  }
}
