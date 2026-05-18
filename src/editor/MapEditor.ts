import type { Application, Container } from 'pixi.js';
import { EditorState } from './EditorState';
import { TilesetPanel } from './TilesetPanel';
import { TilePlacementSystem } from './TilePlacementSystem';
import { MapStorage } from './MapStorage';

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
  private readonly storage: MapStorage;
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
    const mapName = options.mapName ?? 'untitled-map';

    this.uiRoot = options.uiRoot ?? document.body;
    this.storage = new MapStorage(mapName);
    this.placement = new TilePlacementSystem(this.state, {
      tileSize: options.tileSize ?? 32,
      mapName,
    });
    this.panel = new TilesetPanel(this.state, {
      onSave: () => this.save(),
      onLoad: () => {
        void this.load();
      },
      onExport: () => this.exportJson(),
      onClear: () => this.clearAll(),
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

  private save(): void {
    this.storage.save(this.placement.mapDraft);
    console.info('[MapEditor] Saved map draft.', this.placement.mapDraft);
  }

  private async load(): Promise<void> {
    const draft = this.storage.load();
    if (!draft) {
      console.warn('[MapEditor] No saved map draft found.');
      return;
    }

    await this.placement.loadDraft(draft);
    console.info('[MapEditor] Loaded map draft.', draft);
  }

  private exportJson(): void {
    this.storage.downloadJson(this.placement.mapDraft);
  }

  private clearAll(): void {
    const ok = window.confirm('현재 배치된 타일을 전부 삭제할까요? 저장 버튼을 누르기 전까지 저장본은 유지됩니다.');
    if (!ok) return;
    this.placement.clear();
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
