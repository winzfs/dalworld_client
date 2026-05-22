import { TILESET_CATEGORIES } from './tilesetManifest';
import type { EditorLayerId, EditorTilesetAsset } from './types';

export type TilesetPanelLiteActions = {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onPickAsset: (asset: EditorTilesetAsset) => void;
  onFillAll: () => void;
  onRandomFill: (chancePercent: number) => void;
  onToggleWorldMap: () => void;
};

type EditorStateLike = {
  activeCategoryId: string;
  activeLayer: EditorLayerId;
  mode: string;
  gridSize: number;
  gridVisible: boolean;
  brushScale: number;
  selectedAsset?: EditorTilesetAsset | null;
  selectedBrush?: { asset: EditorTilesetAsset } | null;
  subscribe(listener: () => void): () => void;
  setActiveCategory(categoryId: string): void;
  selectAsset(asset: EditorTilesetAsset): void;
  setLayer(layer: EditorLayerId): void;
  setMode(mode: 'paint' | 'picker' | 'erase'): void;
  toggleGridVisible(): void;
  setGridSize(size: number): void;
  setBrushScale(scale: number): void;
  decreaseBrushScale(): void;
  increaseBrushScale(): void;
  selectBlackBrush(): void;
  toggleTransparentBlack(): void;
  transparentBlack: boolean;
};

const EDITOR_LAYERS: Array<{ id: EditorLayerId; label: string }> = [
  { id: 'ground', label: 'Ground' },
  { id: 'object', label: 'Object' },
  { id: 'collision', label: 'Block' },
];

const GRID_SIZE_OPTIONS = [16, 32, 64];
const BLACK_BRUSH_ID = 'editor-solid-black';

export class TilesetPanelLite {
  readonly element: HTMLDivElement;

  private readonly header = document.createElement('div');
  private readonly notice = document.createElement('div');
  private readonly scaleContainer = document.createElement('div');
  private readonly gridContainer = document.createElement('div');
  private readonly layerContainer = document.createElement('div');
  private readonly toolContainer = document.createElement('div');
  private readonly fillContainer = document.createElement('div');
  private readonly actionContainer = document.createElement('div');
  private readonly categoryContainer = document.createElement('div');
  private readonly assetContainer = document.createElement('div');

  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private randomChancePercent = 30;
  private lastNonBlackAsset: EditorTilesetAsset | null = null;

