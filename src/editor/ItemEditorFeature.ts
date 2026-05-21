import {
  BASE_ITEM_DEFINITIONS,
  type InventoryItemId,
  type ItemCategory,
  type ItemDefinition,
} from '../systems/inventory/ItemDefinitions';
import { loadEditorItemOverrides, saveEditorItemOverrides } from './ItemEditorStorage';
import type { EditorItemOverride } from './types';

const PANEL_SELECTOR = '.map-editor-panel';
const TAB_SELECTOR = '.map-editor-tabs';
const ITEM_TAB_ID = 'items';

type ItemEditorFieldValue = string | number | boolean;

type ItemCategoryOption = {
  id: ItemCategory | 'all';
  label: string;
};

type FieldDefinition = {
  key: string;
  label: string;
  type: 'number' | 'text' | 'checkbox';
  defaultValue: ItemEditorFieldValue;
  min?: number;
  max?: number;
  step?: number;
  note?: string;
};

const CATEGORY_OPTIONS: ItemCategoryOption[] = [
  { id: 'all', label: '전체' },
  { id: 'resource', label: '자원' },
  { id: 'crafting_material', label: '제작 재료' },
  { id: 'crafting_station', label: '제작 건물' },
  { id: 'building_part', label: '건설 전용' },
  { id: 'tool', label: '도구' },
  { id: 'weapon', label: '무기' },
  { id: 'equipment', label: '장비' },
  { id: 'consumable', label: '소모품' },
  { id: 'capture', label: '포획' },
  { id: 'pet', label: '펫' },
];

const CATEGORY_FIELDS: Record<ItemCategory, FieldDefinition[]> = {
  resource: [
    numberField('gatherYield', '채집량', 1, 1, 999, 1, '채집 1회당 기본 획득량'),
    numberField('respawnMs', '리스폰(ms)', 30000, 1000, 3600000, 1000),
    numberField('nodeHp', '노드 HP', 20, 1, 9999, 1),
  ],
  crafting_material: [
    numberField('materialTier', '재료 티어', 1, 1, 10, 1),
    numberField('craftingValue', '제작 가치', 1, 0, 999, 1),
    checkboxField('refinable', '가공 가능', false),
  ],
  crafting_station: [
    numberField('stationTier', '제작대 티어', 1, 1, 10, 1),
    numberField('craftSpeedMultiplier', '제작속도 배율', 1, 0.1, 10, 0.1),
    checkboxField('placeable', '월드 배치 가능', true),
    checkboxField('requiresPower', '전력 필요', false),
  ],
  building_part: [
    numberField('durability', '내구도', 100, 1, 99999, 1),
    numberField('placementCostMultiplier', '배치 비용 배율', 1, 0.1, 10, 0.1),
    checkboxField('blocksMovement', '이동 차단', true),
  ],
  tool: [
    numberField('toolPower', '도구 위력', 1, 1, 999, 1),
    numberField('staminaCost', '스태미나 소모', 5, 0, 999, 1),
    numberField('gatherBonus', '채집 보너스(%)', 0, 0, 1000, 1),
  ],
  weapon: [
    numberField('attackDamage', '공격력', 5, 1, 9999, 1),
    numberField('attackRange', '공격 범위', 70, 1, 2000, 1),
    numberField('attackCooldownMs', '공격 쿨(ms)', 600, 50, 10000, 50),
  ],
  equipment: [
    numberField('defense', '방어력', 1, 0, 9999, 1),
    numberField('maxHpBonus', 'HP 보너스', 0, 0, 9999, 1),
    numberField('maxStaminaBonus', '스태미나 보너스', 0, 0, 9999, 1),
  ],
  consumable: [
    numberField('restoreHp', 'HP 회복', 0, 0, 9999, 1),
    numberField('restoreStamina', '스태미나 회복', 0, 0, 9999, 1),
    numberField('useCooldownMs', '사용 쿨(ms)', 1000, 0, 60000, 100),
  ],
  capture: [
    numberField('capturePower', '포획력', 1, 1, 9999, 1),
    numberField('captureTier', '포획 티어', 1, 1, 10, 1),
    numberField('bonusChancePercent', '보너스 확률(%)', 0, 0, 100, 1),
  ],
  pet: [
    numberField('maxLevel', '최대 레벨', 50, 1, 999, 1),
    numberField('basePower', '기본 전투력', 1, 1, 9999, 1),
    checkboxField('canWorkAtBase', '거점 작업 가능', true),
  ],
};

