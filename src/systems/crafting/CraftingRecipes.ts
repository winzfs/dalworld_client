import { BUILD_PART_LIST } from '../building/BuildingParts';
import { createBuildPartItemId, type InventoryItemId } from '../inventory/ItemDefinitions';
import type { CraftingRecipeCategory, CraftingRecipeDefinition, CraftingTier } from './CraftingTypes';

const EARLY_RECIPES: CraftingRecipeDefinition[] = [
  recipe('craft:plank', '목재 판자', 'early', 'material', [{ itemId: 'wood', quantity: 2 }], [{ itemId: 'plank', quantity: 1 }], 10),
  recipe('craft:plank_bundle', '목재 판자 묶음', 'early', 'material', [{ itemId: 'wood', quantity: 18 }], [{ itemId: 'plank', quantity: 10 }], 11, 'workbench'),
  recipe('craft:stone_block', '석재 블록', 'early', 'material', [{ itemId: 'stone', quantity: 2 }], [{ itemId: 'stone_block', quantity: 1 }], 20),
  recipe('craft:stone_block_bundle', '석재 블록 묶음', 'early', 'material', [{ itemId: 'stone', quantity: 18 }], [{ itemId: 'stone_block', quantity: 10 }], 21, 'workbench'),
  recipe('craft:rope', '밧줄', 'early', 'material', [{ itemId: 'fiber', quantity: 3 }], [{ itemId: 'rope', quantity: 1 }], 30),
  recipe('craft:rope_bundle', '밧줄 묶음', 'early', 'material', [{ itemId: 'fiber', quantity: 24 }], [{ itemId: 'rope', quantity: 9 }], 31, 'workbench'),
  recipe('craft:cloth', '천', 'early', 'material', [{ itemId: 'fiber', quantity: 4 }], [{ itemId: 'cloth', quantity: 1 }], 40, 'loom'),
  recipe('craft:cloth_roll', '천 두루마리', 'early', 'material', [{ itemId: 'fiber', quantity: 18 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'cloth', quantity: 5 }], 41, 'loom'),
  recipe('craft:floor_kit', '바닥 키트', 'early', 'material', [{ itemId: 'plank', quantity: 2 }], [{ itemId: 'floor_kit', quantity: 1 }], 50, 'workbench'),
  recipe('craft:floor_kit_bundle', '바닥 키트 묶음', 'early', 'material', [{ itemId: 'plank', quantity: 10 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'floor_kit', quantity: 6 }], 51, 'workbench'),
  recipe('craft:wall_kit', '벽 키트', 'early', 'material', [{ itemId: 'plank', quantity: 2 }], [{ itemId: 'wall_kit', quantity: 1 }], 60, 'workbench'),
  recipe('craft:wall_kit_bundle', '벽 키트 묶음', 'early', 'material', [{ itemId: 'plank', quantity: 10 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'wall_kit', quantity: 6 }], 61, 'workbench'),
  recipe('craft:roof_kit', '지붕 키트', 'early', 'material', [{ itemId: 'plank', quantity: 2 }, { itemId: 'stone_block', quantity: 1 }], [{ itemId: 'roof_kit', quantity: 1 }], 70, 'workbench'),
  recipe('craft:roof_kit_bundle', '지붕 키트 묶음', 'early', 'material', [{ itemId: 'plank', quantity: 10 }, { itemId: 'stone_block', quantity: 5 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'roof_kit', quantity: 6 }], 71, 'workbench'),
  recipe('craft:workbench', '작업대', 'early', 'station', [{ itemId: 'wood', quantity: 8 }, { itemId: 'stone', quantity: 4 }], [{ itemId: 'workbench', quantity: 1 }], 100),
  recipe('craft:campfire', '모닥불', 'early', 'station', [{ itemId: 'stone', quantity: 6 }, { itemId: 'wood', quantity: 3 }], [{ itemId: 'campfire', quantity: 1 }], 110),
  recipe('craft:loom', '직조대', 'early', 'station', [{ itemId: 'plank', quantity: 6 }, { itemId: 'rope', quantity: 3 }], [{ itemId: 'loom', quantity: 1 }], 120, 'workbench'),
  recipe('craft:wood_pickaxe', '나무 곡괭이', 'early', 'tool', [{ itemId: 'wood', quantity: 4 }, { itemId: 'fiber', quantity: 2 }], [{ itemId: 'wood_pickaxe', quantity: 1 }], 200),
  recipe('craft:stone_pickaxe', '돌 곡괭이', 'early', 'tool', [{ itemId: 'wood', quantity: 3 }, { itemId: 'stone', quantity: 6 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'stone_pickaxe', quantity: 1 }], 210, 'workbench'),
  recipe('craft:wood_axe', '나무 도끼', 'early', 'tool', [{ itemId: 'wood', quantity: 4 }, { itemId: 'fiber', quantity: 2 }], [{ itemId: 'wood_axe', quantity: 1 }], 220),
  recipe('craft:stone_axe', '돌 도끼', 'early', 'tool', [{ itemId: 'wood', quantity: 3 }, { itemId: 'stone', quantity: 5 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'stone_axe', quantity: 1 }], 230, 'workbench'),
  recipe('craft:wood_sword', '나무 검', 'early', 'weapon', [{ itemId: 'wood', quantity: 5 }, { itemId: 'fiber', quantity: 2 }], [{ itemId: 'wood_sword', quantity: 1 }], 300),
  recipe('craft:stone_spear', '돌 창', 'early', 'weapon', [{ itemId: 'wood', quantity: 4 }, { itemId: 'stone', quantity: 4 }, { itemId: 'rope', quantity: 1 }], [{ itemId: 'stone_spear', quantity: 1 }], 310, 'workbench'),
  recipe('craft:basic_bow', '기초 활', 'early', 'weapon', [{ itemId: 'wood', quantity: 5 }, { itemId: 'rope', quantity: 2 }], [{ itemId: 'basic_bow', quantity: 1 }], 320, 'workbench'),
  recipe('craft:cloth_armor', '천 방어구', 'early', 'equipment', [{ itemId: 'cloth', quantity: 4 }, { itemId: 'rope', quantity: 2 }], [{ itemId: 'cloth_armor', quantity: 1 }], 330, 'loom'),
  recipe('craft:torch', '횃불', 'early', 'consumable', [{ itemId: 'wood', quantity: 1 }, { itemId: 'fiber', quantity: 1 }], [{ itemId: 'torch', quantity: 2 }], 400),
  recipe('craft:torch_bundle', '횃불 묶음', 'early', 'consumable', [{ itemId: 'wood', quantity: 6 }, { itemId: 'fiber', quantity: 6 }], [{ itemId: 'torch', quantity: 16 }], 401, 'workbench'),
  recipe('craft:healing_salve', '회복 연고', 'early', 'consumable', [{ itemId: 'fiber', quantity: 3 }], [{ itemId: 'healing_salve', quantity: 1 }], 410, 'campfire'),
  recipe('craft:healing_salve_pack', '회복 연고 꾸러미', 'early', 'consumable', [{ itemId: 'fiber', quantity: 12 }, { itemId: 'cloth', quantity: 1 }], [{ itemId: 'healing_salve', quantity: 5 }], 411, 'campfire'),
  recipe('craft:stamina_food', '스태미나 음식', 'early', 'consumable', [{ itemId: 'fiber', quantity: 2 }, { itemId: 'wood', quantity: 1 }], [{ itemId: 'stamina_food', quantity: 1 }], 420, 'campfire'),
  recipe('craft:stamina_food_pack', '스태미나 음식 꾸러미', 'early', 'consumable', [{ itemId: 'fiber', quantity: 10 }, { itemId: 'wood', quantity: 4 }, { itemId: 'cloth', quantity: 1 }], [{ itemId: 'stamina_food', quantity: 6 }], 421, 'campfire'),
  recipe('craft:capture_orb_basic', '기초 포획구', 'early', 'capture', [{ itemId: 'stone', quantity: 3 }, { itemId: 'fiber', quantity: 2 }], [{ itemId: 'capture_orb_basic', quantity: 1 }], 430, 'workbench'),
  recipe('craft:capture_orb_basic_pack', '기초 포획구 꾸러미', 'early', 'capture', [{ itemId: 'stone_block', quantity: 5 }, { itemId: 'rope', quantity: 3 }], [{ itemId: 'capture_orb_basic', quantity: 6 }], 431, 'workbench'),
];

