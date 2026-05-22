import type { Application, Container } from 'pixi.js';
import { EditorGridOverlay } from './EditorGridOverlay';
import { EditorState } from './EditorState';
import { TilePlacementSystem } from './TilePlacementSystem';
import { TilesetPanel } from './TilesetPanel';
import type { EditorTilesetAsset } from './types';

export type LightweightEditorRuntimeOptions = {
  app: Application;
  world: Container;
  worldWidth: number;
  worldHeight: number;
  tileSize: number;
  mapName: string;
  notify: (message: string) => void;
};

export class LightweightEditorRuntime {
  readonly state = new EditorState();
  readonly placement: TilePlacementSystem;

  private readonly gridOverlay: EditorGridOverlay;
  private readonly panel: TilesetPanel;
  private paintingPointerId: number | null = null;
  private lastPaintKey: string | null = null;

  constructor(private readonly options: LightweightEditorRuntimeOptions) {
    this.placement = new TilePlacementSystem(this.state, {
      tileSize: options.tileSize,
      mapName: options.mapName,
    });
    this.gridOverlay = new EditorGridOverlay(this.state, {
      width: options.worldWidth,
      height: options.worldHeight,
    });
    this.panel = new TilesetPanel(this.state, {
      onSave: () => this.notify('경량 모드에서는 아직 서버 저장을 지원하지 않습니다. Export를 사용해 주세요.'),
      onLoad: () => this.notify('경량 모드에서는 아직 불러오기를 지원하지 않습니다.'),
      onExport: () => this.exportJson(),
      onClear: () => this.placement.clear(),
      onPickAsset: (asset) => this.pickAsset(asset),
      onFillAll: () => {
        void this.placement.fillAll({ width: options.worldWidth, height: options.worldHeight });
      },
      onRandomFill: (chancePercent) => {
        void this.placement.fillRandom({
          width: options.worldWidth,
          height: options.worldHeight,
          chancePercent,
        });
      },
      onToggleWorldMap: () => this.notify('경량 모드에서는 월드맵 패널을 아직 지원하지 않습니다.'),
      getMonsterSpawnRules: () => [],
      setMonsterSpawnRules: () => undefined,
    });
  }

  start(parent: HTMLElement): void {
    this.options.world.addChild(this.gridOverlay.layer);
    this.options.world.addChild(this.placement.layer);
    this.panel.mount(parent);
    this.attachPaintingHandlers();
    this.notify('경량 에디터 준비 완료. 타일을 선택하고 맵을 터치/드래그해서 배치할 수 있습니다.');
  }

  async transitionWorldCell(): Promise<void> {
    // Lightweight mode keeps the current cell only.
  }

  private pickAsset(asset: EditorTilesetAsset): void {
    this.state.selectAsset(asset);
  }

  private attachPaintingHandlers(): void {
    const canvas = this.options.app.canvas;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerEnd);
    canvas.addEventListener('pointercancel', this.pointerEnd);
  }

  private readonly pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (isEditorUiTarget(event.target)) return;
    this.paintingPointerId = event.pointerId;
    this.lastPaintKey = null;
    this.options.app.canvas.setPointerCapture(event.pointerId);
    this.paintFromEvent(event);
  };

  private readonly pointerMove = (event: PointerEvent) => {
    if (this.paintingPointerId !== event.pointerId) return;
    if (isEditorUiTarget(event.target)) return;
    this.paintFromEvent(event);
  };

  private readonly pointerEnd = (event: PointerEvent) => {
    if (this.paintingPointerId !== event.pointerId) return;
    this.paintingPointerId = null;
    this.lastPaintKey = null;
    const canvas = this.options.app.canvas;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  private paintFromEvent(event: PointerEvent): void {
    const worldPoint = this.screenToWorld(event.clientX, event.clientY);
    const tileSize = this.state.gridSize;
    const x = Math.floor(worldPoint.x / tileSize) * tileSize;
    const y = Math.floor(worldPoint.y / tileSize) * tileSize;
    const paintKey = `${this.state.activeLayer}:${x}:${y}`;
    if (paintKey === this.lastPaintKey) return;
    this.lastPaintKey = paintKey;
    void this.placement.placeAt(worldPoint.x, worldPoint.y);
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

  private exportJson(): void {
    const draft = this.placement.mapDraft;
    const json = JSON.stringify(draft, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${draft.name || 'dalworld-map-lightweight'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private notify(message: string): void {
    this.options.notify(message);
  }
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.map-editor-panel, .tile-picker-window, .world-map-panel'));
}
