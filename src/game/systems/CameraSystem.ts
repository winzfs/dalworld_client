import type { PlayerSnapshot, WorldInfo } from '../../protocol/messages';
import type { Camera } from '../Camera';

export type CameraSystemContext = {
  player: PlayerSnapshot | null;
  world: WorldInfo;
  screenWidth: number;
  screenHeight: number;
};

/**
 * Owns camera targeting policy.
 * Follows the local player when present; otherwise centers on the world.
 */
export class CameraSystem {
  constructor(private readonly camera: Camera) {}

  setWorldSize(world: WorldInfo): void {
    this.camera.setWorldSize(world.width, world.height);
  }

  update(context: CameraSystemContext): void {
    const targetX = context.player?.x ?? context.world.width / 2;
    const targetY = context.player?.y ?? context.world.height / 2;

    this.camera.follow(targetX, targetY, context.screenWidth, context.screenHeight);
  }
}
