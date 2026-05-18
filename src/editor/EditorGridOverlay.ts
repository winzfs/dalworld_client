import { Container, Graphics } from 'pixi.js';
import { EditorState } from './EditorState';

export type EditorGridOverlayOptions = {
  width: number;
  height: number;
};

export class EditorGridOverlay {
  readonly layer = new Container();

  private readonly graphics = new Graphics();
  private width: number;
  private height: number;

  constructor(
    private readonly state: EditorState,
    options: EditorGridOverlayOptions,
  ) {
    this.width = options.width;
    this.height = options.height;
    this.layer.label = 'editor-grid-overlay-layer';
    this.layer.zIndex = 0;
    this.layer.addChild(this.graphics);
    this.state.subscribe(() => this.render());
    this.render();
  }

  setWorldSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.render();
  }

  render(): void {
    this.graphics.clear();
    this.layer.visible = this.state.gridVisible;

    if (!this.state.gridVisible) return;

    const gridSize = this.state.gridSize;
    const majorSize = gridSize * 4;

    for (let x = 0; x <= this.width; x += gridSize) {
      const major = x % majorSize === 0;
      this.graphics
        .moveTo(x, 0)
        .lineTo(x, this.height)
        .stroke({
          color: major ? 0xffd166 : 0xffffff,
          alpha: major ? 0.22 : 0.08,
          width: major ? 1 : 1,
        });
    }

    for (let y = 0; y <= this.height; y += gridSize) {
      const major = y % majorSize === 0;
      this.graphics
        .moveTo(0, y)
        .lineTo(this.width, y)
        .stroke({
          color: major ? 0xffd166 : 0xffffff,
          alpha: major ? 0.22 : 0.08,
          width: major ? 1 : 1,
        });
    }
  }
}
