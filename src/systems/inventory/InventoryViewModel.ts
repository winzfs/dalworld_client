import type { Inventory, ItemType } from '../../protocol/messages';
import { BUILD_PART_ITEM_ENTRIES } from '../building/BuildPartInventoryCatalog';
import type { BuildPartId } from '../building/BuildingTypes';
import { BASE_ITEM_DEFINITIONS, type ItemDefinition } from './ItemDefinitions';

export type InventoryTabId = 'general' | 'consumable' | 'equipment' | 'crafting' | 'building' | 'pet';

export type InventoryResourceSlotView = {
  kind: 'resource';
  itemId: ItemType;
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

export function getInventorySlotsForTab(tab: InventoryTabId, inventory: Inventory | null): InventorySlotView[] {
  switch (tab) {
    case 'general':
      return getGeneralResourceSlots(inventory);
    case 'building':
      return BUILD_PART_ITEM_ENTRIES.map((entry) => ({
        kind: 'building_part',
        buildPartId: entry.buildPartId,
        definition: entry.definition,
        amount: null,
      }));
    case 'crafting':
    case 'consumable':
    case 'equipment':
    case 'pet':
      return [];
  }
}

function getGeneralResourceSlots(inventory: Inventory | null): InventoryResourceSlotView[] {
  if (!inventory) return [];

  return (['wood', 'stone'] as ItemType[])
    .map((itemId) => {
      const definition = BASE_ITEM_DEFINITIONS[itemId];
      const amount = inventory[itemId] ?? 0;
      if (!definition || amount <= 0) return null;
      return {
        kind: 'resource' as const,
        itemId,
        definition,
        amount,
      };
    })
    .filter((slot): slot is InventoryResourceSlotView => slot !== null);
}
