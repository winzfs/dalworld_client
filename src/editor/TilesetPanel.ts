import { TILESET_CATEGORIES } from './tilesetManifest';
import type {
  EditorLayerId,
  EditorMonsterSpecOverrides,
  EditorMonsterSpawnRule,
  EditorMonsterType,
  EditorPlacementGameplay,
  EditorTilesetAsset,
} from './types';
import { EditorState, BLACK_SOLID_ASSET } from './EditorState';
import { MonsterSpawnControls } from './MonsterSpawnControls';
import {
  EDITOR_MONSTER_STAT_LABELS,
  getEditorMonsterDefaultStats,
  type EditorMonsterDefaultStats,
} from './MonsterDefaultStats';

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

const MONSTER_OPTIONS: Array<{ id: EditorMonsterType; label: string; color: number }> = [
  { id: 'wild_slime', label: 'Wild Slime', color: 0x7bdff2 },
  { id: 'sheep', label: 'Sheep', color: 0xf6f1df },
];

const GRID_SIZE_OPTIONS = [16, 32, 64];
const MONSTER_CATEGORY_ID = 'monsters';
const SPEC_KEYS: Array<keyof EditorMonsterDefaultStats> = [
  'maxHp',
  'moveSpeed',
  'detectRange',
  'loseRange',
  'attackRange',
  'attackDamage',
  'attackCooldownMs',
];

