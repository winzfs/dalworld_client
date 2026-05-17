import type { Container } from 'pixi.js';

/**
 * Camera centers a world container on a target world-position.
 * Clamps to world bounds so empty space is not shown when near edges.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private worldWidth = 3000;
  private worldHeight = 3000;

  constructor(private readonly world: Container) {}

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  follow(targetX: number, targetY: number, screenWidth: number, screenHeight: number): void {
    const halfW = screenWidth / 2 / this.zoom;
    const halfH = screenHeight / 2 / this.zoom;
    this.x = Math.max(halfW, Math.min(this.worldWidth - halfW, targetX));
    this.y = Math.max(halfH, Math.min(this.worldHeight - halfH, targetY));
    this.apply(screenWidth, screenHeight);
  }

  apply(screenWidth: number, screenHeight: number): void {
    this.world.scale.set(this.zoom);
    this.world.position.set(
      screenWidth / 2 - this.x * this.zoom,
      screenHeight / 2 - this.y * this.zoom,
    );
  }
}