const MID_RECIPES: CraftingRecipeDefinition[] = [
  recipe('craft:stone_forge', '석재 화로', 'mid', 'station', [{ itemId: 'stone_block', quantity: 12 }, { itemId: 'coal', quantity: 4 }], [{ itemId: 'stone_forge', quantity: 1 }], 1000, 'workbench'),
  recipe('craft:advanced_workbench', '고급 작업대', 'mid', 'station', [{ itemId: 'plank', quantity: 12 }, { itemId: 'copper_ingot', quantity: 4 }, { itemId: 'stone_block', quantity: 6 }], [{ itemId: 'advanced_workbench', quantity: 1 }], 1010, 'stone_forge'),
  recipe('craft:alchemy_table', '연금 작업대', 'mid', 'station', [{ itemId: 'plank', quantity: 8 }, { itemId: 'crystal', quantity: 3 }, { itemId: 'cloth', quantity: 4 }], [{ itemId: 'alchemy_table', quantity: 1 }], 1020, 'advanced_workbench'),
  recipe('craft:copper_ingot', '구리 주괴', 'mid', 'material', [{ itemId: 'ore_copper', quantity: 3 }, { itemId: 'coal', quantity: 1 }], [{ itemId: 'copper_ingot', quantity: 1 }], 1100, 'stone_forge'),
  recipe('craft:copper_ingot_batch', '구리 주괴 대량 제련', 'mid', 'material', [{ itemId: 'ore_copper', quantity: 24 }, { itemId: 'coal', quantity: 6 }], [{ itemId: 'copper_ingot', quantity: 10 }], 1101, 'stone_forge'),
  recipe('craft:iron_ingot', '철 주괴', 'mid', 'material', [{ itemId: 'ore_iron', quantity: 3 }, { itemId: 'coal', quantity: 2 }], [{ itemId: 'iron_ingot', quantity: 1 }], 1110, 'stone_forge'),
  recipe('craft:iron_ingot_batch', '철 주괴 대량 제련', 'mid', 'material', [{ itemId: 'ore_iron', quantity: 24 }, { itemId: 'coal', quantity: 12 }], [{ itemId: 'iron_ingot', quantity: 10 }], 1111, 'stone_forge'),
  recipe('craft:mana_thread', '마나 실', 'mid', 'material', [{ itemId: 'fiber', quantity: 4 }, { itemId: 'ore_mana', quantity: 1 }], [{ itemId: 'mana_thread', quantity: 1 }], 1120, 'alchemy_table'),
  recipe('craft:mana_thread_spool', '마나 실타래', 'mid', 'material', [{ itemId: 'fiber', quantity: 18 }, { itemId: 'ore_mana', quantity: 5 }, { itemId: 'crystal', quantity: 1 }], [{ itemId: 'mana_thread', quantity: 6 }], 1121, 'alchemy_table'),
  recipe('craft:iron_pickaxe', '철 곡괭이', 'mid', 'tool', [{ itemId: 'iron_ingot', quantity: 4 }, { itemId: 'plank', quantity: 3 }, { itemId: 'rope', quantity: 2 }], [{ itemId: 'iron_pickaxe', quantity: 1 }], 1200, 'advanced_workbench'),
  recipe('craft:iron_axe', '철 도끼', 'mid', 'tool', [{ itemId: 'iron_ingot', quantity: 4 }, { itemId: 'plank', quantity: 3 }, { itemId: 'rope', quantity: 2 }], [{ itemId: 'iron_axe', quantity: 1 }], 1210, 'advanced_workbench'),
  recipe('craft:iron_sword', '철 검', 'mid', 'weapon', [{ itemId: 'iron_ingot', quantity: 5 }, { itemId: 'plank', quantity: 2 }, { itemId: 'hide', quantity: 2 }], [{ itemId: 'iron_sword', quantity: 1 }], 1300, 'advanced_workbench'),
  recipe('craft:hunter_bow', '사냥꾼 활', 'mid', 'weapon', [{ itemId: 'plank', quantity: 5 }, { itemId: 'hide', quantity: 3 }, { itemId: 'mana_thread', quantity: 1 }], [{ itemId: 'hunter_bow', quantity: 1 }], 1310, 'advanced_workbench'),
  recipe('craft:hide_armor', '가죽 방어구', 'mid', 'equipment', [{ itemId: 'hide', quantity: 8 }, { itemId: 'cloth', quantity: 4 }, { itemId: 'rope', quantity: 2 }], [{ itemId: 'hide_armor', quantity: 1 }], 1320, 'loom'),
  recipe('craft:iron_armor', '철 방어구', 'mid', 'equipment', [{ itemId: 'iron_ingot', quantity: 8 }, { itemId: 'hide', quantity: 4 }, { itemId: 'cloth', quantity: 3 }], [{ itemId: 'iron_armor', quantity: 1 }], 1330, 'advanced_workbench'),
  recipe('craft:explorer_pack', '탐험가 배낭', 'mid', 'equipment', [{ itemId: 'cloth', quantity: 8 }, { itemId: 'hide', quantity: 5 }, { itemId: 'rope', quantity: 4 }], [{ itemId: 'explorer_pack', quantity: 1 }], 1340, 'loom'),
  recipe('craft:capture_orb_refined', '정제 포획구', 'mid', 'capture', [{ itemId: 'capture_orb_basic', quantity: 1 }, { itemId: 'copper_ingot', quantity: 2 }, { itemId: 'crystal', quantity: 1 }], [{ itemId: 'capture_orb_refined', quantity: 1 }], 1400, 'alchemy_table'),
  recipe('craft:capture_orb_refined_pack', '정제 포획구 꾸러미', 'mid', 'capture', [{ itemId: 'capture_orb_basic', quantity: 6 }, { itemId: 'copper_ingot', quantity: 8 }, { itemId: 'crystal', quantity: 4 }], [{ itemId: 'capture_orb_refined', quantity: 6 }], 1401, 'alchemy_table'),
  recipe('craft:mana_potion', '마나 포션', 'mid', 'consumable', [{ itemId: 'ore_mana', quantity: 1 }, { itemId: 'fiber', quantity: 2 }, { itemId: 'crystal', quantity: 1 }], [{ itemId: 'mana_potion', quantity: 1 }], 1410, 'alchemy_table'),
  recipe('craft:mana_potion_pack', '마나 포션 꾸러미', 'mid', 'consumable', [{ itemId: 'ore_mana', quantity: 6 }, { itemId: 'cloth', quantity: 2 }, { itemId: 'crystal', quantity: 4 }], [{ itemId: 'mana_potion', quantity: 6 }], 1411, 'alchemy_table'),
];

