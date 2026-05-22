import type { Application, Container } from 'pixi.js';
import type { EditorMapDraft, EditorTilesetAsset } from './types';

type EditorStateLike = {
  gridSize: number;
  activeLayer: string;
  selectAsset: (asset: EditorTilesetAsset) => void;
};

type TilePlacementSystemLike = {
  layer: Container;
  mapDraft: EditorMapDraft;
  placeAt: (worldX: number, worldY: number) => Promise<void>;
  fillAll: (options: { width: number; height: number }) => Promise<void>;
  fillRandom: (options: { width: number; height: number; chancePercent: number }) => Promise<void>;
  clear: () => void;
};

type RuntimeModules = {
  EditorState: new () => EditorStateLike;
  TilePlacementSystem: new (
    state: EditorStateLike,
    options: { tileSize: number; mapName: string },
  ) => TilePlacementSystemLike;
  EditorGridOverlay: new (
    state: EditorStateLike,
    options: { width: number; height: number },
  ) => { layer: Container };
  TilesetPanel: new (
    state: EditorStateLike,
    options: {
      onSave: () => void;
      onLoad: () => void;
      onExport: () => void;
      onClear: () => void;
      onPickAsset: (asset: EditorTilesetAsset) => void;
      onFillAll: () => void;
      onRandomFill: (chancePercent: number) => void;
      onToggleWorldMap: () => void;
      getMonsterSpawnRules: () => unknown[];
      setMonsterSpawnRules: (rules: unknown[]) => void;
    },
  ) => { mount: (parent: HTMLElement) => void };
};

export type LightweightRuntimeOptions = {
  app: Application;
  world: Container;
  worldWidth: number;
  worldHeight: number;
  tileSize: number;
  mapName: string;
  notify: (message: string) => void;
  modules: RuntimeModules;
};

export type LightweightRuntime = {
  placement: TilePlacementSystemLike;
  transitionWorldCell: () => Promise<void>;
};

export function createLightweightEditorRuntime(options: LightweightRuntimeOptions): LightweightRuntime {
  const state = new options.modules.EditorState();
  const placement = new options.modules.TilePlacementSystem(state, {
    tileSize: options.tileSize,
    mapName: options.mapName,
  });
  const gridOverlay = new options.modules.EditorGridOverlay(state, {
    width: options.worldWidth,
    height: options.worldHeight,
  });
  const panel = new options.modules.TilesetPanel(state, {
    onSave: () => options.notify('경량 모드에서는 아직 서버 저장을 지원하지 않습니다. Export를 사용해 주세요.'),
    onLoad: () => options.notify('경량 모드에서는 아직 불러오기를 지원하지 않습니다.'),
    onExport: () => exportJson(placement.mapDraft),
    onClear: () => placement.clear(),
    onPickAsset: (asset) => state.selectAsset(asset),
    onFillAll: () => {
      void placement.fillAll({ width: options.worldWidth, height: options.worldHeight });
    },
    onRandomFill: (chancePercent) => {
      void placement.fillRandom({ width: options.worldWidth, height: options.worldHeight, chancePercent });
    },
    onToggleWorldMap: () => options.notify('경량 모드에서는 월드맵 패널을 아직 지원하지 않습니다.'),
    getMonsterSpawnRules: () => [],
    setMonsterSpawnRules: () => undefined,
  });

  options.world.addChild(gridOverlay.layer);
  options.world.addChild(placement.layer);
  panel.mount(document.body);
  attachPaintingHandlers({ app: options.app, world: options.world, state, placement });
  options.notify('경량 에디터 준비 완료. 타일을 선택하고 맵을 터치/드래그해서 배치할 수 있습니다.');

  return {
    placement,
    transitionWorldCell: async () => undefined,
  };
}

function attachPaintingHandlers(options: {
  app: Application;
  world: Container;
  state: EditorStateLike;
  placement: TilePlacementSystemLike;
}): void {
  let paintingPointerId: number | null = null;
  let lastPaintKey: string | null = null;

  const paintFromEvent = (event: PointerEvent) => {
    const point = screenToWorld(options.app, options.world, event.clientX, event.clientY);
    const tileSize = options.state.gridSize;
    const x = Math.floor(point.x / tileSize) * tileSize;
    const y = Math.floor(point.y / tileSize) * tileSize;
    const paintKey = `${options.state.activeLayer}:${x}:${y}`;
    if (paintKey === lastPaintKey) return;
    lastPaintKey = paintKey;
    void options.placement.placeAt(point.x, point.y);
  };

  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (isEditorUiTarget(event.target)) return;
    paintingPointerId = event.pointerId;
    lastPaintKey = null;
    options.app.canvas.setPointerCapture(event.pointerId);
    paintFromEvent(event);
  };

  const pointerMove = (event: PointerEvent) => {
    if (paintingPointerId !== event.pointerId) return;
    if (isEditorUiTarget(event.target)) return;
    paintFromEvent(event);
  };

  const pointerEnd = (event: PointerEvent) => {
    if (paintingPointerId !== event.pointerId) return;
    paintingPointerId = null;
    lastPaintKey = null;
    if (options.app.canvas.hasPointerCapture(event.pointerId)) {
      options.app.canvas.releasePointerCapture(event.pointerId);
    }
  };

  options.app.canvas.addEventListener('pointerdown', pointerDown);
  options.app.canvas.addEventListener('pointermove', pointerMove);
  options.app.canvas.addEventListener('pointerup', pointerEnd);
  options.app.canvas.addEventListener('pointercancel', pointerEnd);
}

function screenToWorld(app: Application, world: Container, clientX: number, clientY: number): { x: number; y: number } {
  const rect = app.canvas.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  const transform = world.worldTransform;
  return {
    x: (screenX - transform.tx) / transform.a,
    y: (screenY - transform.ty) / transform.d,
  };
}

function isEditorUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.map-editor-panel, .tile-picker-window, .world-map-panel'));
}

function exportJson(draft: EditorMapDraft): void {
  const json = JSON.stringify(draft, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${draft.name || 'dalworld-map-lightweight'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
