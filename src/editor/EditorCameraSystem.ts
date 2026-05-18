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

export type EditorCameraView = {
  x: number;
  y: number;
  zoom: number;
};

const EDITOR_CAMERA_SPEED = 980;

/**
 * Moves the map camera directly in editor mode using the same keyboard/joystick input as player movement.
 */
export class EditorCameraSystem {
  private x: number | null = null;
  private y: number | null = null;
  private world: WorldInfo | null = null;
  private screenWidth = 1;
  private screenHeight = 1;

  constructor(private readonly camera: Camera) {}

  setWorldSize(world: WorldInfo): void {
    this.world = world;
    this.camera.setWorldSize(world.width, world.height);
    this.x ??= world.width / 2;
    this.y ??= world.height / 2;
    this.clampToVisibleBounds();
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clampToVisibleBounds();
  }

  getView(): EditorCameraView {
    return {
      x: this.x ?? this.world?.width ?? 0,
      y: this.y ?? this.world?.height ?? 0,
      zoom: this.camera.zoom,
    };
  }

  update(context: EditorCameraSystemContext): void {
    this.world = context.world;
    this.screenWidth = context.screenWidth;
    this.screenHeight = context.screenHeight;
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
      this.clampToVisibleBounds();
    }

    this.camera.follow(this.x, this.y, context.screenWidth, context.screenHeight);
  }

  private clampToVisibleBounds(): void {
    if (!this.world || this.x === null || this.y === null) return;

    const halfW = this.screenWidth / 2 / this.camera.zoom;
    const halfH = this.screenHeight / 2 / this.camera.zoom;
    const minX = Math.min(halfW, this.world.width / 2);
    const maxX = Math.max(this.world.width - halfW, this.world.width / 2);
    const minY = Math.min(halfH, this.world.height / 2);
    const maxY = Math.max(this.world.height - halfH, this.world.height / 2);

    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Math.max(minY, Math.min(maxY, this.y));
  }
}