type PanelTab = 'tiles' | 'monsters';
type MonsterRegionSpawnDefaults = Extract<EditorPlacementGameplay, { kind: 'monsterSpawn' }>;
type SpecKey = keyof EditorMonsterSpecOverrides;

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
  private readonly monsterEditorContainer: HTMLDivElement;
  private readonly assetContainer: HTMLDivElement;
  private readonly monsterSpawnControls: MonsterSpawnControls;

  private activeTab: PanelTab = 'tiles';
  private selectedMonsterType: EditorMonsterType = 'wild_slime';
  private readonly regionSpawnDefaults = new Map<EditorMonsterType, MonsterRegionSpawnDefaults>([
    ['wild_slime', createDefaultRegionSpawn('wild_slime')],
    ['sheep', createDefaultRegionSpawn('sheep')],
  ]);
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

    this.monsterEditorContainer = document.createElement('div');
    this.monsterEditorContainer.className = 'map-editor-monster-editor';

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
      this.monsterEditorContainer,
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
    this.renderMonsterEditor();
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

    this.scaleContainer.hidden = isMonsters;
    this.gridContainer.hidden = false;
    this.layerContainer.hidden = isMonsters;
    this.toolContainer.hidden = isMonsters;
    this.fillContainer.hidden = isMonsters;
    this.categoryContainer.hidden = isMonsters;
    this.assetContainer.hidden = isMonsters;
    this.monsterEditorContainer.hidden = !isMonsters;

    if (isMonsters) {
      this.monsterSpawnControls.element.hidden = true;
    } else if (this.state.selectedBrush?.asset.gameplayDefaults?.kind !== 'monsterSpawn') {
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

  private renderMonsterEditor(): void {
    this.monsterEditorContainer.innerHTML = '';

    const selectedOption = getMonsterOption(this.selectedMonsterType);
    const worldRule = this.getSelectedWorldRule();
    const region = this.getSelectedRegionDefaults();

    this.monsterEditorContainer.append(
      this.createMonsterSelect(),
      this.createDefaultStatsSection(),
      this.createMonsterSection('전체맵 스폰', [
        this.createCheckboxField('전체맵에 스폰', worldRule.enabled, (checked) => {
          this.patchSelectedWorldRule({ enabled: checked });
        }),
        this.createNumberField('최대 유지', worldRule.maxAlive, 0, 500, 1, (value) => {
          this.patchSelectedWorldRule({ maxAlive: Math.round(value) });
        }),
        this.createNumberField('시간당', worldRule.spawnsPerHour, 1, 36000, 1, (value) => {
          this.patchSelectedWorldRule({ spawnsPerHour: Math.round(value) });
        }),
      ], '체크하면 이 몬스터가 전체 월드맵에서 자동으로 보충됩니다.'),
      this.createMonsterSection('스폰지역 배치', [
        this.createNumberField('반경', region.spawnRadius, 16, 2000, 10, (value) => {
          this.patchSelectedRegion({ spawnRadius: value });
        }),
        this.createNumberField('최대 수', region.maxAlive, 1, 50, 1, (value) => {
          this.patchSelectedRegion({ maxAlive: Math.round(value) });
        }),
        this.createNumberField('리스폰(ms)', region.respawnMs, 1000, 3600000, 1000, (value) => {
          this.patchSelectedRegion({ respawnMs: value });
        }),
        this.createNumberField('시간당', region.spawnsPerHour ?? 120, 1, 3600, 1, (value) => {
          this.patchSelectedRegion({ spawnsPerHour: Math.round(value) });
        }),
        this.createSpawnRegionButton(selectedOption),
      ], '버튼을 누른 뒤 맵에 클릭하면 해당 몬스터 스폰지역이 배치됩니다.'),
      this.createMonsterSection('몬스터 스펙 오버라이드', [
        this.createSpecField('HP', 'maxHp'),
        this.createSpecField('이동속도', 'moveSpeed'),
        this.createSpecField('감지범위', 'detectRange'),
        this.createSpecField('추적해제', 'loseRange'),
        this.createSpecField('공격범위', 'attackRange'),
        this.createSpecField('공격력', 'attackDamage'),
        this.createSpecField('공격쿨(ms)', 'attackCooldownMs'),
      ], '비워두면 위의 서버 기본 스펙을 사용합니다. 입력한 값은 전체스폰과 새로 배치하는 스폰지역에 같이 적용됩니다.'),
    );
  }

  private createMonsterSelect(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-editor-monster-select-block';

    const label = document.createElement('label');
    label.className = 'map-editor-monster-select-row';

    const text = document.createElement('span');
    text.textContent = '몬스터';

    const select = document.createElement('select');
    select.value = this.selectedMonsterType;
    select.addEventListener('pointerdown', (event) => event.stopPropagation());
    select.addEventListener('mousedown', (event) => event.stopPropagation());
    select.addEventListener('click', (event) => event.stopPropagation());

    for (const option of MONSTER_OPTIONS) {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      select.appendChild(item);
    }

    const applySelection = () => {
      const next = select.value as EditorMonsterType;
      if (next === this.selectedMonsterType) return;
      this.selectedMonsterType = next;
      window.requestAnimationFrame(() => this.render());
    };

    select.oninput = applySelection;
    select.onchange = applySelection;

    label.append(text, select);
    wrapper.append(label, this.createMonsterButtonList());
    return wrapper;
  }

  private createMonsterButtonList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'map-editor-monster-list';

    for (const option of MONSTER_OPTIONS) {
      const button = document.createElement('button');
      button.className = 'map-editor-monster-list-item';
      if (option.id === this.selectedMonsterType) button.classList.add('is-active');
      button.type = 'button';
      button.textContent = option.label;
      button.onclick = () => {
        if (option.id === this.selectedMonsterType) return;
        this.selectedMonsterType = option.id;
        this.render();
      };
      list.appendChild(button);
    }

    return list;
  }

  private createDefaultStatsSection(): HTMLElement {
    const stats = getEditorMonsterDefaultStats(this.selectedMonsterType);
    const rows = SPEC_KEYS.map((key) => this.createDefaultStatRow(key, stats[key]));
    return this.createMonsterSection('서버 기본 스펙', rows, '서버 MonsterDefinitions 기준 표시값입니다. 실제 판정은 서버가 확정합니다.');
  }

  private createDefaultStatRow(key: keyof EditorMonsterDefaultStats, value: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'map-editor-monster-default-stat';

    const label = document.createElement('span');
    label.textContent = EDITOR_MONSTER_STAT_LABELS[key];

    const number = document.createElement('b');
    number.textContent = String(value);

    row.append(label, number);
    return row;
  }

  private createMonsterSection(titleText: string, children: HTMLElement[], noteText?: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'map-editor-monster-section';

    const title = document.createElement('div');
    title.className = 'map-editor-section-title';
    title.textContent = titleText;
    section.appendChild(title);

    if (noteText) {
      const note = document.createElement('div');
      note.className = 'map-editor-monster-note';
      note.textContent = noteText;
      section.appendChild(note);
    }

    section.append(...children);
    return section;
  }

  private createCheckboxField(labelText: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'map-editor-monster-check-row';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.onchange = () => onChange(input.checked);

    const span = document.createElement('span');
    span.textContent = labelText;

    label.append(input, span);
    return label;
  }

  private createNumberField(
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const label = document.createElement('label');
    label.className = 'map-editor-monster-field';

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

  private createSpecField(labelText: string, key: SpecKey): HTMLElement {
    const value = this.getSelectedSpec()[key];
    const defaultValue = getEditorMonsterDefaultStats(this.selectedMonsterType)[key as keyof EditorMonsterDefaultStats];
    const label = document.createElement('label');
    label.className = 'map-editor-monster-field map-editor-monster-spec-field';

    const span = document.createElement('span');
    span.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.placeholder = `기본 ${defaultValue}`;
    input.value = value === undefined ? '' : String(value);
    input.title = `비우면 서버 기본값 ${defaultValue} 사용`;
    input.onchange = () => {
      const raw = input.value.trim();
      const nextSpec = { ...this.getSelectedSpec() };
      if (!raw) delete nextSpec[key];
      else nextSpec[key] = Math.max(1, Math.round(Number(raw) || 1));
      this.patchSelectedSpec(Object.keys(nextSpec).length > 0 ? nextSpec : undefined);
    };

    const hint = document.createElement('small');
    hint.className = 'map-editor-monster-default-hint';
    hint.textContent = `기본 ${defaultValue}`;

    label.append(span, input, hint);
    return label;
  }

  private createSpawnRegionButton(option: { id: EditorMonsterType; label: string; color: number }): HTMLElement {
    const button = document.createElement('button');
    button.className = 'map-editor-monster-spawn-region-button';
    button.textContent = `${option.label} 스폰지역 배치`;
    button.onclick = () => {
      this.state.setLayer('object');
      this.state.setBrushScale(1);
      this.actions.onPickAsset(createSpawnRegionAsset(option, this.getSelectedRegionDefaults(), this.getSelectedSpec()));
    };
    return button;
  }

  private getSelectedWorldRule(): EditorMonsterSpawnRule {
    return this.actions.getMonsterSpawnRules().find((rule) => rule.monsterType === this.selectedMonsterType && rule.scope === 'world')
      ?? createDefaultWorldRule(this.selectedMonsterType);
  }

  private patchSelectedWorldRule(patch: Partial<EditorMonsterSpawnRule>): void {
    const rules = this.actions.getMonsterSpawnRules();
    const index = rules.findIndex((rule) => rule.monsterType === this.selectedMonsterType && rule.scope === 'world');
    const current = index >= 0 ? rules[index] : createDefaultWorldRule(this.selectedMonsterType);
    const next = { ...current, ...patch, monsterType: this.selectedMonsterType, scope: 'world' as const };
    const nextRules = index >= 0 ? rules.map((rule, i) => (i === index ? next : rule)) : [...rules, next];
    this.actions.setMonsterSpawnRules(nextRules);
    this.render();
  }

  private getSelectedRegionDefaults(): MonsterRegionSpawnDefaults {
    const current = this.regionSpawnDefaults.get(this.selectedMonsterType) ?? createDefaultRegionSpawn(this.selectedMonsterType);
    return { ...current, spec: current.spec ? { ...current.spec } : undefined };
  }

  private patchSelectedRegion(patch: Partial<MonsterRegionSpawnDefaults>): void {
    const current = this.getSelectedRegionDefaults();
    this.regionSpawnDefaults.set(this.selectedMonsterType, {
      ...current,
      ...patch,
      kind: 'monsterSpawn',
      monsterType: this.selectedMonsterType,
    });
    this.render();
  }

  private getSelectedSpec(): EditorMonsterSpecOverrides {
    return {
      ...(this.getSelectedRegionDefaults().spec ?? {}),
      ...(this.getSelectedWorldRule().spec ?? {}),
    };
  }

  private patchSelectedSpec(spec: EditorMonsterSpecOverrides | undefined): void {
    this.patchSelectedWorldRule({ spec });
    const current = this.getSelectedRegionDefaults();
    this.regionSpawnDefaults.set(this.selectedMonsterType, { ...current, spec });
    this.render();
  }

  private renderAssets(): void {
    this.assetContainer.innerHTML = '';
    if (this.activeTab === 'monsters') return;

    const category = TILESET_CATEGORIES.find((item) => item.id === this.state.activeCategoryId);

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

function createDefaultWorldRule(monsterType: EditorMonsterType): EditorMonsterSpawnRule {
  return {
    id: `world-spawn-${monsterType}`,
    enabled: false,
    monsterType,
    scope: 'world',
    maxAlive: monsterType === 'sheep' ? 8 : 12,
    spawnsPerHour: monsterType === 'sheep' ? 30 : 60,
  };
}

function createDefaultRegionSpawn(monsterType: EditorMonsterType): MonsterRegionSpawnDefaults {
  return {
    kind: 'monsterSpawn',
    monsterType,
    spawnRadius: 160,
    maxAlive: 3,
    respawnMs: 30_000,
    spawnsPerHour: 120,
  };
}

function createSpawnRegionAsset(
  option: { id: EditorMonsterType; label: string; color: number },
  region: MonsterRegionSpawnDefaults,
  spec: EditorMonsterSpecOverrides,
): EditorTilesetAsset {
  const gameplayDefaults: MonsterRegionSpawnDefaults = {
    ...region,
    monsterType: option.id,
  };
  if (Object.keys(spec).length > 0) gameplayDefaults.spec = { ...spec };

  return {
    id: `monster-spawn-${option.id}`,
    name: `${option.label} Spawn Region`,
    categoryId: MONSTER_CATEGORY_ID,
    url: `solid://monster-spawn-${option.id}`,
    tileWidth: 32,
    tileHeight: 32,
    solidColor: option.color,
    gameplayDefaults,
  };
}

function getMonsterOption(type: EditorMonsterType): { id: EditorMonsterType; label: string; color: number } {
  return MONSTER_OPTIONS.find((option) => option.id === type) ?? MONSTER_OPTIONS[0];
}

function normalizeChance(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
