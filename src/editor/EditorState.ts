import type { EditorLayerId, EditorTilesetAsset, EditorToolMode } from './types';
import { TILESET_CATEGORIES } from './tilesetManifest';

type EditorStateListener = () => void;

const MIN_BRUSH_SCALE = 0.1;
const MAX_BRUSH_SCALE = 10;
const BRUSH_SCALE_STEP = 0.1;

export class EditorState {
  private readonly listeners = new Set<EditorStateListener>();

  activeCategoryId = TILESET_CATEGORIES[0]?.id ?? '';
  selectedAsset: EditorTilesetAsset | null = TILESET_CATEGORIES[0]?.assets[0] ?? null;
  activeLayer: EditorLayerId = 'ground';
  mode: EditorToolMode = 'paint';
  brushScale = 1;

  subscribe(listener: EditorStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActiveCategory(categoryId: string): void {
    if (this.activeCategoryId === categoryId) return;

    this.activeCategoryId = categoryId;
    const category = TILESET_CATEGORIES.find((item) => item.id === categoryId);
    this.selectedAsset = category?.assets[0] ?? null;
    this.emit();
  }

  selectAsset(asset: EditorTilesetAsset): void {
    this.selectedAsset = asset;
    this.activeCategoryId = asset.categoryId;
    this.mode = 'paint';
    this.emit();
  }

  setLayer(layer: EditorLayerId): void {
    if (this.activeLayer === layer) return;
    this.activeLayer = layer;
    this.emit();
  }

  setMode(mode: EditorToolMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit();
  }

  setBrushScale(scale: number): void {
    const next = normalizeBrushScale(scale);
    if (this.brushScale === next) return;
    this.brushScale = next;
    this.emit();
  }

  adjustBrushScale(delta: number): void {
    this.setBrushScale(this.brushScale + delta);
  }

  decreaseBrushScale(): void {
    this.adjustBrushScale(-BRUSH_SCALE_STEP);
  }

  increaseBrushScale(): void {
    this.adjustBrushScale(BRUSH_SCALE_STEP);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function normalizeBrushScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(MAX_BRUSH_SCALE, Math.max(MIN_BRUSH_SCALE, value));
  return Math.round(clamped * 100) / 100;
}