export function installItemEditorFeature(root: HTMLElement = document.body): void {
  const feature = new ItemEditorFeature(root);
  feature.start();
}

class ItemEditorFeature {
  private readonly container = document.createElement('div');
  private panel: HTMLElement | null = null;
  private activeCategory: ItemCategory | 'all' = 'all';
  private selectedItemId: InventoryItemId = getAllItems()[0]?.id ?? 'wood';
  private observer: MutationObserver | null = null;

  constructor(private readonly root: HTMLElement) {
    this.container.className = 'map-editor-item-editor';
  }

  start(): void {
    this.observer = new MutationObserver(() => this.tryInstallIntoPanel());
    this.observer.observe(this.root, { childList: true, subtree: true });
    this.tryInstallIntoPanel();
  }

  private tryInstallIntoPanel(): void {
    const panel = this.root.querySelector<HTMLElement>(PANEL_SELECTOR);
    if (!panel) return;

    const tabs = panel.querySelector<HTMLElement>(TAB_SELECTOR);
    if (!tabs) return;

    this.panel = panel;
    this.ensureTab(tabs);
    if (!this.container.parentElement) panel.appendChild(this.container);
    this.container.hidden = true;
    this.render();
  }

  private ensureTab(tabs: HTMLElement): void {
    if (tabs.querySelector('[data-map-editor-tab="items"]')) return;

    const button = document.createElement('button');
    button.className = 'map-editor-tab';
    button.type = 'button';
    button.dataset.mapEditorTab = ITEM_TAB_ID;
    button.textContent = 'Items';
    button.onclick = () => this.activateItemsTab();
    tabs.appendChild(button);

    tabs.querySelectorAll<HTMLButtonElement>('.map-editor-tab:not([data-map-editor-tab="items"])').forEach((nativeTab) => {
      nativeTab.addEventListener('click', () => {
        this.container.hidden = true;
        button.classList.remove('is-active');
        this.restoreNativeSections();
      });
    });
  }

  private activateItemsTab(): void {
    if (!this.panel) return;

    this.panel.querySelectorAll('.map-editor-tab').forEach((tab) => tab.classList.remove('is-active'));
    this.panel.querySelector<HTMLElement>('[data-map-editor-tab="items"]')?.classList.add('is-active');

    this.hideNativeSections();
    this.container.hidden = false;
    this.render();
  }

  private hideNativeSections(): void {
    if (!this.panel) return;
    for (const child of [...this.panel.children]) {
      if (child === this.container) continue;
      if (child.classList.contains('map-editor-header')) continue;
      if (child.classList.contains('map-editor-tabs')) continue;
      (child as HTMLElement).hidden = true;
    }
  }

  private restoreNativeSections(): void {
    if (!this.panel) return;
    for (const child of [...this.panel.children]) {
      if (child === this.container) continue;
      (child as HTMLElement).hidden = false;
    }
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.append(
      this.createHeader(),
      this.createCategorySelect(),
      this.createItemSelect(),
      this.createItemList(),
      this.createCommonSection(),
      this.createCategorySection(),
      this.createExportSection(),
    );
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'map-editor-item-header';
    header.innerHTML = '<b>아이템 편집</b><span>월드맵 저장 시 서버 manifest에 함께 업로드됩니다.</span>';
    return header;
  }

  private createCategorySelect(): HTMLElement {
    const row = document.createElement('label');
    row.className = 'map-editor-item-field';

    const label = document.createElement('span');
    label.textContent = '카테고리';

    const select = document.createElement('select');
    select.value = this.activeCategory;
    select.addEventListener('pointerdown', stopEditorPointerPropagation);
    select.onchange = () => {
      this.activeCategory = select.value as ItemCategory | 'all';
      const items = this.getFilteredItems();
      if (!items.some((item) => item.id === this.selectedItemId) && items[0]) this.selectedItemId = items[0].id;
      this.render();
    };

    for (const option of CATEGORY_OPTIONS) {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      select.appendChild(item);
    }

    row.append(label, select);
    return row;
  }

