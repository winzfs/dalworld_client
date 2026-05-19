import { BUILD_PART_LIST } from './BuildingParts';
import type { BuildPartId } from './BuildingTypes';
import {
  createBuildPartItemDefinition,
  createBuildPartItemId,
  type InventoryItemId,
  type ItemDefinition,
} from '../inventory/ItemDefinitions';

export type BuildPartInventoryEntry = {
  itemId: InventoryItemId;
  buildPartId: BuildPartId;
  definition: ItemDefinition;
};

export const BUILD_PART_ITEM_ENTRIES: BuildPartInventoryEntry[] = BUILD_PART_LIST.map((part) => ({
  itemId: createBuildPartItemId(part.id),
  buildPartId: part.id,
  definition: createBuildPartItemDefinition({
    buildPartId: part.id,
    label: part.label,
    description: `건설 부품입니다. 슬롯: ${getSlotKindLabel(part.slotKind)} · 비용: ${part.placementCost.map((cost) => `${cost.itemId} ${cost.quantity}`).join(', ')}`,
    icon: part.icon,
  }),
}));

export const BUILD_PART_ITEM_DEFINITIONS: Record<string, ItemDefinition> = Object.fromEntries(
  BUILD_PART_ITEM_ENTRIES.map((entry) => [entry.itemId, entry.definition]),
);

export function getBuildPartItemDefinition(buildPartId: BuildPartId): ItemDefinition {
  const itemId = createBuildPartItemId(buildPartId);
  const definition = BUILD_PART_ITEM_DEFINITIONS[itemId];
  if (!definition) throw new Error(`Missing build part item definition: ${buildPartId}`);
  return definition;
}

export function getBuildPartIdFromItemId(itemId: string): BuildPartId | null {
  return BUILD_PART_ITEM_ENTRIES.find((entry) => entry.itemId === itemId)?.buildPartId ?? null;
}

function getSlotKindLabel(slotKind: string): string {
  switch (slotKind) {
    case 'tile':
      return '타일';
    case 'edge':
      return '엣지';
    case 'corner':
      return '코너';
    default:
      return slotKind;
  }
}
