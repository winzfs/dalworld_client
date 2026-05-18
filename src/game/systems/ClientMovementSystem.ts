import { getMonsterConfig } from '../../assets/monsters';
import type {
  MonsterSnapshot,
  MovementKeys,
  PlayerSnapshot,
  PublicGameplayConfig,
  WorldInfo,
} from '../../protocol/messages';
import { getCollisionPlacements } from '../../worldMap/runtimeMapStore';

export type ClientMovementContext = {
  player: PlayerSnapshot | null;
  keys: MovementKeys;
  facing: PlayerSnapshot['facing'];
  monsters: MonsterSnapshot[];
  world: WorldInfo;
  gameplay: PublicGameplayConfig;
};

type MoveDelta = { x: number; y: number };
type CollisionCircle = { x: number; y: number; radius: number };

/**
 * Client-side movement owns immediate-feel movement and lightweight collision.
 * The server still receives the resulting position and may validate or correct it.
 */
export class ClientMovementSystem {
  update(context: ClientMovementContext, dt: number): boolean {
    const player = context.player;
    if (!player) return false;

    const direction = getMoveDirection(context.keys);
    if (!direction) return false;

    const radius = context.gameplay.playerRadius;
    const speed = context.gameplay.playerSpeed;
    let delta: MoveDelta = {
      x: direction.x * speed * dt,
      y: direction.y * speed * dt,
    };

    delta = resolveMonsterSlideDelta(
      player.x,
      player.y,
      delta,
      radius,
      context.monsters,
    );

    const nextX = clamp(player.x + delta.x, radius, context.world.width - radius);
    const nextY = clamp(player.y + delta.y, radius, context.world.height - radius);

    if (canPlayerMoveFromTo(player.x, player.y, nextX, nextY, radius, context.monsters)) {
      player.x = nextX;
      player.y = nextY;
    } else {
      const axisX = clamp(player.x + delta.x, radius, context.world.width - radius);
      if (canPlayerMoveFromTo(player.x, player.y, axisX, player.y, radius, context.monsters)) {
        player.x = axisX;
      }

      const axisY = clamp(player.y + delta.y, radius, context.world.height - radius);
      if (canPlayerMoveFromTo(player.x, player.y, player.x, axisY, radius, context.monsters)) {
        player.y = axisY;
      }
    }

    player.facing = context.facing;
    return true;
  }
}

function getMoveDirection(keys: MovementKeys): { x: number; y: number } | null {
  let x = 0;
  let y = 0;

  if (keys.left) x -= 1;
  if (keys.right) x += 1;
  if (keys.up) y -= 1;
  if (keys.down) y += 1;

  if (x === 0 && y === 0) return null;

  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function resolveMonsterSlideDelta(
  currentX: number,
  currentY: number,
  delta: MoveDelta,
  playerRadius: number,
  monsters: MonsterSnapshot[],
): MoveDelta {
  let resolved = delta;

  for (const monster of monsters) {
    const circle = getMonsterCollisionCircle(monster);
    const minDistance = playerRadius + circle.radius;
    const nextX = currentX + resolved.x;
    const nextY = currentY + resolved.y;
    const nextDistanceSq = squaredDistance(nextX, nextY, circle.x, circle.y);

    if (nextDistanceSq >= minDistance * minDistance) continue;

    const normalX = currentX - circle.x;
    const normalY = currentY - circle.y;
    const normalLength = Math.hypot(normalX, normalY);

    if (normalLength <= 0.0001) continue;

    const nx = normalX / normalLength;
    const ny = normalY / normalLength;
    const intoObstacle = resolved.x * -nx + resolved.y * -ny;

    if (intoObstacle <= 0) continue;

    resolved = {
      x: resolved.x + nx * intoObstacle,
      y: resolved.y + ny * intoObstacle,
    };
  }

  return resolved;
}

function canPlayerMoveFromTo(
  currentX: number,
  currentY: number,
  nextX: number,
  nextY: number,
  playerRadius: number,
  monsters: MonsterSnapshot[],
): boolean {
  for (const placement of getCollisionPlacements()) {
    const width = placement.sourceRect?.width ?? 32;
    const height = placement.sourceRect?.height ?? 32;

    if (
      nextX + playerRadius > placement.x &&
      nextX - playerRadius < placement.x + width &&
      nextY + playerRadius > placement.y &&
      nextY - playerRadius < placement.y + height
    ) {
      return false;
    }
  }

  for (const monster of monsters) {
    const circle = getMonsterCollisionCircle(monster);
    const minDistance = playerRadius + circle.radius;
    const minDistanceSq = minDistance * minDistance;
    const currentDistanceSq = squaredDistance(currentX, currentY, circle.x, circle.y);
    const nextDistanceSq = squaredDistance(nextX, nextY, circle.x, circle.y);

    if (nextDistanceSq >= minDistanceSq) continue;

    if (currentDistanceSq < minDistanceSq && nextDistanceSq > currentDistanceSq) continue;

    return false;
  }

  return true;
}

function getMonsterCollisionCircle(monster: MonsterSnapshot): CollisionCircle {
  const collision = getMonsterConfig(monster.type).collision;
  return {
    x: monster.x + collision.offsetX,
    y: monster.y + collision.offsetY,
    radius: collision.radius,
  };
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
