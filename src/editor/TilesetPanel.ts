import { TILESET_CATEGORIES } from './tilesetManifest';
import type { EditorLayerId, EditorMonsterSpawnRule, EditorTilesetAsset } from './types';
import { EditorState, BLACK_SOLID_ASSET } from './EditorState';
import { MonsterSpawnControls } from './MonsterSpawnControls';

export type TilesetPanelActions = {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onPickAsset: (asset: EditorTilesetAsset) => void;
  onFillAll: () => void;
  onRandomFill: (chancePercent: number) => void;
  onToggleWorldMap: () => void;
  getMonsterSpawnRules: () => EditorMonsterSpawnRule[];
  setMonsterSpawnRules: (rules: EditorMonsterSpawnRule[]) => void;
};

const EDITOR_LAYERS: Array<{ id: EditorLayerId; label: string }> = [
  { id: 'ground', label: 'Ground' },
  { id: 'object', label: 'Object' },
  { id: 'collision', label: 'Block' },
];

const GRID_SIZE_OPTIONS = [16, 32, 64];
const MONSTER_CATEGORY_ID = 'monsters';
type PanelTab = 'tiles' | 'monsters';

export class TilesetPanel {
  readonly element: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private readonly tabContainer: HTMLDivElement;
  private readonly scaleContainer: HTMLDivElement;
  private readonly gridContainer: HTMLDivElement;
  private readonly layerContainer: HTMLDivElement;
  private readonly toolContainer: HTMLDivElement;
  private readonly fillContainer: HTMLDivElement;
  private readonly actionContainer: HTMLDivElement;
  private readonly categoryContainer: HTMLDivElement;
  private readonly monsterRuleContainer: HTMLDivElement;
  private readonly assetContainer: HTMLDivElement;
  private readonly monsterSpawnControls: MonsterSpawnControls;

  private activeTab: PanelTab = 'tiles';
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

    this.tabContainer = document.createElement('div');
    this.tabContainer.className = 'map-editor-tabs';

    this.scaleContainer = document.createElement('div');
    this.scaleContainer.className = 'map-editor-scale';

    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'map-editor-grid-controls';

    this.layerContainer = document.createElement('div');
    this.layerContainer.className = 'map-editor-layers';

    this.toolContainer = document.createElement('div');
    this.toolContainer.className = 'map-editor-tools';

    this.fillContainer = document.createElement('div');
    this.fillContainer.className = 'map-editor-fill';

    this.actionContainer = document.createElement('div');
    this.actionContainer.className = 'map-editor-actions';

    this.categoryContainer = document.createElement('div');
    this.categoryContainer.className = 'map-editor-categories';

    this.monsterRuleContainer = document.createElement('div');
    this.monsterRuleContainer.className = 'map-editor-monster-rules';

    this.assetContainer = document.createElement('div');
    this.assetContainer.className = 'map-editor-assets';

    this.monsterSpawnControls = new MonsterSpawnControls(this.state);

    this.element.append(
      this.header,
      this.tabContainer,
      this.scaleContainer,
      this.gridContainer,
      this.layerContainer,
      this.toolContainer,
      this.fillContainer,
      this.actionContainer,
      this.categoryContainer,
      this.monsterRuleContainer,
      this.assetContainer,
      this.monsterSpawnControls.element,
    );

    this.attachDragHandlers();
    this.state.subscribe(() => this.render());
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  private render(): void {
    this.renderTabs();
    this.renderScaleControls();
    this.renderGridControls();
    this.renderLayerControls();
    this.renderTools();
    this.renderFillControls();
    this.renderActions();
    this.renderCategories();
    this.renderMonsterRules();
    this.renderAssets();
    this.monsterSpawnControls.render();
    this.applyTabVisibility();
  }

  private renderTabs(): void {
    this.tabContainer.innerHTML = '';
    this.tabContainer.append(
      this.createTabButton('Tiles', 'tiles'),
      this.createTabButton('Monsters', 'monsters'),
    );
  }

