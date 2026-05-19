export type InventoryItemId =
  | "wood"
  | "stone"
  | "fiber"
  | "floor_kit"
  | "wall_kit"
  | "roof_kit";

export type InventoryItemStack = {
  itemId: InventoryItemId;
  quantity: number;
};

export type InventorySnapshot = {
  ownerId: string;
  items: InventoryItemStack[];
  updatedAt: number;
};

export const INVENTORY_ITEM_LABELS: Record<InventoryItemId, string> = {
  wood: "나무",
  stone: "돌",
  fiber: "섬유",
  floor_kit: "바닥 키트",
  wall_kit: "벽 키트",
  roof_kit: "지붕 키트",
};
