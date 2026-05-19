import { BUILD_PART_LIST } from '../building/BuildingParts';
import { createBuildPartItemId } from '../inventory/ItemDefinitions';
import type { CraftingRecipeDefinition, CraftingRecipeCategory } from './CraftingTypes';

export const CRAFTING_RECIPES: CraftingRecipeDefinition[] = [
  {
    id: 'craft:floor_kit',
    label: '바닥 키트 제작',
    category: 'material',
    inputs: [{ itemId: 'wood', quantity: 2 }],
    outputs: [{ itemId: 'floor_kit', quantity: 1 }],
    sortOrder: 10,
  },
  {
    id: 'craft:wall_kit',
    label: '벽 키트 제작',
    category: 'material',
    inputs: [{ itemId: 'wood', quantity: 2 }],
    outputs: [{ itemId: 'wall_kit', quantity: 1 }],
    sortOrder: 20,
  },
  {
    id: 'craft:roof_kit',
    label: '지붕 키트 제작',
    category: 'material',
    inputs: [
      { itemId: 'wood', quantity: 2 },
      { itemId: 'stone', quantity: 1 },
    ],
    outputs: [{ itemId: 'roof_kit', quantity: 1 }],
    sortOrder: 30,
  },
  ...BUILD_PART_LIST.map((part, index): CraftingRecipeDefinition => ({
    id: `craft:build_part:${part.id}`,
    label: `${part.label} 제작`,
    category: getBuildPartRecipeCategory(part.category),
    inputs: part.placementCost,
    outputs: [{ itemId: createBuildPartItemId(part.id), quantity: 1 }],
    sortOrder: 100 + index,
  })),
];

export function getCraftingRecipe(recipeId: string): CraftingRecipeDefinition | null {
  return CRAFTING_RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
}

function getBuildPartRecipeCategory(category: string): CraftingRecipeCategory {
  switch (category) {
    case 'floor':
      return 'building_floor';
    case 'wall':
      return 'building_wall';
    case 'support':
      return 'building_support';
    case 'roof':
      return 'building_roof';
    case 'door':
      return 'building_door';
    case 'window':
      return 'building_window';
    default:
      return 'material';
  }
}
