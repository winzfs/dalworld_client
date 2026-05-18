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

export type EditorCameraEdgeTransition = {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  targetX: number;
  targetY: number;
};

const EDITOR_CAMERA_SPEED = 980;
const EDGE_TRANSFER_PADDING = 96;

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

  update(context: EditorCameraSystemContext): EditorCameraEdgeTransition | null {
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

    const transition = dx !== 0 || dy !== 0
      ? this.moveAndDetectEdge(dx, dy, context.dt)
      : null;

    this.clampToVisibleBounds();
    this.camera.follow(this.x, this.y, context.screenWidth, context.screenHeight);
    return transition;
  }

  private moveAndDetectEdge(dx: number, dy: number, dt: number): EditorCameraEdgeTransition | null {
    if (!this.world || this.x === null || this.y === null) return null;

    const length = Math.hypot(dx, dy) || 1;
    const nextX = this.x + (dx / length) * EDITOR_CAMERA_SPEED * dt;
    const nextY = this.y + (dy / length) * EDITOR_CAMERA_SPEED * dt;
    const bounds = this.getVisibleBounds();

    let edgeX: -1 | 0 | 1 = 0;
    let edgeY: -1 | 0 | 1 = 0;
    let targetX = nextX;
    let targetY = nextY;

    if (nextX <= bounds.minX && dx < 0) {
      edgeX = -1;
      targetX = bounds.maxX - EDGE_TRANSFER_PADDING;
    } else if (nextX >= bounds.maxX && dx > 0) {
      edgeX = 1;
      targetX = bounds.minX + EDGE_TRANSFER_PADDING;
    }

    if (nextY <= bounds.minY && dy < 0) {
      edgeY = -1;
      targetY = bounds.maxY - EDGE_TRANSFER_PADDING;
    } else if (nextY >= bounds.maxY && dy > 0) {
      edgeY = 1;
      targetY = bounds.minY + EDGE_TRANSFER_PADDING;
    }

    this.x = nextX;
    this.y = nextY;

    if (edgeX === 0 && edgeY === 0) return null;

    return {
      dx: edgeX,
      dy: edgeY,
      targetX,
      targetY,
    };
  }

  private clampToVisibleBounds(): void {
    if (!this.world || this.x === null || this.y === null) return;

    const bounds = this.getVisibleBounds();
    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x));
    this.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.y));
  }

  private getVisibleBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const world = this.world ?? { width: 1, height: 1 };
    const halfW = this.screenWidth / 2 / this.camera.zoom;
    const halfH = this.screenHeight / 2 / this.camera.zoom;

    return {
      minX: Math.min(halfW, world.width / 2),
      maxX: Math.max(world.width - halfW, world.width / 2),
      minY: Math.min(halfH, world.height / 2),
      maxY: Math.max(world.height - halfH, world.height / 2),
    };
  }
}
