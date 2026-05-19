import type { Inventory, ItemType, PlayerSnapshot } from '../../protocol/messages';
import { BUILD_PART_ITEM_ENTRIES, getBuildPartIdFromItemId } from '../building/BuildPartInventoryCatalog';
import type { BuildPartId } from '../building/BuildingTypes';
import { BASE_ITEM_DEFINITIONS, type ItemDefinition } from './ItemDefinitions';
import type { InventoryItemStack } from './InventoryTypes';

export type InventoryTabId = 'general' | 'consumable' | 'equipment' | 'crafting' | 'building' | 'pet';

export type InventoryResourceSlotView = {
  kind: 'resource';
  itemId: string;
  definition: ItemDefinition;
  amount: number;
};

export type InventoryBuildPartSlotView = {
  kind: 'building_part';
  buildPartId: BuildPartId;
  definition: ItemDefinition;
  amount: number | null;
};

export type InventorySlotView = InventoryResourceSlotView | InventoryBuildPartSlotView;

export type InventoryTabView = {
  id: InventoryTabId;
  label: string;
  emptyText: string;
};

export type InventorySource = Inventory | PlayerSnapshot | InventoryItemStack[] | null;

export const INVENTORY_TABS: InventoryTabView[] = [
  { id: 'general', label: '일반', emptyText: '채집한 자원이 이곳에 표시됩니다.' },
  { id: 'consumable', label: '사용', emptyText: '아직 사용 아이템이 없습니다.' },
  { id: 'equipment', label: '장비', emptyText: '아직 장비 아이템이 없습니다.' },
  { id: 'crafting', label: '제작', emptyText: '아직 제작 재료가 없습니다.' },
  { id: 'building', label: '건설', emptyText: '건설 부품을 선택하면 건설모드로 진입합니다.' },
  { id: 'pet', label: '펫', emptyText: '아직 펫 아이템이 없습니다.' },
];

export function getInventoryTabByLabel(label: string): InventoryTabView {
  return INVENTORY_TABS.find((tab) => tab.label === label) ?? INVENTORY_TABS[0];
}

export function getInventorySlotsForTab(tab: InventoryTabId, source: InventorySource): InventorySlotView[] {
  const stacks = normalizeInventoryStacks(source);

  switch (tab) {
    case 'general':
      return getGeneralResourceSlots(stacks);
    case 'building':
      return getBuildingPartSlots(stacks);
    case 'crafting':
      return getCraftingMaterialSlots(stacks);
    case 'consumable':
    case 'equipment':
    case 'pet':
      return [];
  }
}

export function normalizeInventoryStacks(source: InventorySource): InventoryItemStack[] {
  if (!source) return [];
  if (Array.isArray(source)) return source.filter((stack) => stack.quantity > 0);
  if ('inventoryItems' in source && source.inventoryItems) return source.inventoryItems.filter((stack) => stack.quantity > 0);

  const legacy = source as Inventory;
  return (['wood', 'stone'] as ItemType[])
    .map((itemId) => ({ itemId, quantity: legacy[itemId] ?? 0 }))
    .filter((stack) => stack.quantity > 0);
}

function getGeneralResourceSlots(stacks: InventoryItemStack[]): InventoryResourceSlotView[] {
  return stacks
    .map((stack) => {
      const definition = BASE_ITEM_DEFINITIONS[stack.itemId];
      if (!definition || definition.category !== 'resource' || stack.quantity <= 0) return null;
      return {
        kind: 'resource' as const,
        itemId: stack.itemId,
        definition,
        amount: stack.quantity,
      };
    })
    .filter((slot): slot is InventoryResourceSlotView => slot !== null);
}

function getCraftingMaterialSlots(stacks: InventoryItemStack[]): InventoryResourceSlotView[] {
  return stacks
    .map((stack) => {
      const definition = BASE_ITEM_DEFINITIONS[stack.itemId];
      if (!definition || definition.category !== 'crafting_material' || stack.quantity <= 0) return null;
      return {
        kind: 'resource' as const,
        itemId: stack.itemId,
        definition,
        amount: stack.quantity,
      };
    })
    .filter((slot): slot is InventoryResourceSlotView => slot !== null);
}

function getBuildingPartSlots(stacks: InventoryItemStack[]): InventoryBuildPartSlotView[] {
  const quantities = new Map(stacks.map((stack) => [stack.itemId, stack.quantity]));
  const owned = stacks
    .map((stack) => {
      const buildPartId = getBuildPartIdFromItemId(stack.itemId);
      const entry = buildPartId ? BUILD_PART_ITEM_ENTRIES.find((candidate) => candidate.buildPartId === buildPartId) : null;
      if (!entry || stack.quantity <= 0) return null;
      return {
        kind: 'building_part' as const,
        buildPartId: entry.buildPartId,
        definition: entry.definition,
        amount: stack.quantity,
      };
    })
    .filter((slot): slot is InventoryBuildPartSlotView => slot !== null);

  if (owned.length > 0) return owned;

  return BUILD_PART_ITEM_ENTRIES.map((entry) => ({
    kind: 'building_part',
    buildPartId: entry.buildPartId,
    definition: entry.definition,
    amount: quantities.get(entry.itemId) ?? null,
  }));
}
