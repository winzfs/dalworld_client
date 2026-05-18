import { TILESET_CATEGORIES } from './tilesetManifest';
import type { EditorTilesetAsset } from './types';
import { EditorState } from './EditorState';

export type TilesetPanelActions = {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
};

export class TilesetPanel {
  readonly element: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private readonly toolContainer: HTMLDivElement;
  private readonly actionContainer: HTMLDivElement;
  private readonly categoryContainer: HTMLDivElement;
  private readonly assetContainer: HTMLDivElement;

  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

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

    this.toolContainer = document.createElement('div');
    this.toolContainer.className = 'map-editor-tools';

    this.actionContainer = document.createElement('div');
    this.actionContainer.className = 'map-editor-actions';

    this.categoryContainer = document.createElement('div');
    this.categoryContainer.className = 'map-editor-categories';

    this.assetContainer = document.createElement('div');
    this.assetContainer.className = 'map-editor-assets';

    this.element.append(
      this.header,
      this.toolContainer,
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
    this.renderTools();
    this.renderActions();
    this.renderCategories();
    this.renderAssets();
  }

  private renderTools(): void {
    this.toolContainer.innerHTML = '';

    const paintButton = this.createModeButton('배치', 'paint');
    const eraseButton = this.createModeButton('삭제', 'erase');

    this.toolContainer.append(paintButton, eraseButton);
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
    button.onclick = () => this.state.selectAsset(asset);

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
