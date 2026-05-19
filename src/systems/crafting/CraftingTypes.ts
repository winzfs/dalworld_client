import type { InventoryItemStack } from '../inventory/InventoryTypes';

export type CraftingRecipeId = string;

export type CraftingRecipeCategory =
  | 'material'
  | 'building_floor'
  | 'building_wall'
  | 'building_support'
  | 'building_roof'
  | 'building_door'
  | 'building_window'
  | 'equipment'
  | 'consumable';

export type CraftingRecipeDefinition = {
  id: CraftingRecipeId;
  label: string;
  category: CraftingRecipeCategory;
  inputs: InventoryItemStack[];
  outputs: InventoryItemStack[];
  requiredStation?: string;
  sortOrder: number;
};
