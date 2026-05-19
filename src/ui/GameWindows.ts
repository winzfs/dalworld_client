import type { Inventory, ItemType } from '../protocol/messages';
import { BUILD_PART_LIST } from '../systems/building/BuildingParts';
import { BUILD_PART_ITEM_ENTRIES, getBuildPartItemDefinition } from '../systems/building/BuildPartInventoryCatalog';
import type { BuildingModeSnapshot } from '../systems/building/BuildingModeState';
import type { BuildPartId } from '../systems/building/BuildingTypes';
import { BASE_ITEM_DEFINITIONS, type ItemDefinition } from '../systems/inventory/ItemDefinitions';
import { CRAFTING_RECIPES } from '../systems/crafting/CraftingRecipes';

type WindowId = 'inventory' | 'crafting' | 'building';

type FloatingButtonConfig = {
  id: WindowId;
  label: string;
  icon: string;
  title: string;
  defaultButtonX: number;
  defaultButtonY: number;
  defaultWindowX: number;
  defaultWindowY: number;
};

type InventoryItemView = {
  item: ItemType;
  definition: ItemDefinition;
  amount: number;
};

export type GameWindowsOptions = {
  onSelectBuildPart?: (partId: BuildPartId) => void;
  onEnterRemoveMode?: () => void;
  onExitBuildingMode?: () => void;
  onRotateBuildingPart?: () => void;
  onSetBuildingLayer?: (z: number) => void;
};

const WINDOW_ROOT_ID = 'dalworld-windows';
const INVENTORY_CATEGORIES = ['일반', '사용', '장비', '제작', '건설', '펫'] as const;
const INVENTORY_SLOT_COUNT = 36;

const BUTTONS: FloatingButtonConfig[] = [
  { id: 'inventory', label: '가방', icon: '🎒', title: '가방', defaultButtonX: 18, defaultButtonY: 180, defaultWindowX: 96, defaultWindowY: 120 },
  { id: 'crafting', label: '제작', icon: '⚒️', title: '제작', defaultButtonX: 18, defaultButtonY: 252, defaultWindowX: 160, defaultWindowY: 150 },
  { id: 'building', label: '건설', icon: '🏠', title: '건설', defaultButtonX: 18, defaultButtonY: 324, defaultWindowX: 220, defaultWindowY: 180 },
];

export class GameWindows {
  private readonly root: HTMLDivElement;
  private readonly options: GameWindowsOptions;
  private zIndex = 30;
  private selectedItem: ItemType | null = null;
  private selectedBuildPart: BuildPartId | null = null;
  private activeInventoryCategory = '일반';
  private lastInventory: Inventory | null = null;
  private buildingMode: BuildingModeSnapshot = {
    enabled: false,
    toolMode: 'place',
    selectedPartId: null,
    rotation: 0,
    currentZ: 0,
  };

  constructor(options: GameWindowsOptions = {}) {
    this.options = options;
    this.root = createOrGetRoot();
    this.root.innerHTML = getWindowsMarkup();
    this.installFloatingButtons();
    this.installWindows();
    this.installInventoryInteractions();
    this.installBuildingInteractions();
    this.renderBuildingMode(this.buildingMode);
  }

  renderInventory(inventory: Inventory | null): void {
    this.lastInventory = inventory;

    const slots = [...this.root.querySelectorAll<HTMLButtonElement>('[data-inventory-slot]')];
    const resourceItems = this.activeInventoryCategory === '일반' ? getGeneralInventoryItems(inventory) : [];
    const buildParts = this.activeInventoryCategory === '건설' ? BUILD_PART_ITEM_ENTRIES : [];

    for (const [index, slot] of slots.entries()) {
      const resourceItem = resourceItems[index];
      const buildPartEntry = buildParts[index];
      slot.innerHTML = '';
      slot.classList.remove('has-item', 'is-build-part', 'is-selected');
      slot.dataset.item = '';
      slot.dataset.buildInventoryPart = '';
      slot.title = `슬롯 ${index + 1}`;

      if (resourceItem) {
        slot.classList.add('has-item');
        slot.dataset.item = resourceItem.item;
        slot.title = `${resourceItem.definition.label} x${resourceItem.amount}`;
        slot.innerHTML = `
          <span class="inventory-item-icon">${resourceItem.definition.icon}</span>
          <span class="inventory-item-count">${resourceItem.amount}</span>
        `;
        continue;
      }

      if (buildPartEntry) {
        const selected = this.buildingMode.enabled &&
          this.buildingMode.toolMode === 'place' &&
          this.buildingMode.selectedPartId === buildPartEntry.buildPartId;
        slot.classList.add('has-item', 'is-build-part');
        slot.classList.toggle('is-selected', selected);
        slot.dataset.buildInventoryPart = buildPartEntry.buildPartId;
        slot.title = `${buildPartEntry.definition.label} 선택`;
        slot.innerHTML = `
          <span class="inventory-item-icon">${buildPartEntry.definition.icon}</span>
          <span class="inventory-build-label">${buildPartEntry.definition.label}</span>
        `;
      }
    }

    if (this.selectedItem && this.activeInventoryCategory === '일반') {
      const selected = resourceItems.find((item) => item.item === this.selectedItem);
      if (selected) this.renderItemDetail(selected);
    }

    if (this.selectedBuildPart && this.activeInventoryCategory === '건설') {
      this.renderBuildPartDetail(this.selectedBuildPart);
    }

    this.renderBuildingMode(this.buildingMode);
  }

