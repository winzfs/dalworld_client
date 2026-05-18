import type { Application, Container } from 'pixi.js';
import { EditorState } from './EditorState';
import { TilesetPanel } from './TilesetPanel';
import { TilePlacementSystem } from './TilePlacementSystem';

export type MapEditorOptions = {
  app: Application;
  world: Container;
  uiRoot?: HTMLElement;
  tileSize?: number;
  mapName?: string;
};

/**
 * High-level editor orchestration.
 * Keeps editor UI, state and placement wiring out of GameApp.
 */
export class MapEditor {
  readonly state = new EditorState();
  readonly placement: TilePlacementSystem;

  private readonly panel: TilesetPanel;
  private readonly uiRoot: HTMLElement;
  private enabled = false;

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (!this.enabled) return;
    if (event.button !== 0) return;
    if (isEditorUiTarget(event.target)) return;

    const worldPoint = this.screenToWorld(event.clientX, event.clientY);
    void this.placement.placeAt(worldPoint.x, worldPoint.y);
  };

  constructor(private readonly options: MapEditorOptions) {
    this.uiRoot = options.uiRoot ?? document.body;
    this.panel = new TilesetPanel(this.state);
    this.placement = new TilePlacementSystem(this.state, {
      tileSize: options.tileSize ?? 32,
      mapName: options.mapName ?? 'untitled-map',
    });
  }

  start(): void {
    if (this.enabled) return;

    this.enabled = true;
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(this.uiRoot);
    this.options.app.canvas.addEventListener('pointerdown', this.pointerDownHandler);
  }

  stop(): void {
    if (!this.enabled) return;

    this.enabled = false;
    this.options.app.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    this.panel.element.remove();

    if (this.placement.layer.parent) {
      this.placement.layer.parent.removeChild(this.placement.layer);
    }
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.options.app.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const transform = this.options.world.worldTransform;

    return {
      x: (screenX - transform.tx) / transform.a,
      y: (screenY - transform.ty) / transform.d,
    };
  }
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('.map-editor-panel') !== null;
}
