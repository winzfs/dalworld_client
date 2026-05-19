import type { BuildPartId } from '../building/BuildingTypes';

export type ItemCategory =
  | 'resource'
  | 'consumable'
  | 'equipment'
  | 'crafting_material'
  | 'building_part'
  | 'pet';

export type InventoryItemId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'floor_kit'
  | 'wall_kit'
  | 'roof_kit'
  | `build_part:${BuildPartId}`;

export type ItemDefinition = {
  id: InventoryItemId;
  label: string;
  description: string;
  icon: string;
  category: ItemCategory;
  stackable: boolean;
  maxStack: number;
  buildPartId?: BuildPartId;
};

const RESOURCE_ITEMS: Record<'wood' | 'stone' | 'fiber', ItemDefinition> = {
  wood: {
    id: 'wood',
    label: '나무',
    description: '채집으로 얻는 기본 재료입니다. 제작과 건설에 사용됩니다.',
    icon: '🪵',
    category: 'resource',
    stackable: true,
    maxStack: 999,
  },
  stone: {
    id: 'stone',
    label: '돌',
    description: '채집으로 얻는 단단한 재료입니다. 제작과 건설에 사용됩니다.',
    icon: '🪨',
    category: 'resource',
    stackable: true,
    maxStack: 999,
  },
  fiber: {
    id: 'fiber',
    label: '섬유',
    description: '제작에 사용할 수 있는 기본 섬유 재료입니다.',
    icon: '🧵',
    category: 'crafting_material',
    stackable: true,
    maxStack: 999,
  },
};

const KIT_ITEMS: Record<'floor_kit' | 'wall_kit' | 'roof_kit', ItemDefinition> = {
  floor_kit: {
    id: 'floor_kit',
    label: '바닥 키트',
    description: '바닥 부품 제작에 쓰이는 중간 제작품입니다.',
    icon: '▱',
    category: 'crafting_material',
    stackable: true,
    maxStack: 99,
  },
  wall_kit: {
    id: 'wall_kit',
    label: '벽 키트',
    description: '벽/문/창문 계열 부품 제작에 쓰이는 중간 제작품입니다.',
    icon: '▌',
    category: 'crafting_material',
    stackable: true,
    maxStack: 99,
  },
  roof_kit: {
    id: 'roof_kit',
    label: '지붕 키트',
    description: '지붕 부품 제작에 쓰이는 중간 제작품입니다.',
    icon: '⌂',
    category: 'crafting_material',
    stackable: true,
    maxStack: 99,
  },
};

export const BASE_ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  ...RESOURCE_ITEMS,
  ...KIT_ITEMS,
};

export function createBuildPartItemId(buildPartId: BuildPartId): InventoryItemId {
  return `build_part:${buildPartId}`;
}

export function createBuildPartItemDefinition(input: {
  buildPartId: BuildPartId;
  label: string;
  description: string;
  icon: string;
}): ItemDefinition {
  return {
    id: createBuildPartItemId(input.buildPartId),
    label: input.label,
    description: input.description,
    icon: input.icon,
    category: 'building_part',
    stackable: true,
    maxStack: 99,
    buildPartId: input.buildPartId,
  };
}

export function getBaseItemDefinition(itemId: string): ItemDefinition | null {
  return BASE_ITEM_DEFINITIONS[itemId] ?? null;
}
