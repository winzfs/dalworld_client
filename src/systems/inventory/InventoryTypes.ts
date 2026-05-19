import { BASE_ITEM_DEFINITIONS, type InventoryItemId } from './ItemDefinitions';

export type { InventoryItemId };

export type InventoryItemStack = {
  itemId: InventoryItemId;
  quantity: number;
};

export type InventorySnapshot = {
  ownerId: string;
  items: InventoryItemStack[];
  updatedAt: number;
};

export const INVENTORY_ITEM_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(BASE_ITEM_DEFINITIONS).map((definition) => [definition.id, definition.label]),
);
