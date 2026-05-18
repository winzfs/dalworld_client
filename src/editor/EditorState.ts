import type { EditorLayerId, EditorTilesetAsset, EditorToolMode } from './types';
import { TILESET_CATEGORIES } from './tilesetManifest';

type EditorStateListener = () => void;

export class EditorState {
  private readonly listeners = new Set<EditorStateListener>();

  activeCategoryId = TILESET_CATEGORIES[0]?.id ?? '';
  selectedAsset: EditorTilesetAsset | null = TILESET_CATEGORIES[0]?.assets[0] ?? null;
  activeLayer: EditorLayerId = 'ground';
  mode: EditorToolMode = 'paint';

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

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