  renderBuildingMode(mode: BuildingModeSnapshot): void {
    this.buildingMode = mode;

    const status = query<HTMLDivElement>(this.root, '[data-building-status]');
    const layer = query<HTMLSpanElement>(this.root, '[data-building-layer]');
    const rotation = query<HTMLSpanElement>(this.root, '[data-building-rotation]');
    const removeButton = query<HTMLButtonElement>(this.root, '[data-building-remove-mode]');
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-build-part]')];
    const inventoryBuildSlots = [...this.root.querySelectorAll<HTMLButtonElement>('[data-build-inventory-part], [data-build-inventory-part=""]')];

    status.textContent = getBuildingStatusText(mode);
    status.classList.toggle('is-active', mode.enabled);
    status.classList.toggle('is-remove-mode', mode.enabled && mode.toolMode === 'remove');
    layer.textContent = String(mode.currentZ);
    rotation.textContent = String(mode.rotation);
    removeButton.classList.toggle('is-selected', mode.enabled && mode.toolMode === 'remove');

    for (const button of buttons) {
      const partId = button.dataset.buildPart as BuildPartId;
      const part = BUILD_PART_LIST.find((candidate) => candidate.id === partId);
      if (!part) continue;

      const selected = mode.enabled && mode.toolMode === 'place' && mode.selectedPartId === partId;
      const canAfford = canAffordBuildPart(this.lastInventory, part.placementCost);
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-disabled-by-cost', !canAfford);
      button.disabled = false;
      button.title = canAfford ? `${part.label} 배치` : `${part.label} 선택 가능 · 배치는 서버에서 재료 검증`;
    }