const LATE_RECIPES: CraftingRecipeDefinition[] = [
  recipe('craft:energy_assembler', '에너지 조립기', 'late', 'station', [{ itemId: 'steel_ingot', quantity: 8 }, { itemId: 'circuit_board', quantity: 3 }, { itemId: 'ancient_core', quantity: 1 }], [{ itemId: 'energy_assembler', quantity: 1 }], 2000, 'advanced_workbench'),
  recipe('craft:steel_ingot', '강철 주괴', 'late', 'material', [{ itemId: 'iron_ingot', quantity: 2 }, { itemId: 'coal', quantity: 3 }, { itemId: 'ore_mana', quantity: 1 }], [{ itemId: 'steel_ingot', quantity: 1 }], 2100, 'stone_forge'),
  recipe('craft:steel_ingot_batch', '강철 주괴 대량 제련', 'late', 'material', [{ itemId: 'iron_ingot', quantity: 16 }, { itemId: 'coal', quantity: 18 }, { itemId: 'ore_mana', quantity: 8 }], [{ itemId: 'steel_ingot', quantity: 10 }], 2101, 'stone_forge'),
  recipe('craft:circuit_board', '회로판', 'late', 'material', [{ itemId: 'copper_ingot', quantity: 2 }, { itemId: 'crystal', quantity: 2 }, { itemId: 'mana_thread', quantity: 1 }], [{ itemId: 'circuit_board', quantity: 1 }], 2110, 'advanced_workbench'),
  recipe('craft:circuit_board_batch', '회로판 묶음', 'late', 'material', [{ itemId: 'copper_ingot', quantity: 10 }, { itemId: 'crystal', quantity: 10 }, { itemId: 'mana_thread', quantity: 5 }], [{ itemId: 'circuit_board', quantity: 6 }], 2111, 'advanced_workbench'),
  recipe('craft:energy_cell', '에너지 셀', 'late', 'material', [{ itemId: 'crystal', quantity: 3 }, { itemId: 'circuit_board', quantity: 1 }, { itemId: 'ancient_core', quantity: 1 }], [{ itemId: 'energy_cell', quantity: 1 }], 2120, 'energy_assembler'),
  recipe('craft:energy_cell_pack', '에너지 셀 팩', 'late', 'material', [{ itemId: 'crystal', quantity: 12 }, { itemId: 'circuit_board', quantity: 4 }, { itemId: 'ancient_core', quantity: 3 }], [{ itemId: 'energy_cell', quantity: 5 }], 2121, 'energy_assembler'),
  recipe('craft:steel_pickaxe', '강철 곡괭이', 'late', 'tool', [{ itemId: 'steel_ingot', quantity: 5 }, { itemId: 'energy_cell', quantity: 1 }, { itemId: 'plank', quantity: 3 }], [{ itemId: 'steel_pickaxe', quantity: 1 }], 2200, 'energy_assembler'),
  recipe('craft:steel_blade', '강철 블레이드', 'late', 'weapon', [{ itemId: 'steel_ingot', quantity: 7 }, { itemId: 'energy_cell', quantity: 1 }, { itemId: 'hide', quantity: 3 }], [{ itemId: 'steel_blade', quantity: 1 }], 2300, 'energy_assembler'),
  recipe('craft:glider', '글라이더', 'late', 'equipment', [{ itemId: 'mana_thread', quantity: 4 }, { itemId: 'steel_ingot', quantity: 3 }, { itemId: 'cloth', quantity: 8 }], [{ itemId: 'glider', quantity: 1 }], 2310, 'advanced_workbench'),
  recipe('craft:capture_orb_elite', '엘리트 포획구', 'late', 'capture', [{ itemId: 'capture_orb_refined', quantity: 1 }, { itemId: 'energy_cell', quantity: 1 }, { itemId: 'ancient_core', quantity: 1 }], [{ itemId: 'capture_orb_elite', quantity: 1 }], 2400, 'energy_assembler'),
  recipe('craft:capture_orb_elite_pack', '엘리트 포획구 꾸러미', 'late', 'capture', [{ itemId: 'capture_orb_refined', quantity: 5 }, { itemId: 'energy_cell', quantity: 4 }, { itemId: 'ancient_core', quantity: 3 }], [{ itemId: 'capture_orb_elite', quantity: 5 }], 2401, 'energy_assembler'),
];

