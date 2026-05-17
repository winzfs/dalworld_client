import type { Container } from 'pixi.js';

/**
 * Camera centers a world container on a target world-position.
 * The container itself is pan/zoomed in screen-space; entities use world coordinates.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  constructor(private readonly world: Container) {}

  follow(targetX: number, targetY: number, screenWidth: number, screenHeight: number): void {
    this.x = targetX;
    this.y = targetY;
    this.apply(screenWidth, screenHeight);
  }

  apply(screenWidth: number, screenHeight: number): void {
    this.world.scale.set(this.zoom);
    this.world.position.set(screenWidth / 2 - this.x * this.zoom, screenHeight / 2 - this.y * this.zoom);
  }
}