    for (const slot of inventoryBuildSlots) {
      const partId = slot.dataset.buildInventoryPart as BuildPartId | '';
      if (!partId) continue;
      const selected = mode.enabled && mode.toolMode === 'place' && mode.selectedPartId === partId;
      slot.classList.toggle('is-selected', selected);
    }
  }

  private installFloatingButtons(): void {
    for (const config of BUTTONS) {
      const button = query<HTMLButtonElement>(this.root, `[data-floating="${config.id}"]`);
      setDefaultPosition(button, config.defaultButtonX, config.defaultButtonY);
      makeDraggable(button, button, () => undefined);

      button.addEventListener('click', (event) => {
        if (wasDragClickSuppressed(event)) return;
        this.toggleWindow(config.id);
      });
    }
  }

  private installWindows(): void {
    for (const config of BUTTONS) {
      const win = query<HTMLDivElement>(this.root, `[data-window="${config.id}"]`);
      const header = query<HTMLDivElement>(win, '[data-window-header]');
      const close = query<HTMLButtonElement>(win, '[data-window-close]');

      setDefaultPosition(win, config.defaultWindowX, config.defaultWindowY);
      makeDraggable(win, header, () => this.bringToFront(win));

      header.addEventListener('pointerdown', () => this.bringToFront(win));
      close.addEventListener('click', () => this.closeWindow(config.id));
    }
  }

  private installInventoryInteractions(): void {
    const inventory = query<HTMLDivElement>(this.root, '[data-window="inventory"]');
    const tabs = [...inventory.querySelectorAll<HTMLButtonElement>('[data-inventory-tab]')];
    const slots = [...inventory.querySelectorAll<HTMLButtonElement>('[data-inventory-slot]')];
    const detailTitle = query<HTMLHeadingElement>(inventory, '[data-inventory-detail-title]');
    const detailBody = query<HTMLParagraphElement>(inventory, '[data-inventory-detail-body]');

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const other of tabs) other.classList.toggle('is-active', other === tab);
        this.activeInventoryCategory = tab.dataset.inventoryTab ?? '일반';
        this.selectedItem = null;
        this.selectedBuildPart = null;
        detailTitle.textContent = `${this.activeInventoryCategory} 가방`;
        detailBody.textContent = this.activeInventoryCategory === '일반'
          ? '채집한 자원이 이곳에 표시됩니다.'
          : this.activeInventoryCategory === '건설'
            ? '건설 부품을 선택하면 건설모드로 진입합니다.'
            : '아직 서버 데이터가 연결되지 않은 카테고리입니다.';
        this.renderInventory(this.lastInventory);
      });
    }

    for (const slot of slots) {
      slot.addEventListener('click', () => {
        for (const other of slots) other.classList.toggle('is-selected', other === slot);

        const buildPartId = slot.dataset.buildInventoryPart as BuildPartId | '';
        if (buildPartId) {
          this.selectedItem = null;
          this.selectedBuildPart = buildPartId;
          this.renderBuildPartDetail(buildPartId);
          this.options.onSelectBuildPart?.(buildPartId);
          this.renderBuildingMode({ ...this.buildingMode, enabled: true, toolMode: 'place', selectedPartId: buildPartId });
          return;
        }

        const itemType = slot.dataset.item as ItemType | '';
        if (!itemType) {
          this.selectedItem = null;
          this.selectedBuildPart = null;
          const index = Number(slot.dataset.inventorySlot ?? '0') + 1;
          detailTitle.textContent = `빈 슬롯 ${index}`;
          detailBody.textContent = this.activeInventoryCategory === '건설' ? '이 슬롯에는 아직 건설 부품이 없습니다.' : '아직 아이템이 없는 빈 슬롯입니다.';
          return;
        }

        this.selectedBuildPart = null;
        this.selectedItem = itemType;
        const definition = BASE_ITEM_DEFINITIONS[itemType];
        const countText = slot.querySelector('.inventory-item-count')?.textContent ?? '0';
        if (!definition) return;
        this.renderItemDetail({ item: itemType, definition, amount: Number(countText) });
      });
    }
  }

  private installBuildingInteractions(): void {
    const building = query<HTMLDivElement>(this.root, '[data-window="building"]');
    const partButtons = [...building.querySelectorAll<HTMLButtonElement>('[data-build-part]')];
    const exitButton = query<HTMLButtonElement>(building, '[data-building-exit]');
    const rotateButton = query<HTMLButtonElement>(building, '[data-building-rotate]');
    const removeButton = query<HTMLButtonElement>(building, '[data-building-remove-mode]');
    const layerDownButton = query<HTMLButtonElement>(building, '[data-building-layer-down]');
    const layerUpButton = query<HTMLButtonElement>(building, '[data-building-layer-up]');

    for (const button of partButtons) {
      button.addEventListener('click', () => {
        const partId = button.dataset.buildPart as BuildPartId;
        this.selectedBuildPart = partId;
        this.renderBuildPartDetail(partId);
        this.options.onSelectBuildPart?.(partId);
        this.renderBuildingMode({ ...this.buildingMode, enabled: true, toolMode: 'place', selectedPartId: partId });
      });
    }

    removeButton.addEventListener('click', () => {
      this.options.onEnterRemoveMode?.();
      this.renderBuildingMode({ ...this.buildingMode, enabled: true, toolMode: 'remove', selectedPartId: null });
    });

    exitButton.addEventListener('click', () => {
      this.options.onExitBuildingMode?.();
      this.renderBuildingMode({ ...this.buildingMode, enabled: false, toolMode: 'place', selectedPartId: null });
    });

    rotateButton.addEventListener('click', () => this.options.onRotateBuildingPart?.());
    layerDownButton.addEventListener('click', () => this.options.onSetBuildingLayer?.(Math.max(0, this.buildingMode.currentZ - 1)));
    layerUpButton.addEventListener('click', () => this.options.onSetBuildingLayer?.(this.buildingMode.currentZ + 1));
  }

  private renderItemDetail(item: InventoryItemView): void {
    const inventory = query<HTMLDivElement>(this.root, '[data-window="inventory"]');
    const detailTitle = query<HTMLHeadingElement>(inventory, '[data-inventory-detail-title]');
    const detailBody = query<HTMLParagraphElement>(inventory, '[data-inventory-detail-body]');
    detailTitle.textContent = `${item.definition.label} x${item.amount}`;
    detailBody.textContent = item.definition.description;
  }

  private renderBuildPartDetail(partId: BuildPartId): void {
    const inventory = query<HTMLDivElement>(this.root, '[data-window="inventory"]');
    const detailTitle = query<HTMLHeadingElement>(inventory, '[data-inventory-detail-title]');
    const detailBody = query<HTMLParagraphElement>(inventory, '[data-inventory-detail-body]');
    const part = BUILD_PART_LIST.find((candidate) => candidate.id === partId);
    if (!part) return;
    const item = getBuildPartItemDefinition(partId);
    detailTitle.textContent = `${item.icon} ${item.label}`;
    detailBody.textContent = `${item.description} · 클릭하면 건설모드로 진입합니다.`;
  }

  private toggleWindow(id: WindowId): void {
    const win = query<HTMLDivElement>(this.root, `[data-window="${id}"]`);
    const nextOpen = win.hidden;
    win.hidden = !nextOpen;
    if (nextOpen) this.bringToFront(win);
  }

  private closeWindow(id: WindowId): void {
    query<HTMLDivElement>(this.root, `[data-window="${id}"]`).hidden = true;
  }

  private bringToFront(win: HTMLElement): void {
    win.style.zIndex = String(++this.zIndex);
  }
}