const BUILD_PART_RECIPES: CraftingRecipeDefinition[] = BUILD_PART_LIST.map((part, index): CraftingRecipeDefinition => {
  const tier: CraftingTier = part.id.includes('stone') ? 'mid' : 'early';
  const category = getBuildPartRecipeCategory(part.category);
  return {
    id: `craft:build_part:${part.id}`,
    label: `${part.label} 제작`,
    description: '건설 모드에서 배치할 수 있는 건설 부품을 제작합니다.',
    tier,
    category,
    inputs: part.placementCost,
    outputs: [{ itemId: createBuildPartItemId(part.id), quantity: 1 }],
    requiredStation: part.id.includes('stone') ? 'advanced_workbench' : 'workbench',
    craftSeconds: getCraftSeconds(tier, category, `craft:build_part:${part.id}`),
    sortOrder: 3000 + index,
  };
});

export const CRAFTING_RECIPES: CraftingRecipeDefinition[] = [
  ...EARLY_RECIPES,
  ...MID_RECIPES,
  ...LATE_RECIPES,
  ...BUILD_PART_RECIPES,
];

export function getCraftingRecipe(recipeId: string): CraftingRecipeDefinition | null {
  return CRAFTING_RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
}

function recipe(
  id: string,
  label: string,
  tier: CraftingTier,
  category: CraftingRecipeCategory,
  inputs: CraftingRecipeDefinition['inputs'],
  outputs: CraftingRecipeDefinition['outputs'],
  sortOrder: number,
  requiredStation?: InventoryItemId,
): CraftingRecipeDefinition {
  return {
    id,
    label,
    description: getRecipeDescription(tier, category),
    tier,
    category,
    inputs,
    outputs,
    requiredStation,
    craftSeconds: getCraftSeconds(tier, category, id),
    sortOrder,
  };
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

function getRecipeDescription(tier: CraftingTier, category: CraftingRecipeCategory): string {
  return `${getTierLabel(tier)} ${getCategoryLabel(category)} 제작법입니다.`;
}

function getCraftSeconds(tier: CraftingTier, category: CraftingRecipeCategory, recipeId: string): number {
  const base = getTierBaseCraftSeconds(tier);
  const categoryMultiplier = getCategoryCraftMultiplier(category);
  const batchMultiplier = isBatchRecipe(recipeId) ? 1.75 : 1;
  return roundCraftSeconds(base * categoryMultiplier * batchMultiplier);
}

function getTierBaseCraftSeconds(tier: CraftingTier): number {
  switch (tier) {
    case 'early':
      return 1.2;
    case 'mid':
      return 3;
    case 'late':
      return 6;
  }
}

function getCategoryCraftMultiplier(category: CraftingRecipeCategory): number {
  switch (category) {
    case 'material':
      return 0.75;
    case 'consumable':
      return 0.8;
    case 'building_floor':
    case 'building_wall':
    case 'building_support':
    case 'building_roof':
    case 'building_door':
    case 'building_window':
      return 0.9;
    case 'tool':
    case 'weapon':
    case 'equipment':
      return 1.25;
    case 'capture':
      return 1.35;
    case 'station':
      return 1.6;
  }
}

function isBatchRecipe(recipeId: string): boolean {
  return recipeId.includes('bundle') || recipeId.includes('batch') || recipeId.includes('pack') || recipeId.includes('roll') || recipeId.includes('spool');
}

function roundCraftSeconds(value: number): number {
  return Math.max(0.5, Math.round(value * 10) / 10);
}

function getTierLabel(tier: CraftingTier): string {
  switch (tier) {
    case 'early':
      return '초반';
    case 'mid':
      return '중반';
    case 'late':
      return '후반';
  }
}

function getCategoryLabel(category: CraftingRecipeCategory): string {
  switch (category) {
    case 'material':
      return '재료';
    case 'station':
      return '제작도구';
    case 'equipment':
      return '장비';
    case 'weapon':
      return '무기';
    case 'tool':
      return '도구';
    case 'consumable':
      return '소모품';
    case 'capture':
      return '포획';
    default:
      return '건설';
  }
}