  constructor(
    private readonly state: EditorStateLike,
    private readonly actions: TilesetPanelLiteActions,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'map-editor-panel';
    this.element.style.left = '20px';
    this.element.style.top = '20px';

    this.header.className = 'map-editor-header';
    this.header.textContent = 'Map Editor';

    this.notice.style.cssText = [
      'padding:8px 10px',
      'font-size:12px',
      'line-height:1.4',
      'color:rgba(255,255,255,.76)',
      'background:rgba(255,209,102,.08)',
      'border-bottom:1px solid rgba(255,209,102,.14)',
    ].join(';');
    this.notice.textContent = 'TilesetPanel Lite: 기존 타일 UI 우선 복구 중. 몬스터 세부 패널은 다음 단계에서 연결합니다.';

    this.scaleContainer.className = 'map-editor-scale';
    this.gridContainer.className = 'map-editor-grid-controls';
    this.layerContainer.className = 'map-editor-layers';
    this.toolContainer.className = 'map-editor-tools';
    this.fillContainer.className = 'map-editor-fill';
    this.actionContainer.className = 'map-editor-actions';
    this.categoryContainer.className = 'map-editor-categories';
    this.assetContainer.className = 'map-editor-assets';

    this.element.append(
      this.header,
      this.notice,
      this.scaleContainer,
      this.gridContainer,
      this.layerContainer,
      this.toolContainer,
      this.fillContainer,
      this.actionContainer,
      this.categoryContainer,
      this.assetContainer,
    );

    this.attachDragHandlers();
    this.state.subscribe(() => this.render());
    this.ensureCategory();
    this.lastNonBlackAsset = this.getCurrentNonBlackAsset() ?? getFirstNonBlackAsset();
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  private ensureCategory(): void {
    const categories = getVisibleCategories();
    if (!categories.some((category) => category.id === this.state.activeCategoryId)) {
      const first = categories[0];
      if (first) this.state.setActiveCategory(first.id);
    }
  }

  private render(): void {
    const currentNonBlack = this.getCurrentNonBlackAsset();
    if (currentNonBlack) this.lastNonBlackAsset = currentNonBlack;
    this.renderScaleControls();
    this.renderGridControls();
    this.renderLayerControls();
    this.renderTools();
    this.renderFillControls();
    this.renderActions();
    this.renderCategories();
    this.renderAssets();
  }

  private renderScaleControls(): void {
    this.scaleContainer.innerHTML = '';
    const label = span('스케일', 'map-editor-scale-label');
    const decreaseButton = button('◀', 'map-editor-scale-button', () => this.state.decreaseBrushScale());
    const value = document.createElement('input');
    value.className = 'map-editor-scale-input';
    value.type = 'number';
    value.min = '0.1';
    value.max = '10';
    value.step = '0.1';
    value.value = this.state.brushScale.toFixed(1);
    value.onchange = () => this.state.setBrushScale(Number(value.value));
    value.onkeydown = (event) => { if (event.key === 'Enter') value.blur(); };
    const suffix = span('x', 'map-editor-scale-suffix');
    const increaseButton = button('▶', 'map-editor-scale-button', () => this.state.increaseBrushScale());
    this.scaleContainer.append(label, decreaseButton, value, suffix, increaseButton);
  }

  private renderGridControls(): void {
    this.gridContainer.innerHTML = '';
    const toggleButton = button('Grid', 'map-editor-grid-button', () => this.state.toggleGridVisible());
    if (this.state.gridVisible) toggleButton.classList.add('is-active');
    this.gridContainer.appendChild(toggleButton);
    for (const size of GRID_SIZE_OPTIONS) {
      const sizeButton = button(String(size), 'map-editor-grid-button', () => this.state.setGridSize(size));
      if (this.state.gridSize === size) sizeButton.classList.add('is-active');
      this.gridContainer.appendChild(sizeButton);
    }
  }

  private renderLayerControls(): void {
    this.layerContainer.innerHTML = '';
    this.layerContainer.appendChild(span('레이어', 'map-editor-layer-label'));
    for (const layer of EDITOR_LAYERS) {
      const layerButton = button(layer.label, 'map-editor-layer', () => this.state.setLayer(layer.id));
      if (this.state.activeLayer === layer.id) layerButton.classList.add('is-active');
      if (layer.id === 'collision') layerButton.classList.add('is-collision');
      this.layerContainer.appendChild(layerButton);
    }
  }

  private renderTools(): void {
    this.toolContainer.innerHTML = '';
    const paintButton = this.createModeButton('배치', 'paint');
    const pickerButton = this.createModeButton('피커', 'picker');
    const eraseButton = this.createModeButton('삭제', 'erase');
    const blackButton = button('Black', 'map-editor-action map-editor-black-brush', () => this.toggleBlackBrush());
    if (this.isBlackBrushActive()) blackButton.classList.add('is-active');
    const transparentBlackButton = button('검정투명', 'map-editor-action map-editor-transparent-black', () => this.state.toggleTransparentBlack());
    if (this.state.transparentBlack) transparentBlackButton.classList.add('is-active');
    const worldMapButton = button('월드맵', 'map-editor-action', this.actions.onToggleWorldMap);
    this.toolContainer.append(paintButton, pickerButton, eraseButton, blackButton, transparentBlackButton, worldMapButton);
  }

  private toggleBlackBrush(): void {
    if (this.isBlackBrushActive()) {
      const fallback = this.lastNonBlackAsset ?? getFirstNonBlackAsset();
      if (fallback) this.state.selectAsset(fallback);
      this.state.setMode('paint');
      return;
    }

    const current = this.getCurrentNonBlackAsset();
    if (current) this.lastNonBlackAsset = current;
    this.state.selectBlackBrush();
    this.state.setMode('paint');
  }

  private isBlackBrushActive(): boolean {
    return this.state.selectedBrush?.asset.id === BLACK_BRUSH_ID || this.state.selectedAsset?.id === BLACK_BRUSH_ID;
  }

  private getCurrentNonBlackAsset(): EditorTilesetAsset | null {
    const asset = this.state.selectedBrush?.asset ?? this.state.selectedAsset ?? null;
    return asset && asset.id !== BLACK_BRUSH_ID ? asset : null;
  }

  private renderFillControls(): void {
    this.fillContainer.innerHTML = '';
    const fillButton = button('전체 Fill', 'map-editor-action', this.actions.onFillAll);
    const chanceInput = document.createElement('input');
    chanceInput.className = 'map-editor-percent-input';
    chanceInput.type = 'number';
    chanceInput.min = '0';
    chanceInput.max = '100';
    chanceInput.step = '1';
    chanceInput.value = String(this.randomChancePercent);
    chanceInput.onchange = () => {
      this.randomChancePercent = normalizeChance(Number(chanceInput.value));
      chanceInput.value = String(this.randomChancePercent);
    };
    const percent = span('%', 'map-editor-percent-suffix');
    const randomButton = button('랜덤 Fill', 'map-editor-action', () => this.actions.onRandomFill(this.randomChancePercent));
    this.fillContainer.append(fillButton, chanceInput, percent, randomButton);
  }

  private renderActions(): void {
    this.actionContainer.innerHTML = '';
    this.actionContainer.append(
      button('저장', 'map-editor-action', this.actions.onSave),
      button('불러오기', 'map-editor-action', this.actions.onLoad),
      button('JSON', 'map-editor-action', this.actions.onExport),
      button('전체삭제', 'map-editor-action danger', this.actions.onClear),
    );
  }

  private renderCategories(): void {
    this.categoryContainer.innerHTML = '';
    for (const category of getVisibleCategories()) {
      const categoryButton = button(category.name, 'map-editor-category', () => this.state.setActiveCategory(category.id));
      if (category.id === this.state.activeCategoryId) categoryButton.classList.add('is-active');
      this.categoryContainer.appendChild(categoryButton);
    }
  }

  private renderAssets(): void {
    this.assetContainer.innerHTML = '';
    const category = getVisibleCategories().find((item) => item.id === this.state.activeCategoryId) ?? getVisibleCategories()[0];
    if (!category) return;

    for (const asset of category.assets) {
      const assetButton = document.createElement('button');
      assetButton.className = 'map-editor-asset';
      if (this.state.selectedAsset?.id === asset.id || this.state.selectedBrush?.asset.id === asset.id) {
        assetButton.classList.add('is-active');
      }
      assetButton.onclick = () => {
        this.state.selectAsset(asset);
        this.actions.onPickAsset(asset);
      };

      const preview = document.createElement('span');
      preview.className = 'map-editor-asset-preview';
      preview.style.display = 'inline-block';
      preview.style.width = '32px';
      preview.style.height = '32px';
      preview.style.minWidth = '32px';
      preview.style.minHeight = '32px';
      preview.style.flex = '0 0 32px';
      preview.style.borderRadius = '6px';
      preview.style.backgroundColor = 'rgba(255,255,255,.08)';
      preview.style.backgroundPosition = 'center';
      preview.style.backgroundRepeat = 'no-repeat';
      preview.style.backgroundSize = 'contain';
      preview.style.imageRendering = 'pixelated';
      if (asset.solidColor !== undefined || asset.url.startsWith('solid://')) {
        preview.style.background = `#${(asset.solidColor ?? 0x55d6be).toString(16).padStart(6, '0')}`;
      } else {
        preview.style.backgroundImage = `url(${asset.url})`;
      }

      const label = document.createElement('span');
      label.className = 'map-editor-asset-label';
      label.textContent = asset.name;
      assetButton.append(preview, label);
      this.assetContainer.appendChild(assetButton);
    }
  }

  private createModeButton(label: string, mode: 'paint' | 'picker' | 'erase'): HTMLButtonElement {
    const modeButton = button(label, 'map-editor-tool', () => this.state.setMode(mode));
    if (this.state.mode === mode) modeButton.classList.add('is-active');
    return modeButton;
  }

  private attachDragHandlers(): void {
    this.header.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.dragOffsetX = event.clientX - this.element.offsetLeft;
      this.dragOffsetY = event.clientY - this.element.offsetTop;
      this.header.setPointerCapture(event.pointerId);
    });
    this.header.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.element.style.left = `${Math.max(8, event.clientX - this.dragOffsetX)}px`;
      this.element.style.top = `${Math.max(8, event.clientY - this.dragOffsetY)}px`;
    });
    this.header.addEventListener('pointerup', (event) => {
      this.dragging = false;
      if (this.header.hasPointerCapture(event.pointerId)) this.header.releasePointerCapture(event.pointerId);
    });
    this.header.addEventListener('pointercancel', () => {
      this.dragging = false;
    });
  }
}

function getVisibleCategories() {
  return TILESET_CATEGORIES.filter((category) => category.id !== 'monsters');
}

function getFirstNonBlackAsset(): EditorTilesetAsset | null {
  for (const category of getVisibleCategories()) {
    const asset = category.assets.find((item) => item.id !== BLACK_BRUSH_ID);
    if (asset) return asset;
  }
  return null;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.onclick = onClick;
  return element;
}

function span(text: string, className: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function normalizeChance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
