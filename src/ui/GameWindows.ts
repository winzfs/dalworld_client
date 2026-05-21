import type { PlayerSnapshot } from '../protocol/messages';
import { BUILD_PART_LIST } from '../systems/building/BuildingParts';
import { getBuildPartItemDefinition } from '../systems/building/BuildPartInventoryCatalog';
import type { BuildingModeSnapshot } from '../systems/building/BuildingModeState';
import type { BuildPartDefinition, BuildPartId } from '../systems/building/BuildingTypes';
import type { CraftingRecipeCategory, CraftingRecipeId, CraftingTier } from '../systems/crafting/CraftingTypes';
import { getCraftingCategories } from '../systems/crafting/CraftingViewModel';
import { type ItemDefinition } from '../systems/inventory/ItemDefinitions';
import { getRuntimeItemDefinition } from '../systems/inventory/ItemRuntimeOverrides';
import {
  getInventorySlotsForTab,
  INVENTORY_TABS,
  normalizeInventoryStacks,
  type InventoryBuildPartSlotView,
  type InventoryResourceSlotView,
  type InventorySource,
  type InventoryTabId,
} from '../systems/inventory/InventoryViewModel';

type WindowId = 'character' | 'inventory' | 'crafting' | 'building';
type CraftingRecipeView = ReturnType<typeof getCraftingCategories>[number]['recipes'][number];
type CraftingTierFilter = 'all' | CraftingTier;
type CraftingCategoryFilter = 'all' | CraftingRecipeCategory;
type BuildingCategoryId = 'all' | 'floor' | 'stairs' | 'wall' | 'support' | 'roof' | 'door-window';

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

type BuildingCategoryView = {
  id: BuildingCategoryId;
  label: string;
  matches: (part: BuildPartDefinition) => boolean;
};

type CraftingStatus = {
  canCraft: boolean;
  missingStation: boolean;
  missingMaterials: boolean;
  label: string;
  detail: string;
};

export type GameWindowsOptions = {
  onSelectBuildPart?: (partId: BuildPartId) => void;
  onEnterRemoveMode?: () => void;
  onExitBuildingMode?: () => void;
  onRotateBuildingPart?: () => void;
  onSetBuildingLayer?: (z: number) => void;
  onCraftRecipe?: (recipeId: CraftingRecipeId) => void;
};

const WINDOW_ROOT_ID = 'dalworld-windows';
const INVENTORY_SLOT_COUNT = 36;
const CRAFTING_CATEGORIES = getCraftingCategories();
const CRAFTING_RECIPE_VIEWS = CRAFTING_CATEGORIES.flatMap((category) => category.recipes);
const CRAFTING_TIER_FILTERS: Array<{ id: CraftingTierFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'early', label: '초반' },
  { id: 'mid', label: '중반' },
  { id: 'late', label: '후반' },
];
const STAIR_PART_IDS = new Set<BuildPartId>([
  'wood_stair_landing',
  'stone_stair_landing',
  'wood_stairs',
  'stone_stairs',
  'wood_corner_stairs',
  'stone_corner_stairs',
]);
const DOOR_WINDOW_CATEGORIES = new Set<BuildPartDefinition['category']>(['door', 'window']);

const BUILDING_CATEGORIES: BuildingCategoryView[] = [
  { id: 'all', label: '전체', matches: () => true },
  { id: 'floor', label: '바닥', matches: (part) => part.category === 'floor' && !STAIR_PART_IDS.has(part.id) },
  { id: 'stairs', label: '계단', matches: (part) => STAIR_PART_IDS.has(part.id) },
  { id: 'wall', label: '벽', matches: (part) => part.category === 'wall' },
  { id: 'support', label: '기둥', matches: (part) => part.category === 'support' },
  { id: 'roof', label: '지붕', matches: (part) => part.category === 'roof' },
  { id: 'door-window', label: '문/창문', matches: (part) => DOOR_WINDOW_CATEGORIES.has(part.category) },
];