function getGeneralInventoryItems(inventory: Inventory | null): InventoryItemView[] {
  if (!inventory) return [];
  return (['wood', 'stone'] as ItemType[])
    .map((item) => ({ item, definition: BASE_ITEM_DEFINITIONS[item], amount: inventory[item] ?? 0 }))
    .filter((item): item is InventoryItemView => Boolean(item.definition && item.amount > 0));
}

function createOrGetRoot(): HTMLDivElement {
  let root = document.getElementById(WINDOW_ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = WINDOW_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

function getWindowsMarkup(): string {
  return `
    <div class="floating-toolbar" aria-label="Game menu shortcuts">
      ${BUTTONS.map(getFloatingButtonMarkup).join('')}
    </div>
    ${getInventoryWindowMarkup()}
    ${getCraftingWindowMarkup()}
    ${getBuildingWindowMarkup()}
  `;
}

function getFloatingButtonMarkup(config: FloatingButtonConfig): string {
  return `
    <button class="floating-icon" type="button" data-floating="${config.id}" aria-label="${config.label}">
      <span class="floating-icon-symbol">${config.icon}</span>
      <span class="floating-icon-label">${config.label}</span>
    </button>
  `;
}

function getWindowHeaderMarkup(title: string): string {
  return `
    <div class="game-window-header" data-window-header>
      <strong>${title}</strong>
      <button class="game-window-close" type="button" data-window-close aria-label="닫기">×</button>
    </div>
  `;
}

function getInventoryWindowMarkup(): string {
  return `
    <section class="game-window inventory-window" data-window="inventory" hidden>
      ${getWindowHeaderMarkup('가방')}
      <div class="inventory-tabs">
        ${INVENTORY_CATEGORIES.map((category, index) => `
          <button class="inventory-tab ${index === 0 ? 'is-active' : ''}" type="button" data-inventory-tab="${category}">${category}</button>
        `).join('')}
      </div>
      <div class="inventory-body">
        <div class="inventory-grid" aria-label="Inventory slots">
          ${Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => `
            <button class="inventory-slot" type="button" data-inventory-slot="${index}" aria-label="슬롯 ${index + 1}"></button>
          `).join('')}
        </div>
        <aside class="inventory-detail">
          <h3 data-inventory-detail-title>일반 가방</h3>
          <p data-inventory-detail-body>채집한 자원이 이곳에 표시됩니다.</p>
        </aside>
      </div>
    </section>
  `;
}

function getCraftingWindowMarkup(): string {
  return `
    <section class="game-window simple-system-window crafting-window" data-window="crafting" hidden>
      ${getWindowHeaderMarkup('제작')}
      <div class="system-window-body">
        <h3>제작 시스템</h3>
        <p>제작 레시피 정의가 분리되었습니다. 서버 제작 검증 연결 전까지는 목록 미리보기만 표시합니다.</p>
        <div class="placeholder-grid">
          ${CRAFTING_RECIPES.slice(0, 8).map((recipe) => `<button class="placeholder-card" type="button" title="${recipe.label}">${recipe.outputs[0]?.quantity ?? 1}</button>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function getBuildingWindowMarkup(): string {
  return `
    <section class="game-window simple-system-window building-window" data-window="building" hidden>
      ${getWindowHeaderMarkup('건설')}
      <div class="system-window-body building-system-body">
        <div class="building-mode-status" data-building-status>부품을 선택하면 건설모드로 진입합니다.</div>
        <div class="building-controls">
          <button type="button" class="building-control" data-building-layer-down>층 -</button>
          <span class="building-control-readout">Z <b data-building-layer>0</b></span>
          <button type="button" class="building-control" data-building-layer-up>층 +</button>
          <button type="button" class="building-control" data-building-rotate>회전</button>
          <span class="building-control-readout">R <b data-building-rotation>0</b></span>
          <button type="button" class="building-control is-danger" data-building-remove-mode>철거</button>
          <button type="button" class="building-control is-danger" data-building-exit>해제</button>
        </div>
        <div class="building-part-grid" aria-label="건설 부품 목록">
          ${BUILD_PART_LIST.map((part) => `
            <button class="building-part-card" type="button" data-build-part="${part.id}">
              <span class="building-part-icon">${part.icon}</span>
              <span class="building-part-main">
                <strong>${part.label}</strong>
                <small>${part.placementCost.map((cost) => `${getBuildCostLabel(cost.itemId)} ${cost.quantity}`).join(' · ')}</small>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing UI element: ${selector}`);
  return el;
}

function setDefaultPosition(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function makeDraggable(target: HTMLElement, handle: HTMLElement, onStart: () => void): void {
  let drag: { startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    onStart();
    handle.setPointerCapture(event.pointerId);
    drag = { startX: event.clientX, startY: event.clientY, originX: target.offsetLeft, originY: target.offsetTop, moved: false };
    target.dataset.dragging = 'true';
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    const maxX = Math.max(0, window.innerWidth - target.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - target.offsetHeight);
    target.style.left = `${clamp(drag.originX + dx, 0, maxX)}px`;
    target.style.top = `${clamp(drag.originY + dy, 0, maxY)}px`;
  });

  handle.addEventListener('pointerup', (event) => {
    if (!drag) return;
    target.dataset.suppressClick = drag.moved ? 'true' : 'false';
    target.dataset.dragging = 'false';
    drag = null;
    handle.releasePointerCapture(event.pointerId);
    window.setTimeout(() => { target.dataset.suppressClick = 'false'; }, 0);
  });

  handle.addEventListener('pointercancel', () => {
    drag = null;
    target.dataset.dragging = 'false';
  });
}

function wasDragClickSuppressed(event: Event): boolean {
  const target = event.currentTarget as HTMLElement | null;
  return target?.dataset.suppressClick === 'true';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function canAffordBuildPart(inventory: Inventory | null, costs: { itemId: string; quantity: number }[]): boolean {
  if (!inventory) return false;
  return costs.every((cost) => {
    if (cost.itemId !== 'wood' && cost.itemId !== 'stone') return false;
    return (inventory[cost.itemId] ?? 0) >= cost.quantity;
  });
}

function getBuildingStatusText(mode: BuildingModeSnapshot): string {
  if (!mode.enabled) return '부품을 선택하면 건설모드로 진입합니다.';
  if (mode.toolMode === 'remove') return '철거모드: 제거할 건설물을 클릭하세요.';
  return mode.selectedPartId ? `건설모드: ${getBuildPartLabel(mode.selectedPartId)} 선택됨` : '부품을 선택하면 건설모드로 진입합니다.';
}

function getBuildPartLabel(partId: BuildPartId): string {
  return BUILD_PART_LIST.find((part) => part.id === partId)?.label ?? partId;
}

function getBuildCostLabel(itemId: string): string {
  const definition = BASE_ITEM_DEFINITIONS[itemId];
  if (definition) return definition.label;
  return itemId;
}