  private createItemSelect(): HTMLElement {
    const row = document.createElement('label');
    row.className = 'map-editor-item-field';

    const label = document.createElement('span');
    label.textContent = '아이템';

    const select = document.createElement('select');
    select.value = this.selectedItemId;
    select.addEventListener('pointerdown', stopEditorPointerPropagation);
    select.onchange = () => {
      this.selectedItemId = select.value as InventoryItemId;
      this.render();
    };

    for (const itemDef of this.getFilteredItems()) {
      const option = document.createElement('option');
      option.value = itemDef.id;
      option.textContent = `${itemDef.icon} ${this.getEffectiveDefinition(itemDef.id).label}`;
      select.appendChild(option);
    }

    row.append(label, select);
    return row;
  }

  private createItemList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'map-editor-item-list';

    for (const itemDef of this.getFilteredItems()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-editor-item-list-item';
      if (itemDef.id === this.selectedItemId) button.classList.add('is-active');
      button.textContent = `${itemDef.icon} ${this.getEffectiveDefinition(itemDef.id).label}`;
      button.onclick = () => {
        this.selectedItemId = itemDef.id;
        this.render();
      };
      list.appendChild(button);
    }

    return list;
  }

  private createCommonSection(): HTMLElement {
    const itemDef = this.getEffectiveDefinition(this.selectedItemId);
    return this.createSection('공통 속성', [
      this.createTextField('이름', itemDef.label, (value) => this.patchSelected({ label: value })),
      this.createTextField('아이콘', itemDef.icon, (value) => this.patchSelected({ icon: value })),
      this.createTextAreaField('설명', itemDef.description, (value) => this.patchSelected({ description: value })),
      this.createCheckboxField('스택 가능', itemDef.stackable, (value) => this.patchSelected({ stackable: value })),
      this.createNumberField('최대 스택', itemDef.maxStack, 1, 9999, 1, (value) => this.patchSelected({ maxStack: Math.round(value) })),
    ]);
  }

  private createCategorySection(): HTMLElement {
    const itemDef = this.getEffectiveDefinition(this.selectedItemId);
    const fields = CATEGORY_FIELDS[itemDef.category] ?? [];
    const children = fields.map((field) => this.createCategoryField(field));
    return this.createSection(`${getCategoryLabel(itemDef.category)} 전용 기능`, children, '서버는 이 값을 world map itemOverrides로 수신합니다. 현재 서버 제작 시간은 제작 건물의 craftSpeedMultiplier를 반영합니다.');
  }

  private createCategoryField(field: FieldDefinition): HTMLElement {
    const override = this.getSelectedOverride();
    const value = override.fields?.[field.key] ?? field.defaultValue;

    if (field.type === 'checkbox') {
      return this.createCheckboxField(field.label, Boolean(value), (checked) => this.patchSelectedField(field.key, checked));
    }

    if (field.type === 'text') {
      return this.createTextField(field.label, String(value), (next) => this.patchSelectedField(field.key, next));
    }

    return this.createNumberField(field.label, Number(value), field.min ?? 0, field.max ?? 999999, field.step ?? 1, (next) => {
      this.patchSelectedField(field.key, next);
    }, field.note);
  }

  private createExportSection(): HTMLElement {
    const section = this.createSection('저장/내보내기', []);
    const buttons = document.createElement('div');
    buttons.className = 'map-editor-item-actions';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = 'JSON 복사';
    copyButton.onclick = () => void navigator.clipboard?.writeText(JSON.stringify(loadEditorItemOverrides(), null, 2));

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = '선택 초기화';
    resetButton.className = 'is-danger';
    resetButton.onclick = () => {
      saveEditorItemOverrides(loadEditorItemOverrides().filter((override) => override.id !== this.selectedItemId));
      this.render();
    };

    buttons.append(copyButton, resetButton);
    section.appendChild(buttons);
    return section;
  }

  private createSection(titleText: string, children: HTMLElement[], noteText?: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'map-editor-item-section';

    const title = document.createElement('div');
    title.className = 'map-editor-section-title';
    title.textContent = titleText;
    section.appendChild(title);

    if (noteText) {
      const note = document.createElement('div');
      note.className = 'map-editor-item-note';
      note.textContent = noteText;
      section.appendChild(note);
    }

    section.append(...children);
    return section;
  }

  private createTextField(labelText: string, value: string, onChange: (value: string) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'map-editor-item-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.onchange = () => onChange(input.value.trim());
    label.append(span, input);
    return label;
  }

  private createTextAreaField(labelText: string, value: string, onChange: (value: string) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'map-editor-item-field map-editor-item-textarea-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.rows = 3;
    textarea.onchange = () => onChange(textarea.value.trim());
    label.append(span, textarea);
    return label;
  }

  private createNumberField(labelText: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void, noteText?: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-editor-item-field-wrap';
    const label = document.createElement('label');
    label.className = 'map-editor-item-field';
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
    wrapper.appendChild(label);
    if (noteText) {
      const note = document.createElement('small');
      note.className = 'map-editor-item-field-note';
      note.textContent = noteText;
      wrapper.appendChild(note);
    }
    return wrapper;
  }

  private createCheckboxField(labelText: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'map-editor-item-check-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.onchange = () => onChange(input.checked);
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(input, span);
    return label;
  }

  private patchSelected(patch: Partial<EditorItemOverride>): void {
    const current = this.getSelectedOverride();
    this.upsertOverride({ ...current, ...patch, id: this.selectedItemId });
  }

  private patchSelectedField(key: string, value: ItemEditorFieldValue): void {
    const current = this.getSelectedOverride();
    this.upsertOverride({
      ...current,
      id: this.selectedItemId,
      fields: {
        ...(current.fields ?? {}),
        [key]: value,
      },
    });
  }

  private upsertOverride(next: EditorItemOverride): void {
    const overrides = loadEditorItemOverrides();
    const index = overrides.findIndex((override) => override.id === next.id);
    const updated = index >= 0
      ? overrides.map((override, i) => (i === index ? next : override))
      : [...overrides, next];
    saveEditorItemOverrides(updated);
    this.render();
  }

  private getSelectedOverride(): EditorItemOverride {
    return loadEditorItemOverrides().find((override) => override.id === this.selectedItemId) ?? { id: this.selectedItemId };
  }

  private getFilteredItems(): ItemDefinition[] {
    const items = getAllItems();
    if (this.activeCategory === 'all') return items;
    return items.filter((item) => this.getEffectiveDefinition(item.id).category === this.activeCategory);
  }

  private getEffectiveDefinition(itemId: InventoryItemId): ItemDefinition {
    const base = getAllItems().find((item) => item.id === itemId) ?? getAllItems()[0];
    const override = loadEditorItemOverrides().find((item) => item.id === itemId);
    return {
      ...base,
      label: override?.label ?? base.label,
      description: override?.description ?? base.description,
      icon: override?.icon ?? base.icon,
      category: override?.category ?? base.category,
      stackable: override?.stackable ?? base.stackable,
      maxStack: override?.maxStack ?? base.maxStack,
    };
  }
}

function getAllItems(): ItemDefinition[] {
  return Object.values(BASE_ITEM_DEFINITIONS).sort((a, b) => {
    const categoryOrder = getCategoryOrder(a.category) - getCategoryOrder(b.category);
    if (categoryOrder !== 0) return categoryOrder;
    return a.label.localeCompare(b.label, 'ko');
  });
}

function stopEditorPointerPropagation(event: Event): void {
  event.stopPropagation();
}

function numberField(key: string, label: string, defaultValue: number, min: number, max: number, step: number, note?: string): FieldDefinition {
  return { key, label, type: 'number', defaultValue, min, max, step, note };
}

function checkboxField(key: string, label: string, defaultValue: boolean): FieldDefinition {
  return { key, label, type: 'checkbox', defaultValue };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getCategoryOrder(category: ItemCategory): number {
  const index = CATEGORY_OPTIONS.findIndex((option) => option.id === category);
  return index >= 0 ? index : CATEGORY_OPTIONS.length;
}

function getCategoryLabel(category: ItemCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? category;
}
