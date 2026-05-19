import { Container, Graphics } from "pixi.js";
import { gridToScreen, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from "./IsoBuildingMath";
import { BuildingModeState, type BuildingModeSnapshot } from "./BuildingModeState";

export type BuildingGridOverlayOptions = {
  buildingModeState: BuildingModeState;
  width: number;
  height: number;
};

export class BuildingGridOverlay {
  readonly container = new Container();

  private readonly graphics = new Graphics();
  private readonly width: number;
  private readonly height: number;
  private mode: BuildingModeSnapshot;
  private unsubscribe: (() => void) | null = null;

  constructor(options: BuildingGridOverlayOptions) {
    this.width = options.width;
    this.height = options.height;
    this.container.sortableChildren = true;
    this.container.addChild(this.graphics);
    this.container.zIndex = 50;

    this.mode = options.buildingModeState.getSnapshot();
    this.unsubscribe = options.buildingModeState.subscribe((snapshot) => {
      this.mode = snapshot;
      this.redraw();
    });

    this.redraw();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }

  private redraw(): void {
    this.graphics.clear();
    this.container.visible = this.mode.enabled;

    if (!this.mode.enabled) {
      return;
    }

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.drawDiamond(x, y, this.mode.currentZ);
      }
    }
  }

  private drawDiamond(x: number, y: number, z: number): void {
    const center = gridToScreen(x, y, z);
    const halfW = ISO_TILE_WIDTH / 2;
    const halfH = ISO_TILE_HEIGHT / 2;

    this.graphics
      .moveTo(center.x, center.y - halfH)
      .lineTo(center.x + halfW, center.y)
      .lineTo(center.x, center.y + halfH)
      .lineTo(center.x - halfW, center.y)
      .lineTo(center.x, center.y - halfH)
      .stroke({ width: 1, color: 0x7fe7ff, alpha: 0.22 });
  }
}