const BUTTONS: FloatingButtonConfig[] = [
  { id: 'character', label: '캐릭터', icon: '🧍', title: '캐릭터', defaultButtonX: 18, defaultButtonY: 108, defaultWindowX: 84, defaultWindowY: 96 },
  { id: 'inventory', label: '가방', icon: '🎒', title: '가방', defaultButtonX: 18, defaultButtonY: 180, defaultWindowX: 96, defaultWindowY: 120 },
  { id: 'crafting', label: '제작', icon: '⚒️', title: '제작', defaultButtonX: 18, defaultButtonY: 252, defaultWindowX: 160, defaultWindowY: 120 },
  { id: 'building', label: '건설', icon: '🏠', title: '건설', defaultButtonX: 18, defaultButtonY: 324, defaultWindowX: 220, defaultWindowY: 180 },
];

export class GameWindows {
  private readonly root: HTMLDivElement;
  private readonly options: GameWindowsOptions;
  private zIndex = 30;
  private selectedItem: string | null = null;
  private selectedBuildPart: BuildPartId | null = null;
  private activeInventoryTab: InventoryTabId = 'general';
  private activeCraftingTier: CraftingTierFilter = 'all';
  private activeCraftingCategory: CraftingCategoryFilter = 'all';
  private activeBuildingCategory: BuildingCategoryId = 'all';
  private lastInventory: InventorySource = null;
  private lastPlayer: PlayerSnapshot | null = null;
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
    this.installCraftingInteractions();
    this.installBuildingInteractions();
    window.addEventListener('dalworld:item-overrides-updated', () => this.renderInventory(this.lastInventory));
    this.renderCharacter(null);
    this.renderBuildingMode(this.buildingMode);
    this.renderCraftingAvailability();
  }

  renderInventory(inventory: InventorySource): void {
    this.lastInventory = inventory;
    this.renderCharacter(isPlayerSnapshot(inventory) ? inventory : this.lastPlayer);

    const slots = [...this.root.querySelectorAll<HTMLButtonElement>('[data-inventory-slot]')];
    const slotViews = getInventorySlotsForTab(this.activeInventoryTab, inventory);

    for (const [index, slot] of slots.entries()) {
      const view = slotViews[index];
      slot.innerHTML = '';
      slot.classList.remove('has-item', 'is-build-part', 'is-selected');
      slot.dataset.item = '';
      slot.dataset.buildInventoryPart = '';
      slot.title = `슬롯 ${index + 1}`;

      if (!view) continue;
      if (view.kind === 'resource') this.renderResourceSlot(slot, view);
      else this.renderBuildPartSlot(slot, view);
    }

    if (this.selectedItem && this.activeInventoryTab === 'general') {
      const selected = slotViews.find((slot): slot is InventoryResourceSlotView => slot.kind === 'resource' && slot.itemId === this.selectedItem);
      if (selected) this.renderItemDetail(selected);
    }

    if (this.selectedBuildPart && this.activeInventoryTab === 'building') {
      this.renderBuildPartDetail(this.selectedBuildPart);
    }

    this.renderBuildingMode(this.buildingMode);
    this.renderCraftingAvailability();
  }

  renderCharacter(player: PlayerSnapshot | null): void {
    this.lastPlayer = player;

    const name = query<HTMLElement>(this.root, '[data-character-name]');
    const level = query<HTMLElement>(this.root, '[data-character-level]');
    const exp = query<HTMLElement>(this.root, '[data-character-exp]');
    const hp = query<HTMLElement>(this.root, '[data-character-hp]');
    const stamina = query<HTMLElement>(this.root, '[data-character-stamina]');
    const status = query<HTMLElement>(this.root, '[data-character-status]');
    const position = query<HTMLElement>(this.root, '[data-character-position]');
    const facing = query<HTMLElement>(this.root, '[data-character-facing]');
    const inventory = query<HTMLElement>(this.root, '[data-character-inventory]');
    const expFill = query<HTMLDivElement>(this.root, '[data-character-exp-fill]');
    const hpFill = query<HTMLDivElement>(this.root, '[data-character-hp-fill]');
    const staminaFill = query<HTMLDivElement>(this.root, '[data-character-stamina-fill]');

    if (!player) {
      name.textContent = 'Dale';
      level.textContent = 'Lv.—';
      exp.textContent = '—';
      hp.textContent = '—';
      stamina.textContent = '—';
      status.textContent = '접속 대기';
      position.textContent = '—';
      facing.textContent = '—';
      inventory.textContent = '—';
      setScaleX(expFill, 0);
      setScaleX(hpFill, 0);
      setScaleX(staminaFill, 0);
      return;
    }

    const expToNextLevel = player.expToNextLevel ?? 0;
    name.textContent = player.characterName ?? 'Dale';
    level.textContent = `Lv.${player.level ?? 1}`;
    exp.textContent = expToNextLevel > 0 ? `${player.exp ?? 0} / ${expToNextLevel}` : 'MAX';
    hp.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    stamina.textContent = `${Math.ceil(player.stamina)} / ${player.maxStamina}`;
    status.textContent = player.alive ? '생존' : getRespawnText(player.respawnAt);
    position.textContent = `${Math.round(player.x)}, ${Math.round(player.y)} · Cell ${player.cellX}, ${player.cellY}`;
    facing.textContent = formatFacing(player.facing);
    inventory.textContent = `나무 ${player.inventory.wood} · 돌 ${player.inventory.stone}`;
    setScaleX(expFill, expToNextLevel > 0 ? (player.exp ?? 0) / expToNextLevel : 1);
    setScaleX(hpFill, player.maxHp > 0 ? player.hp / player.maxHp : 0);
    setScaleX(staminaFill, player.maxStamina > 0 ? player.stamina / player.maxStamina : 0);
  }

  renderBuildingMode(mode: BuildingModeSnapshot): void {
    this.buildingMode = mode;

    const status = query<HTMLDivElement>(this.root, '[data-building-status]');
    const layer = query<HTMLSpanElement>(this.root, '[data-building-layer]');
    const rotation = query<HTMLSpanElement>(this.root, '[data-building-rotation]');
    const removeButton = query<HTMLButtonElement>(this.root, '[data-building-remove-mode]');
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-build-part]')];
    const inventoryBuildSlots = [...this.root.querySelectorAll<HTMLButtonElement>('[data-build-inventory-part], [data-build-inventory-part=""]')];

    this.renderBuildingCategoryTabs();
    this.updateBuildingPartVisibility();

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

  private renderResourceSlot(slot: HTMLButtonElement, view: InventoryResourceSlotView): void {
    slot.classList.add('has-item');
    slot.dataset.item = view.itemId;
    slot.title = `${view.definition.label} x${view.amount}`;
    slot.innerHTML = `
      <span class="inventory-item-icon">${view.definition.icon}</span>
      <span class="inventory-item-count">${view.amount}</span>
    `;
  }

  private renderBuildPartSlot(slot: HTMLButtonElement, view: InventoryBuildPartSlotView): void {
    const selected = this.buildingMode.enabled &&
      this.buildingMode.toolMode === 'place' &&
      this.buildingMode.selectedPartId === view.buildPartId;
    slot.classList.add('has-item', 'is-build-part');
    slot.classList.toggle('is-selected', selected);
    slot.dataset.buildInventoryPart = view.buildPartId;
    slot.title = view.amount === null ? `${view.definition.label} 선택` : `${view.definition.label} x${view.amount}`;
    slot.innerHTML = `
      <span class="inventory-item-icon">${view.definition.icon}</span>
      <span class="inventory-build-label">${view.definition.label}</span>
      ${view.amount === null ? '' : `<span class="inventory-item-count">${view.amount}</span>`}
    `;
  }

  private renderCraftingAvailability(): void {
    const cards = [...this.root.querySelectorAll<HTMLButtonElement>('[data-craft-recipe]')];
    let visibleCount = 0;
    let craftableVisibleCount = 0;

    this.renderCraftingFilterTabs();

    for (const card of cards) {
      const recipe = getCraftingRecipeView(card.dataset.craftRecipe);
      if (!recipe) continue;

      const visible = this.isCraftingRecipeVisible(recipe);
      card.hidden = !visible;
      if (visible) visibleCount += 1;

      const status = getCraftingStatus(this.lastInventory, recipe);
      if (visible && status.canCraft) craftableVisibleCount += 1;

      card.disabled = !status.canCraft;
      card.classList.toggle('is-disabled-by-cost', !status.canCraft);
      card.classList.toggle('is-missing-station', status.missingStation);
      card.classList.toggle('is-missing-materials', status.missingMaterials);
      card.title = `${recipe.recipe.label} · ${status.detail}`;

      const statusText = card.querySelector<HTMLElement>('[data-craft-status]');
      if (statusText) statusText.textContent = status.label;
      const statusDetail = card.querySelector<HTMLElement>('[data-craft-status-detail]');
      if (statusDetail) statusDetail.textContent = status.detail;
    }

    const summary = this.root.querySelector<HTMLElement>('[data-crafting-summary]');
    if (summary) {
      summary.textContent = `표시 ${visibleCount}개 · 제작 가능 ${craftableVisibleCount}개 · 전체 ${CRAFTING_RECIPE_VIEWS.length}개`;
    }
  }

  private renderCraftingFilterTabs(): void {
    const tierButtons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-crafting-tier]')];
    for (const button of tierButtons) {
      const tier = (button.dataset.craftingTier ?? 'all') as CraftingTierFilter;
      const count = tier === 'all'
        ? CRAFTING_RECIPE_VIEWS.length
        : CRAFTING_RECIPE_VIEWS.filter((view) => view.recipe.tier === tier).length;
      button.textContent = `${getTierFilterLabel(tier)} ${count}`;
      setPillActive(button, tier === this.activeCraftingTier);
    }

    const categoryButtons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-crafting-category]')];
    for (const button of categoryButtons) {
      const category = (button.dataset.craftingCategory ?? 'all') as CraftingCategoryFilter;
      const count = category === 'all'
        ? CRAFTING_RECIPE_VIEWS.length
        : CRAFTING_RECIPE_VIEWS.filter((view) => view.recipe.category === category).length;
      const label = category === 'all'
        ? '전체'
        : CRAFTING_CATEGORIES.find((candidate) => candidate.id === category)?.label ?? category;
      button.textContent = `${label} ${count}`;
      setPillActive(button, category === this.activeCraftingCategory);
    }
  }

  private isCraftingRecipeVisible(recipe: CraftingRecipeView): boolean {
    return (this.activeCraftingTier === 'all' || recipe.recipe.tier === this.activeCraftingTier) &&
      (this.activeCraftingCategory === 'all' || recipe.recipe.category === this.activeCraftingCategory);
  }

  private renderBuildingCategoryTabs(): void {
    const tabs = [...this.root.querySelectorAll<HTMLButtonElement>('[data-building-category]')];
    for (const tab of tabs) {
      const categoryId = tab.dataset.buildingCategory as BuildingCategoryId;
      const category = getBuildingCategory(categoryId);
      const count = BUILD_PART_LIST.filter((part) => category.matches(part)).length;
      tab.textContent = `${category.label} ${count}`;
      setPillActive(tab, categoryId === this.activeBuildingCategory);
    }
  }

  private updateBuildingPartVisibility(): void {
    const category = getBuildingCategory(this.activeBuildingCategory);
    const cards = [...this.root.querySelectorAll<HTMLButtonElement>('[data-build-part]')];
    for (const card of cards) {
      const partId = card.dataset.buildPart as BuildPartId;
      const part = BUILD_PART_LIST.find((candidate) => candidate.id === partId);
      card.hidden = !part || !category.matches(part);
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

    for (const tabButton of tabs) {
      tabButton.addEventListener('click', () => {
        for (const other of tabs) other.classList.toggle('is-active', other === tabButton);
        this.activeInventoryTab = (tabButton.dataset.inventoryTab ?? 'general') as InventoryTabId;
        this.selectedItem = null;
        this.selectedBuildPart = null;
        const tab = INVENTORY_TABS.find((candidate) => candidate.id === this.activeInventoryTab) ?? INVENTORY_TABS[0];
        detailTitle.textContent = `${tab.label} 가방`;
        detailBody.textContent = tab.emptyText;
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

        const itemType = slot.dataset.item ?? '';
        if (!itemType) {
          this.selectedItem = null;
          this.selectedBuildPart = null;
          const index = Number(slot.dataset.inventorySlot ?? '0') + 1;
          const tab = INVENTORY_TABS.find((candidate) => candidate.id === this.activeInventoryTab) ?? INVENTORY_TABS[0];
          detailTitle.textContent = `빈 슬롯 ${index}`;
          detailBody.textContent = tab.emptyText;
          return;
        }

        this.selectedBuildPart = null;
        this.selectedItem = itemType;
        const definition = getRuntimeItemDefinition(itemType);
        const countText = slot.querySelector('.inventory-item-count')?.textContent ?? '0';
        if (!definition) return;
        this.renderItemDetail({ kind: 'resource', itemId: itemType, definition, amount: Number(countText) });
      });
    }
  }

  private installCraftingInteractions(): void {
    const crafting = query<HTMLDivElement>(this.root, '[data-window="crafting"]');
    const tierButtons = [...crafting.querySelectorAll<HTMLButtonElement>('[data-crafting-tier]')];
    const categoryButtons = [...crafting.querySelectorAll<HTMLButtonElement>('[data-crafting-category]')];
    const buttons = [...crafting.querySelectorAll<HTMLButtonElement>('[data-craft-recipe]')];

    for (const button of tierButtons) {
      button.addEventListener('click', () => {
        this.activeCraftingTier = (button.dataset.craftingTier ?? 'all') as CraftingTierFilter;
        this.renderCraftingAvailability();
      });
    }

    for (const button of categoryButtons) {
      button.addEventListener('click', () => {
        this.activeCraftingCategory = (button.dataset.craftingCategory ?? 'all') as CraftingCategoryFilter;
        this.renderCraftingAvailability();
      });
    }

    for (const button of buttons) {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const recipeId = button.dataset.craftRecipe;
        if (!recipeId) return;
        this.options.onCraftRecipe?.(recipeId);
      });
    }
  }

  private installBuildingInteractions(): void {
    const building = query<HTMLDivElement>(this.root, '[data-window="building"]');
    const categoryButtons = [...building.querySelectorAll<HTMLButtonElement>('[data-building-category]')];
    const partButtons = [...building.querySelectorAll<HTMLButtonElement>('[data-build-part]')];
    const exitButton = query<HTMLButtonElement>(building, '[data-building-exit]');
    const rotateButton = query<HTMLButtonElement>(building, '[data-building-rotate]');
    const removeButton = query<HTMLButtonElement>(building, '[data-building-remove-mode]');
    const layerDownButton = query<HTMLButtonElement>(building, '[data-building-layer-down]');
    const layerUpButton = query<HTMLButtonElement>(building, '[data-building-layer-up]');
    const partScroller = query<HTMLDivElement>(building, '[data-building-part-scroller]');

    for (const button of categoryButtons) {
      button.addEventListener('click', () => {
        this.activeBuildingCategory = (button.dataset.buildingCategory ?? 'all') as BuildingCategoryId;
        partScroller.scrollTop = 0;
        this.renderBuildingMode(this.buildingMode);
      });
    }

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

  private renderItemDetail(item: InventoryResourceSlotView): void {
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
    ${getCharacterWindowMarkup()}
    ${getInventoryWindowMarkup()}
    ${getCraftingWindowMarkup()}
    ${getBuildingWindowMarkup()}
  `;
}

function getFloatingButtonMarkup(config: FloatingButtonConfig): string {
  return `
    <button class="floating-icon" type="button" data-floating="${config.id}" aria-label="${config.label}" title="${config.title}">
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

function getCharacterWindowMarkup(): string {
  return `
    <section class="game-window simple-system-window character-window" data-window="character" hidden>
      ${getWindowHeaderMarkup('캐릭터')}
      <div class="system-window-body character-window-body">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div style="display:grid; place-items:center; width:54px; height:54px; border-radius:16px; background:rgba(126,231,255,.14); border:1px solid rgba(126,231,255,.34); font-size:30px;">🧍</div>
          <div style="min-width:0; flex:1;">
            <h3 data-character-name style="margin:0 0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Dale</h3>
            <p style="margin:0; color:rgba(255,255,255,.68); font-size:12px; font-weight:800;">
              <span data-character-level>Lv.—</span> · <span data-character-status>접속 대기</span>
            </p>
          </div>
        </div>
        ${getCharacterBarMarkup('EXP', 'exp')}
        ${getCharacterBarMarkup('HP', 'hp')}
        ${getCharacterBarMarkup('ST', 'stamina')}
        <div style="display:grid; grid-template-columns:86px 1fr; gap:8px 10px; margin-top:12px; padding:10px; border:1px solid rgba(255,255,255,.12); border-radius:14px; background:rgba(255,255,255,.045); font-size:12px;">
          <b style="color:#ffe4a3;">위치</b><span data-character-position>—</span>
          <b style="color:#ffe4a3;">방향</b><span data-character-facing>—</span>
          <b style="color:#ffe4a3;">자원</b><span data-character-inventory>—</span>
        </div>
        <p style="margin:10px 0 0; color:rgba(255,255,255,.58); font-size:11px; line-height:1.45;">
          캐릭터 정보는 서버 snapshot 기준으로 표시됩니다. 레벨, 경험치, HP, 스태미나는 클라이언트에서 확정하지 않습니다.
        </p>
      </div>
    </section>
  `;
}

function getCharacterBarMarkup(label: string, key: 'exp' | 'hp' | 'stamina'): string {
  return `
    <div class="ui-stat-row ui-stat-${key}" style="margin-top:8px;">
      <div class="ui-stat-label"><span>${label}</span><b data-character-${key}>—</b></div>
      <div class="ui-bar"><div class="ui-bar-fill" data-character-${key}-fill></div></div>
    </div>
  `;
}

function getInventoryWindowMarkup(): string {
  return `
    <section class="game-window inventory-window" data-window="inventory" hidden>
      ${getWindowHeaderMarkup('가방')}
      <div class="inventory-tabs">
        ${INVENTORY_TABS.map((tab, index) => `
          <button class="inventory-tab ${index === 0 ? 'is-active' : ''}" type="button" data-inventory-tab="${tab.id}">${tab.label}</button>
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
          <p data-inventory-detail-body>${INVENTORY_TABS[0].emptyText}</p>
        </aside>
      </div>
    </section>
  `;
}

function getCraftingWindowMarkup(): string {
  return `
    <section class="game-window simple-system-window crafting-window" data-window="crafting" hidden style="width:min(760px, calc(100vw - 28px)); max-height:min(680px, calc(100vh - 28px));">
      ${getWindowHeaderMarkup('제작')}
      <div class="system-window-body" style="display:flex; flex-direction:column; gap:10px; max-height:620px; overflow:hidden;">
        <div style="display:grid; grid-template-columns:1fr auto; gap:10px; align-items:start; padding:10px; border:1px solid rgba(255,228,163,.2); border-radius:16px; background:linear-gradient(135deg, rgba(255,228,163,.1), rgba(126,231,255,.07));">
          <div>
            <h3 style="margin:0 0 4px; color:#ffe4a3; font-size:16px;">생존 제작대</h3>
            <p style="margin:0; color:rgba(255,255,255,.7); font-size:12px; line-height:1.45;">초반 생존 장비부터 중후반 에너지 제작까지, 서버가 재료와 제작도구를 검증합니다.</p>
          </div>
          <span data-crafting-summary style="padding:6px 9px; border-radius:999px; background:rgba(0,0,0,.24); border:1px solid rgba(255,255,255,.12); color:#dff8ff; font-size:11px; font-weight:900; white-space:nowrap;">표시 0개</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:7px;">
          <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:1px; scrollbar-width:thin;">
            ${CRAFTING_TIER_FILTERS.map((tier) => `
              <button class="building-category-tab" type="button" data-crafting-tier="${tier.id}" style="flex:0 0 auto; padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:rgba(245,247,251,.76); font-size:12px; font-weight:800; white-space:nowrap; cursor:pointer;">${tier.label}</button>
            `).join('')}
          </div>
          <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:thin;">
            <button class="building-category-tab" type="button" data-crafting-category="all" style="flex:0 0 auto; padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:rgba(245,247,251,.76); font-size:12px; font-weight:800; white-space:nowrap; cursor:pointer;">전체</button>
            ${CRAFTING_CATEGORIES.map((category) => `
              <button class="building-category-tab" type="button" data-crafting-category="${category.id}" style="flex:0 0 auto; padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:rgba(245,247,251,.76); font-size:12px; font-weight:800; white-space:nowrap; cursor:pointer;">${category.label}</button>
            `).join('')}
          </div>
        </div>
        <div style="overflow-y:auto; padding-right:4px; scrollbar-width:thin; touch-action:pan-y; overscroll-behavior:contain;">
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:9px;">
            ${CRAFTING_RECIPE_VIEWS.map((view) => getCraftingRecipeCardMarkup(view)).join('')}
          </div>
        </div>
      </div>
    </section>
  `;
}

function getCraftingRecipeCardMarkup(view: CraftingRecipeView): string {
  const outputIcon = view.outputDefinition?.icon ?? '▣';
  const station = view.requiredStationDefinition
    ? `${view.requiredStationDefinition.icon} ${view.requiredStationDefinition.label}`
    : '손 제작';
  return `
    <button class="placeholder-card crafting-recipe-card" type="button" data-craft-recipe="${view.recipe.id}" data-craft-tier-value="${view.recipe.tier}" data-craft-category-value="${view.recipe.category}" style="display:grid; grid-template-columns:42px 1fr; gap:9px; align-items:start; min-height:134px; text-align:left; padding:10px; border-radius:16px; position:relative; overflow:hidden;">
      <span style="display:grid; place-items:center; width:42px; height:42px; border-radius:13px; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.12); font-size:24px;">${outputIcon}</span>
      <span style="display:flex; min-width:0; flex-direction:column; gap:5px;">
        <span style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
          <small style="padding:2px 6px; border-radius:999px; background:${getTierBadgeBackground(view.recipe.tier)}; color:#fff; font-size:10px; font-weight:950;">${view.tierLabel}</small>
          <small style="padding:2px 6px; border-radius:999px; background:rgba(126,231,255,.12); color:#dff8ff; font-size:10px; font-weight:850;">${view.categoryLabel}</small>
        </span>
        <strong style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fff1bf; font-size:12px;">${view.recipe.label}</strong>
        <small style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,.65); font-size:10px;">도구: ${station}</small>
        <small style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,.66); font-size:10px;">재료: ${getRecipeTooltip(view.inputDefinitions)}</small>
        <small style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(126,231,255,.9); font-size:10px; font-weight:800;">결과: ${getRecipeOutputText(view)} · ${view.recipe.craftSeconds ?? 1}s</small>
        <span data-craft-status style="margin-top:2px; align-self:flex-start; padding:3px 7px; border-radius:999px; background:rgba(255,255,255,.08); color:#fff; font-size:10px; font-weight:950;">확인 중</span>
        <span data-craft-status-detail style="font-size:10px; color:rgba(255,255,255,.52); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">서버 검증 대기</span>
      </span>
    </button>
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
        <div class="building-category-tabs" aria-label="건설 부품 카테고리" style="display:flex; gap:6px; overflow-x:auto; padding:2px 0 8px; margin-top:8px; scrollbar-width:thin; touch-action:pan-x;">
          ${BUILDING_CATEGORIES.map((category) => `
            <button class="building-category-tab" type="button" data-building-category="${category.id}" style="flex:0 0 auto; padding:6px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:rgba(245,247,251,.76); font-size:12px; font-weight:700; white-space:nowrap; cursor:pointer;">
              ${category.label}
            </button>
          `).join('')}
        </div>
        <div data-building-part-scroller style="max-height:360px; overflow-y:auto; padding-right:4px; scrollbar-width:thin; touch-action:pan-y; overscroll-behavior:contain;">
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
      </div>
    </section>
  `;
}

function getBuildingCategory(categoryId: BuildingCategoryId): BuildingCategoryView {
  return BUILDING_CATEGORIES.find((category) => category.id === categoryId) ?? BUILDING_CATEGORIES[0];
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

function canAffordBuildPart(inventory: InventorySource, costs: { itemId: string; quantity: number }[]): boolean {
  const stacks = normalizeInventoryStacks(inventory);
  return costs.every((cost) => (stacks.find((stack) => stack.itemId === cost.itemId)?.quantity ?? 0) >= cost.quantity);
}

function getCraftingStatus(inventory: InventorySource, recipe: CraftingRecipeView): CraftingStatus {
  const stacks = normalizeInventoryStacks(inventory);
  const missingInputs = recipe.recipe.inputs.filter((input) => (
    (stacks.find((stack) => stack.itemId === input.itemId)?.quantity ?? 0) < input.quantity
  ));
  const missingStation = recipe.recipe.requiredStation
    ? (stacks.find((stack) => stack.itemId === recipe.recipe.requiredStation)?.quantity ?? 0) < 1
    : false;
  const canCraft = missingInputs.length === 0 && !missingStation;

  if (canCraft) {
    return { canCraft, missingStation: false, missingMaterials: false, label: '제작 가능', detail: '클릭하면 서버 검증 후 제작합니다.' };
  }

  if (missingStation) {
    return {
      canCraft,
      missingStation: true,
      missingMaterials: missingInputs.length > 0,
      label: '제작도구 필요',
      detail: `필요 도구: ${recipe.requiredStationDefinition?.label ?? recipe.recipe.requiredStation}`,
    };
  }

  return {
    canCraft,
    missingStation: false,
    missingMaterials: true,
    label: '재료 부족',
    detail: `부족: ${missingInputs.map((input) => `${getItemLabel(input.itemId)} ${input.quantity}`).join(' · ')}`,
  };
}

function canCraftRecipe(inventory: InventorySource, recipe: CraftingRecipeView): boolean {
  return getCraftingStatus(inventory, recipe).canCraft;
}

function getCraftingRecipeView(recipeId: string | undefined): CraftingRecipeView | null {
  if (!recipeId) return null;
  return CRAFTING_RECIPE_VIEWS.find((view) => view.recipe.id === recipeId) ?? null;
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
  return getItemLabel(itemId);
}

function getItemLabel(itemId: string): string {
  const definition = getRuntimeItemDefinition(itemId);
  if (definition) return definition.label;
  return itemId;
}

function getRecipeTooltip(inputs: Array<{ itemId: string; quantity: number; definition: ItemDefinition | null }>): string {
  return inputs.map((input) => `${input.definition?.label ?? getItemLabel(input.itemId)} ${input.quantity}`).join(' · ');
}

function getRecipeOutputText(view: CraftingRecipeView): string {
  return view.recipe.outputs
    .map((output, index) => {
      if (index === 0 && view.outputDefinition) return `${view.outputDefinition.label} ${output.quantity}`;
      return `${getItemLabel(output.itemId)} ${output.quantity}`;
    })
    .join(' · ');
}

function getTierFilterLabel(tier: CraftingTierFilter): string {
  return CRAFTING_TIER_FILTERS.find((candidate) => candidate.id === tier)?.label ?? tier;
}

function getTierBadgeBackground(tier: CraftingTier): string {
  switch (tier) {
    case 'early':
      return 'rgba(84,220,120,.45)';
    case 'mid':
      return 'rgba(126,231,255,.36)';
    case 'late':
      return 'rgba(191,126,255,.42)';
  }
}

function setPillActive(button: HTMLElement, active: boolean): void {
  button.classList.toggle('is-active', active);
  button.style.background = active ? 'rgba(84, 220, 120, 0.2)' : 'rgba(255, 255, 255, 0.08)';
  button.style.borderColor = active ? 'rgba(84, 220, 120, 0.95)' : 'rgba(255, 255, 255, 0.14)';
  button.style.color = active ? '#f5fff7' : 'rgba(245, 247, 251, 0.76)';
}

function isPlayerSnapshot(value: InventorySource): value is PlayerSnapshot {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'id' in value &&
    'hp' in value &&
    'inventory' in value;
}

function formatFacing(facing: string): string {
  switch (facing) {
    case 'up': return '위';
    case 'down': return '아래';
    case 'left': return '왼쪽';
    case 'right': return '오른쪽';
    default: return facing;
  }
}

function getRespawnText(respawnAt: number): string {
  if (respawnAt <= 0) return '쓰러짐';
  const remainingMs = Math.max(0, respawnAt - Date.now());
  return `부활 대기 ${Math.ceil(remainingMs / 1000)}초`;
}