  private createTabButton(label: string, tab: PanelTab): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'map-editor-tab';
    if (this.activeTab === tab) button.classList.add('is-active');
    button.textContent = label;
    button.onclick = () => {
      this.activeTab = tab;
      if (tab === 'monsters') this.state.setActiveCategory(MONSTER_CATEGORY_ID);
      this.render();
    };
    return button;
  }

  private applyTabVisibility(): void {
    const isMonsters = this.activeTab === 'monsters';
    this.categoryContainer.hidden = isMonsters;
    this.monsterRuleContainer.hidden = !isMonsters;

    if (!isMonsters) {
      this.monsterSpawnControls.element.hidden = true;
    }
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
      if (event.key === 'Enter') value.blur();
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

  private renderGridControls(): void {
    this.gridContainer.innerHTML = '';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'map-editor-grid-button';
    if (this.state.gridVisible) toggleButton.classList.add('is-active');
    toggleButton.textContent = 'Grid';
    toggleButton.onclick = () => this.state.toggleGridVisible();
    this.gridContainer.appendChild(toggleButton);

    for (const size of GRID_SIZE_OPTIONS) {
      const button = document.createElement('button');
      button.className = 'map-editor-grid-button';
      if (this.state.gridSize === size) button.classList.add('is-active');
      button.textContent = String(size);
      button.onclick = () => this.state.setGridSize(size);
      this.gridContainer.appendChild(button);
    }
  }

  private renderLayerControls(): void {
    this.layerContainer.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'map-editor-layer-label';
    label.textContent = '레이어';
    this.layerContainer.appendChild(label);

    for (const layer of EDITOR_LAYERS) {
      const button = document.createElement('button');
      button.className = 'map-editor-layer';
      if (this.state.activeLayer === layer.id) button.classList.add('is-active');
      if (layer.id === 'collision') button.classList.add('is-collision');
      button.textContent = layer.label;
      button.onclick = () => this.state.setLayer(layer.id);
      this.layerContainer.appendChild(button);
    }
  }

  private renderTools(): void {
    this.toolContainer.innerHTML = '';

    const paintButton = this.createModeButton('배치', 'paint');
    const pickerButton = this.createModeButton('피커', 'picker');
    const eraseButton = this.createModeButton('삭제', 'erase');
    const blackButton = this.createActionButton('Black', () => this.state.selectBlackBrush());
    blackButton.classList.add('map-editor-black-brush');
    if (this.state.selectedAsset?.id === BLACK_SOLID_ASSET.id) blackButton.classList.add('is-active');

    const transparentBlackButton = this.createActionButton('검정투명', () => this.state.toggleTransparentBlack());
    transparentBlackButton.classList.add('map-editor-transparent-black');
    if (this.state.transparentBlack) transparentBlackButton.classList.add('is-active');

    const worldMapButton = this.createActionButton('월드맵', this.actions.onToggleWorldMap);

    this.toolContainer.append(paintButton, pickerButton, eraseButton, blackButton, transparentBlackButton, worldMapButton);
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

    for (const category of TILESET_CATEGORIES.filter((category) => category.id !== MONSTER_CATEGORY_ID)) {
      const button = document.createElement('button');
      button.className = 'map-editor-category';
      if (category.id === this.state.activeCategoryId) button.classList.add('is-active');
      button.textContent = category.name;
      button.onclick = () => this.state.setActiveCategory(category.id);
      this.categoryContainer.appendChild(button);
    }
  }

  private renderMonsterRules(): void {
    this.monsterRuleContainer.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'map-editor-section-title';
    title.textContent = '전체맵 몬스터 스폰';

    const note = document.createElement('div');
    note.className = 'map-editor-monster-rule-note';
    note.textContent = '지역 스폰 마커와 별도로, 전체맵에 몬스터를 시간당 보충합니다.';

    this.monsterRuleContainer.append(title, note);

    for (const rule of this.actions.getMonsterSpawnRules()) {
      this.monsterRuleContainer.appendChild(this.createMonsterRuleCard(rule));
    }
  }

  private createMonsterRuleCard(rule: EditorMonsterSpawnRule): HTMLElement {
    const card = document.createElement('div');
    card.className = 'map-editor-monster-rule-card';
    if (!rule.enabled) card.classList.add('is-disabled');

    const toggle = document.createElement('label');
    toggle.className = 'map-editor-monster-rule-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.onchange = () => this.patchMonsterRule(rule.id, { enabled: checkbox.checked });

    const name = document.createElement('strong');
    name.textContent = rule.monsterType === 'sheep' ? 'Sheep' : 'Wild Slime';
    toggle.append(checkbox, name);

    card.append(
      toggle,
      this.createMonsterRuleNumberField('최대 유지', rule.maxAlive, 0, 500, 1, (value) => {
        this.patchMonsterRule(rule.id, { maxAlive: Math.round(value) });
      }),
      this.createMonsterRuleNumberField('시간당', rule.spawnsPerHour, 1, 36000, 1, (value) => {
        this.patchMonsterRule(rule.id, { spawnsPerHour: Math.round(value) });
      }),
    );

    return card;
  }

  private createMonsterRuleNumberField(
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const label = document.createElement('label');
    label.className = 'map-editor-monster-rule-field';

    const span = document.createElement('span');
    span.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.onchange = () => onChange(clampNumber(Number(input.value), min, max, value));

    label.append(span, input);
    return label;
  }

  private patchMonsterRule(ruleId: string, patch: Partial<EditorMonsterSpawnRule>): void {
    this.actions.setMonsterSpawnRules(this.actions.getMonsterSpawnRules().map((rule) => (
      rule.id === ruleId ? { ...rule, ...patch } : rule
    )));
    this.render();
  }

  private renderAssets(): void {
    this.assetContainer.innerHTML = '';

    const activeCategoryId = this.activeTab === 'monsters' ? MONSTER_CATEGORY_ID : this.state.activeCategoryId;
    const category = TILESET_CATEGORIES.find((item) => item.id === activeCategoryId);

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

    if (this.state.selectedAsset?.id === asset.id) button.classList.add('is-selected');
    if (asset.gameplayDefaults?.kind === 'monsterSpawn') button.classList.add('is-monster-spawn');

    if (asset.solidColor !== undefined || asset.url.startsWith('solid://')) {
      const swatch = document.createElement('span');
      swatch.className = 'map-editor-asset-swatch';
      swatch.style.background = `#${(asset.solidColor ?? 0x7bdff2).toString(16).padStart(6, '0')}`;
      button.appendChild(swatch);
    } else {
      const image = document.createElement('img');
      image.src = asset.url;
      image.alt = asset.name;
      image.draggable = false;
      button.appendChild(image);
    }

    const label = document.createElement('span');
    label.textContent = asset.name;

    button.append(label);
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

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
