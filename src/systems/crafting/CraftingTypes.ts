import type { InventoryItemId, InventoryItemStack } from '../inventory/InventoryTypes';

export type CraftingRecipeId = string;

export type CraftingTier = 'early' | 'mid' | 'late';

export type CraftingRecipeCategory =
  | 'material'
  | 'station'
  | 'building_floor'
  | 'building_wall'
  | 'building_support'
  | 'building_roof'
  | 'building_door'
  | 'building_window'
  | 'equipment'
  | 'weapon'
  | 'tool'
  | 'consumable'
  | 'capture';

export type CraftingRecipeDefinition = {
  id: CraftingRecipeId;
  label: string;
  description?: string;
  tier: CraftingTier;
  category: CraftingRecipeCategory;
  inputs: InventoryItemStack[];
  outputs: InventoryItemStack[];
  requiredStation?: InventoryItemId;
  craftSeconds?: number;
  sortOrder: number;
};
