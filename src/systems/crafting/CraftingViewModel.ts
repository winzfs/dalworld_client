import { BUILD_PART_ITEM_DEFINITIONS } from '../building/BuildPartInventoryCatalog';
import { type ItemDefinition } from '../inventory/ItemDefinitions';
import { getRuntimeItemDefinition } from '../inventory/ItemRuntimeOverrides';
import { CRAFTING_RECIPES } from './CraftingRecipes';
import type { CraftingRecipeCategory, CraftingRecipeDefinition, CraftingTier } from './CraftingTypes';

export type CraftingRecipeView = {
  recipe: CraftingRecipeDefinition;
  outputDefinition: ItemDefinition | null;
  requiredStationDefinition: ItemDefinition | null;
  tierLabel: string;
  categoryLabel: string;
  inputDefinitions: Array<{
    itemId: string;
    quantity: number;
    definition: ItemDefinition | null;
  }>;
};

export type CraftingCategoryView = {
  id: CraftingRecipeCategory;
  label: string;
  recipes: CraftingRecipeView[];
};

const CRAFTING_CATEGORY_LABELS: Record<CraftingRecipeCategory, string> = {
  material: '재료',
  station: '제작도구',
  building_floor: '바닥',
  building_wall: '벽',
  building_support: '기둥',
  building_roof: '지붕',
  building_door: '문',
  building_window: '창문',
  equipment: '장비',
  weapon: '무기',
  tool: '도구',
  consumable: '소모품',
  capture: '포획',
};

const CRAFTING_TIER_LABELS: Record<CraftingTier, string> = {
  early: '초반',
  mid: '중반',
  late: '후반',
};

export function getCraftingCategories(): CraftingCategoryView[] {
  const groups = new Map<CraftingRecipeCategory, CraftingRecipeView[]>();

  for (const recipe of [...CRAFTING_RECIPES].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const recipes = groups.get(recipe.category) ?? [];
    recipes.push(toRecipeView(recipe));
    groups.set(recipe.category, recipes);
  }

  return [...groups.entries()].map(([id, recipes]) => ({
    id,
    label: CRAFTING_CATEGORY_LABELS[id],
    recipes,
  }));
}

export function toRecipeView(recipe: CraftingRecipeDefinition): CraftingRecipeView {
  const output = recipe.outputs[0];
  return {
    recipe,
    outputDefinition: output ? getItemDefinition(output.itemId) : null,
    requiredStationDefinition: recipe.requiredStation ? getItemDefinition(recipe.requiredStation) : null,
    tierLabel: CRAFTING_TIER_LABELS[recipe.tier],
    categoryLabel: CRAFTING_CATEGORY_LABELS[recipe.category],
    inputDefinitions: recipe.inputs.map((input) => ({
      itemId: input.itemId,
      quantity: input.quantity,
      definition: getItemDefinition(input.itemId),
    })),
  };
}

function getItemDefinition(itemId: string): ItemDefinition | null {
  return getRuntimeItemDefinition(itemId) ?? BUILD_PART_ITEM_DEFINITIONS[itemId] ?? null;
}
