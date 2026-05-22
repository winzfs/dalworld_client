import { BLACK_SOLID_ASSET, type EditorState } from './EditorState';
import { TILESET_CATEGORIES } from './tilesetManifest';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorSourceRect, EditorTilesetAsset } from './types';

const DIRECT_SELECT_MAX_SIZE = 96;
const GRID_SIZE_OPTIONS = [16, 32, 64];
const LAYERS = [
  { id: 'ground', label: 'Ground' },
  { id: 'object', label: 'Object' },
  { id: 'collision', label: 'Block' },
] as const;

type Options = {
  state: EditorState;
  placement: TilePlacementSystem;
  status: (message: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onToggleWorldMap?: () => void;
};

type TilePickerWindowInstance = {
  mount(parent: HTMLElement): void;
  open(asset: EditorTilesetAsset): void;
  readonly element: HTMLDivElement;
};

let mountedPanel: ClassicTilesPanelLite | null = null;
let pickerWindow: TilePickerWindowInstance | null = null;

export function mountClassicTilesPanelLite(options: Options): void {
  mountedPanel?.destroy();
  mountedPanel = new ClassicTilesPanelLite(options);
  mountedPanel.mount(document.body);
}

class ClassicTilesPanelLite {
  readonly element = document.createElement('div');
  private activeTab: 'tiles' | 'monsters' = 'tiles';
  private randomChancePercent = 30;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: Options) {
    this.element.className = 'map-editor-panel';
    this.element.style.left = '20px';
    this.element.style.top = '20px';
    this.unsubscribe = options.state.subscribe(() => this.render());
    this.attachDragHandlers();
    this.render();
  }

  mount(parent: HTMLElement): void {
    document.querySelector('.minimal-editor-panel')?.remove();
    parent.appendChild(this.element);
  }

  destroy(): void {
    this.unsubscribe();
    this.element.remove();
  }

  private render(): void {
    this.element.replaceChildren(
      this.createHeader(),
      this.createTabs(),
      this.createScaleControls(),
      this.createGridControls(),
      this.createLayerControls(),
      this.createTools(),
      this.createFillControls(),
      this.createActions(),
      this.createCategories(),
      this.createMonsterPlaceholder(),
      this.createAssets(),
    );
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'map-editor-header';
    header.textContent = 'Map Editor';
    return header;
  }

  private createTabs(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-tabs';
    container.append(this.createTabButton('Tiles', 'tiles'), this.createTabButton('Monsters', 'monsters'));
    return container;
  }

  private createTabButton(label: string, tab: 'tiles' | 'monsters'): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'map-editor-tab';
    if (this.activeTab === tab) button.classList.add('is-active');
    button.textContent = label;
    button.onclick = () => {
      this.activeTab = tab;
      this.render();
    };
    return button;
  }

  private createScaleControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-scale';
    container.hidden = this.activeTab !== 'tiles';

    const label = document.createElement('span');
    label.className = 'map-editor-scale-label';
    label.textContent = '스케일';

    const dec = this.createButton('◀', 'map-editor-scale-button', () => this.options.state.decreaseBrushScale());
    const input = document.createElement('input');
    input.className = 'map-editor-scale-input';
    input.type = 'number';
    input.min = '0.1';
    input.max = '10';
    input.step = '0.1';
    input.value = this.options.state.brushScale.toFixed(1);
    input.onchange = () => this.options.state.setBrushScale(Number(input.value));

    const suffix = document.createElement('span');
    suffix.className = 'map-editor-scale-suffix';
    suffix.textContent = 'x';

    const inc = this.createButton('▶', 'map-editor-scale-button', () => this.options.state.increaseBrushScale());
    container.append(label, dec, input, suffix, inc);
    return container;
  }

  private createGridControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-grid-controls';

    const toggle = this.createButton('Grid', 'map-editor-grid-button', () => this.options.state.toggleGridVisible());
    if (this.options.state.gridVisible) toggle.classList.add('is-active');
    container.appendChild(toggle);

    for (const size of GRID_SIZE_OPTIONS) {
      const button = this.createButton(String(size), 'map-editor-grid-button', () => this.options.state.setGridSize(size));
      if (this.options.state.gridSize === size) button.classList.add('is-active');
      container.appendChild(button);
    }
    return container;
  }

  private createLayerControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-layers';
    container.hidden = this.activeTab !== 'tiles';

    const label = document.createElement('span');
    label.className = 'map-editor-layer-label';
    label.textContent = '레이어';
    container.appendChild(label);

    for (const layer of LAYERS) {
      const button = this.createButton(layer.label, 'map-editor-layer', () => this.options.state.setLayer(layer.id));
      if (this.options.state.activeLayer === layer.id) button.classList.add('is-active');
      if (layer.id === 'collision') button.classList.add('is-collision');
      container.appendChild(button);
    }
    return container;
  }

  private createTools(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-tools';
    container.hidden = this.activeTab !== 'tiles';

    container.append(
      this.createModeButton('배치', 'paint'),
      this.createModeButton('피커', 'picker'),
      this.createModeButton('삭제', 'erase'),
      this.createBlackButton(),
      this.createTransparentBlackButton(),
      this.createButton('월드맵', 'map-editor-action', this.options.onToggleWorldMap ?? (() => this.options.status('월드맵은 다음 단계에서 지연 복구합니다.'))),
    );
    return container;
  }

  private createModeButton(label: string, mode: 'paint' | 'picker' | 'erase'): HTMLButtonElement {
    const button = this.createButton(label, 'map-editor-tool', () => this.options.state.setMode(mode));
    if (this.options.state.mode === mode) button.classList.add('is-active');
    return button;
  }

  private createBlackButton(): HTMLButtonElement {
    const button = this.createButton('Black', 'map-editor-action', () => this.options.state.selectBlackBrush());
    button.classList.add('map-editor-black-brush');
    if (this.options.state.selectedAsset?.id === BLACK_SOLID_ASSET.id) button.classList.add('is-active');
    return button;
  }

  private createTransparentBlackButton(): HTMLButtonElement {
    const button = this.createButton('검정투명', 'map-editor-action', () => this.options.state.toggleTransparentBlack());
    button.classList.add('map-editor-transparent-black');
    if (this.options.state.transparentBlack) button.classList.add('is-active');
    return button;
  }

  private createFillControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-fill';
    container.hidden = this.activeTab !== 'tiles';

    const fill = this.createButton('전체 Fill', 'map-editor-action', () => {
      if (window.confirm('현재 선택한 타일로 맵 전체를 채울까요?')) {
        void this.options.placement.fillAll({ width: 3000, height: 3000 });
      }
    });

    const chance = document.createElement('input');
    chance.className = 'map-editor-percent-input';
    chance.type = 'number';
    chance.min = '0';
    chance.max = '100';
    chance.step = '1';
    chance.value = String(this.randomChancePercent);
    chance.onchange = () => {
      this.randomChancePercent = Math.max(0, Math.min(100, Math.round(Number(chance.value) || 0)));
      chance.value = String(this.randomChancePercent);
    };

    const suffix = document.createElement('span');
    suffix.className = 'map-editor-percent-suffix';
    suffix.textContent = '%';

    const random = this.createButton('랜덤 Fill', 'map-editor-action', () => {
      if (window.confirm(`${this.randomChancePercent}% 확률로 맵 전체에 랜덤 배치할까요?`)) {
        void this.options.placement.fillRandom({ width: 3000, height: 3000, chancePercent: this.randomChancePercent });
      }
    });

    container.append(fill, chance, suffix, random);
    return container;
  }

  private createActions(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-actions';
    container.append(
      this.createButton('저장', 'map-editor-action', this.options.onSave),
      this.createButton('불러오기', 'map-editor-action', this.options.onLoad),
      this.createButton('JSON', 'map-editor-action', this.options.onExport),
      this.createButton('전체삭제', 'map-editor-action danger', this.options.onClear),
    );
    return container;
  }

  private createCategories(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-categories';
    container.hidden = this.activeTab !== 'tiles';

    for (const category of TILESET_CATEGORIES.filter((item) => item.id !== 'monsters')) {
      const button = this.createButton(category.name, 'map-editor-category', () => this.options.state.setActiveCategory(category.id));
      if (category.id === this.options.state.activeCategoryId) button.classList.add('is-active');
      container.appendChild(button);
    }
    return container;
  }

  private createAssets(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-assets';
    container.hidden = this.activeTab !== 'tiles';

    const category = TILESET_CATEGORIES.find((item) => item.id === this.options.state.activeCategoryId)
      ?? TILESET_CATEGORIES.find((item) => item.id !== 'monsters');
    if (!category) return container;

    for (const asset of category.assets) {
      container.appendChild(this.createAssetButton(asset));
    }
    return container;
  }

  private createAssetButton(asset: EditorTilesetAsset): HTMLButtonElement {
    const button = this.createButton(asset.name, 'map-editor-asset', () => {
      void this.pickAsset(asset);
    });
    if (this.options.state.selectedAsset?.id === asset.id) button.classList.add('is-active');
    return button;
  }

  private async pickAsset(asset: EditorTilesetAsset): Promise<void> {
    this.options.state.selectAsset(asset);
    if (await this.shouldOpenPicker(asset)) {
      await this.openPicker(asset);
    } else {
      this.options.status(`선택됨: ${asset.name}`);
    }
  }

  private async shouldOpenPicker(asset: EditorTilesetAsset): Promise<boolean> {
    if (asset.tileWidth && asset.tileHeight) return false;
    if (asset.solidColor !== undefined) return false;
    if (!asset.url || asset.url.startsWith('solid://')) return false;
    const size = await loadImageSize(asset.url);
    return Boolean(size && (size.width > DIRECT_SELECT_MAX_SIZE || size.height > DIRECT_SELECT_MAX_SIZE));
  }

  private async openPicker(asset: EditorTilesetAsset): Promise<void> {
    this.options.status(`타일셋 부분 선택 로딩: ${asset.name}`);
    const { TilePickerWindow } = await import('./TilePickerWindow');
    if (!pickerWindow) {
      pickerWindow = new TilePickerWindow({
        defaultGridSize: this.options.state.gridSize,
        onPick: (pickedAsset: EditorTilesetAsset, sourceRect: EditorSourceRect) => {
          this.options.state.setSourceRect(pickedAsset, sourceRect);
          this.options.status(`부분 선택됨: ${pickedAsset.name}`);
        },
      });
      pickerWindow.mount(document.body);
    }
    pickerWindow.open(asset);
  }

  private createMonsterPlaceholder(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'map-editor-monster-editor';
    container.hidden = this.activeTab !== 'monsters';
    container.textContent = 'Monsters 탭은 다음 단계에서 기존 UI 기준으로 지연 복구합니다.';
    return container;
  }

  private createButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.onclick = onClick;
    return button;
  }

  private attachDragHandlers(): void {
    const onPointerMove = (event: PointerEvent) => {
      if (!this.dragging) return;
      this.element.style.left = `${event.clientX - this.dragOffsetX}px`;
      this.element.style.top = `${event.clientY - this.dragOffsetY}px`;
    };
    const onPointerUp = () => {
      this.dragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    this.element.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains('map-editor-header')) return;
      this.dragging = true;
      const rect = this.element.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
