/**
 * Small helper that interpolates a remote entity's rendered position toward
 * the latest authoritative server position. Avoids jittery rendering when
 * snapshots arrive at 20Hz.
 */
export class Interpolator2D {
  private currentX: number;
  private currentY: number;
  private targetX: number;
  private targetY: number;
  /** higher = faster snap toward target */
  private readonly speed: number;

  constructor(x: number, y: number, speed = 12) {
    this.currentX = x;
    this.currentY = y;
    this.targetX = x;
    this.targetY = y;
    this.speed = speed;
  }

  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  snapTo(x: number, y: number): void {
    this.currentX = x;
    this.currentY = y;
    this.targetX = x;
    this.targetY = y;
  }

  update(dt: number): { x: number; y: number } {
    const t = 1 - Math.exp(-this.speed * dt);
    this.currentX += (this.targetX - this.currentX) * t;
    this.currentY += (this.targetY - this.currentY) * t;
    return { x: this.currentX, y: this.currentY };
  }
}
