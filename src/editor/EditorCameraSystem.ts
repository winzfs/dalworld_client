import type { Camera } from '../game/Camera';
import type { InputState } from '../game/InputController';
import type { WorldInfo } from '../protocol/messages';

export type EditorCameraSystemContext = {
  input: InputState;
  world: WorldInfo;
  screenWidth: number;
  screenHeight: number;
  dt: number;
};

const EDITOR_CAMERA_SPEED = 520;

/**
 * Moves the map camera directly in editor mode using the same keyboard/joystick input as player movement.
 */
export class EditorCameraSystem {
  private x: number | null = null;
  private y: number | null = null;

  constructor(private readonly camera: Camera) {}

  setWorldSize(world: WorldInfo): void {
    this.camera.setWorldSize(world.width, world.height);
    this.x ??= world.width / 2;
    this.y ??= world.height / 2;
  }

  update(context: EditorCameraSystemContext): void {
    this.x ??= context.world.width / 2;
    this.y ??= context.world.height / 2;

    const keys = context.input.keys;
    let dx = 0;
    let dy = 0;

    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy) || 1;
      this.x += (dx / length) * EDITOR_CAMERA_SPEED * context.dt;
      this.y += (dy / length) * EDITOR_CAMERA_SPEED * context.dt;
    }

    this.camera.follow(this.x, this.y, context.screenWidth, context.screenHeight);
  }
}
