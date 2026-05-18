import { TILESET_CATEGORIES } from './tilesetManifest';
import type { EditorTilesetAsset } from './types';
import { EditorState } from './EditorState';

export type TilesetPanelActions = {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onPickAsset: (asset: EditorTilesetAsset) => void;
  onFillAll: () => void;
  onRandomFill: (chancePercent: number) => void;
};

export class TilesetPanel {
  readonly element: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private readonly scaleContainer: HTMLDivElement;
  private readonly toolContainer: HTMLDivElement;
  private readonly fillContainer: HTMLDivElement;
  private readonly actionContainer: HTMLDivElement;
  private readonly categoryContainer: HTMLDivElement;
  private readonly assetContainer: HTMLDivElement;

  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private randomChancePercent = 30;

  constructor(
    private readonly state: EditorState,
    private readonly actions: TilesetPanelActions,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'map-editor-panel';
    this.element.style.left = '20px';
    this.element.style.top = '20px';

    this.header = document.createElement('div');
    this.header.className = 'map-editor-header';
    this.header.textContent = 'Map Editor';

    this.scaleContainer = document.createElement('div');
    this.scaleContainer.className = 'map-editor-scale';

    this.toolContainer = document.createElement('div');
    this.toolContainer.className = 'map-editor-tools';

    this.fillContainer = document.createElement('div');
    this.fillContainer.className = 'map-editor-fill';

    this.actionContainer = document.createElement('div');
    this.actionContainer.className = 'map-editor-actions';

    this.categoryContainer = document.createElement('div');
    this.categoryContainer.className = 'map-editor-categories';

    this.assetContainer = document.createElement('div');
    this.assetContainer.className = 'map-editor-assets';

    this.element.append(
      this.header,
      this.scaleContainer,
      this.toolContainer,
      this.fillContainer,
      this.actionContainer,
      this.categoryContainer,
      this.assetContainer,
    );

    this.attachDragHandlers();
    this.state.subscribe(() => this.render());
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  private render(): void {
    this.renderScaleControls();
    this.renderTools();
    this.renderFillControls();
    this.renderActions();
    this.renderCategories();
    this.renderAssets();
  }

  private renderScaleControls(): void {
    this.scaleContainer.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'map-editor-scale-label';
    label.textContent = '스케일';

    const decreaseButton = document.createElement('button');
    decreaseButton.className = 'map-editor-scale-button';
    decreaseButton.textContent = '◀';
    decreaseButton.onclick = () => this.state.decreaseBrushScale();

    const value = document.createElement('input');
    value.className = 'map-editor-scale-input';
    value.type = 'number';
    value.min = '0.1';
    value.max = '10';
    value.step = '0.1';
    value.value = this.state.brushScale.toFixed(1);
    value.onchange = () => this.state.setBrushScale(Number(value.value));
    value.onkeydown = (event) => {
      if (event.key === 'Enter') {
        value.blur();
      }
    };

    const suffix = document.createElement('span');
    suffix.className = 'map-editor-scale-suffix';
    suffix.textContent = 'x';

    const increaseButton = document.createElement('button');
    increaseButton.className = 'map-editor-scale-button';
    increaseButton.textContent = '▶';
    increaseButton.onclick = () => this.state.increaseBrushScale();

    this.scaleContainer.append(label, decreaseButton, value, suffix, increaseButton);
  }

  private renderTools(): void {
    this.toolContainer.innerHTML = '';

    const paintButton = this.createModeButton('배치', 'paint');
    const eraseButton = this.createModeButton('삭제', 'erase');

    this.toolContainer.append(paintButton, eraseButton);
  }

  private renderFillControls(): void {
    this.fillContainer.innerHTML = '';

    const fillButton = this.createActionButton('전체 Fill', this.actions.onFillAll);

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

    const percent = document.createElement('span');
    percent.className = 'map-editor-percent-suffix';
    percent.textContent = '%';

    const randomButton = this.createActionButton('랜덤 Fill', () => {
      this.actions.onRandomFill(this.randomChancePercent);
    });

    this.fillContainer.append(fillButton, chanceInput, percent, randomButton);
  }

  private renderActions(): void {
    this.actionContainer.innerHTML = '';

    this.actionContainer.append(
      this.createActionButton('저장', this.actions.onSave),
      this.createActionButton('불러오기', this.actions.onLoad),
      this.createActionButton('JSON', this.actions.onExport),
      this.createActionButton('전체삭제', this.actions.onClear, 'danger'),
    );
  }

  private renderCategories(): void {
    this.categoryContainer.innerHTML = '';

    for (const category of TILESET_CATEGORIES) {
      const button = document.createElement('button');
      button.className = 'map-editor-category';

      if (category.id === this.state.activeCategoryId) {
        button.classList.add('is-active');
      }

      button.textContent = category.name;
      button.onclick = () => this.state.setActiveCategory(category.id);

      this.categoryContainer.appendChild(button);
    }
  }

  private renderAssets(): void {
    this.assetContainer.innerHTML = '';

    const category = TILESET_CATEGORIES.find(
      (item) => item.id === this.state.activeCategoryId,
    );

    for (const asset of category?.assets ?? []) {
      this.assetContainer.appendChild(this.createAssetCard(asset));
    }
  }

  private createModeButton(label: string, mode: EditorState['mode']): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'map-editor-tool';
    if (this.state.mode === mode) button.classList.add('is-active');
    button.textContent = label;
    button.onclick = () => this.state.setMode(mode);
    return button;
  }

  private createActionButton(
    label: string,
    onClick: () => void,
    variant: 'normal' | 'danger' = 'normal',
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'map-editor-action';
    if (variant === 'danger') button.classList.add('is-danger');
    button.textContent = label;
    button.onclick = onClick;
    return button;
  }

  private createAssetCard(asset: EditorTilesetAsset): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'map-editor-asset';

    if (this.state.selectedAsset?.id === asset.id) {
      button.classList.add('is-selected');
    }

    const image = document.createElement('img');
    image.src = asset.url;
    image.alt = asset.name;
    image.draggable = false;

    const label = document.createElement('span');
    label.textContent = asset.name;

    button.append(image, label);
    button.onclick = () => this.actions.onPickAsset(asset);

    return button;
  }

  private attachDragHandlers(): void {
    this.header.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      const rect = this.element.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;

      this.header.setPointerCapture(event.pointerId);
    });

    this.header.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;

      this.element.style.left = `${event.clientX - this.dragOffsetX}px`;
      this.element.style.top = `${event.clientY - this.dragOffsetY}px`;
    });

    const stopDragging = () => {
      this.dragging = false;
    };

    this.header.addEventListener('pointerup', stopDragging);
    this.header.addEventListener('pointercancel', stopDragging);
  }
}

function normalizeChance(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(100, Math.max(0, Math.round(value)));
}
