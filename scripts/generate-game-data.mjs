#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const outputPath = resolve(root, 'src/generated/gameData.ts');

const DATA_FILES = {
  items: 'items.json',
  recipes: 'recipes.json',
  monsters: 'monsters.json',
  buildingParts: 'buildingParts.json',
};

function readJson(name) {
  const path = resolve(dataDir, name);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertArray(name, value) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array.`);
  }
}

function assertUniqueIds(name, entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`${name} contains an entry without a valid string id.`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`${name} contains duplicated id: ${entry.id}`);
    }
    seen.add(entry.id);
  }
}

function assertStackList(name, fieldName, stacks, itemIds) {
  if (!Array.isArray(stacks)) {
    throw new Error(`${name}.${fieldName} must be an array.`);
  }
  for (const stack of stacks) {
    if (!stack || typeof stack.itemId !== 'string' || !itemIds.has(stack.itemId)) {
      throw new Error(`${name}.${fieldName} references unknown itemId: ${stack?.itemId}`);
    }
    if (!Number.isInteger(stack.quantity) || stack.quantity < 0) {
      throw new Error(`${name}.${fieldName} has invalid quantity for ${stack.itemId}.`);
    }
  }
}

const items = readJson(DATA_FILES.items);
const recipes = readJson(DATA_FILES.recipes);
const monsters = readJson(DATA_FILES.monsters);
const buildingParts = readJson(DATA_FILES.buildingParts);

for (const [name, value] of Object.entries({ items, recipes, monsters, buildingParts })) {
  assertArray(name, value);
  assertUniqueIds(name, value);
}

const itemIds = new Set(items.map((item) => item.id));
const buildingPartIds = new Set(buildingParts.map((part) => part.id));

for (const item of items) {
  if (!Number.isInteger(item.stackLimit) || item.stackLimit <= 0) {
    throw new Error(`items.${item.id}.stackLimit must be a positive integer.`);
  }
}

for (const recipe of recipes) {
  assertStackList(`recipes.${recipe.id}`, 'inputs', recipe.inputs, itemIds);
  assertStackList(`recipes.${recipe.id}`, 'outputs', recipe.outputs, itemIds);
  if (recipe.unlocksPartId && !buildingPartIds.has(recipe.unlocksPartId)) {
    throw new Error(`recipes.${recipe.id}.unlocksPartId references unknown part: ${recipe.unlocksPartId}`);
  }
}

for (const part of buildingParts) {
  assertStackList(`buildingParts.${part.id}`, 'placementCost', part.placementCost, itemIds);
  assertStackList(`buildingParts.${part.id}`, 'refundOnRemove', part.refundOnRemove, itemIds);
}

const generated = `// AUTO-GENERATED FILE. Do not edit by hand.\n// Run \`npm run data:generate\` after editing data/*.json.\n\nexport type GameDataItemCategory = 'material' | 'consumable' | 'equipment' | 'quest' | 'misc';\n\nexport type GameDataItemStack = {\n  itemId: GameDataItemId;\n  quantity: number;\n};\n\nexport type GameDataItem = {\n  id: string;\n  displayName: string;\n  category: GameDataItemCategory;\n  stackLimit: number;\n  description: string;\n};\n\nexport type GameDataRecipe = {\n  id: string;\n  displayName: string;\n  category: 'building' | 'crafting' | 'cooking' | 'equipment';\n  inputs: GameDataItemStack[];\n  outputs: GameDataItemStack[];\n  unlocksPartId?: GameDataBuildingPartId;\n};\n\nexport type GameDataMonster = {\n  id: string;\n  displayName: string;\n  maxHp: number;\n  moveSpeed: number;\n  aggroRange: number;\n  attackRange: number;\n  attackDamage: number;\n  attackCooldownMs: number;\n};\n\nexport type GameDataBuildingPart = {\n  id: string;\n  displayName: string;\n  category: 'floor' | 'wall' | 'support' | 'roof' | 'door' | 'window';\n  slotKind: 'tile' | 'edge' | 'corner';\n  size: { w: number; d: number; h: number };\n  blocksMovement: boolean;\n  requiresSupport: boolean;\n  allowedOn: 'any' | 'ground' | GameDataBuildingPartId[];\n  placementCost: GameDataItemStack[];\n  refundOnRemove: GameDataItemStack[];\n};\n\nexport const GAME_DATA_ITEMS = ${JSON.stringify(items, null, 2)} as const;\n\nexport const GAME_DATA_RECIPES = ${JSON.stringify(recipes, null, 2)} as const;\n\nexport const GAME_DATA_MONSTERS = ${JSON.stringify(monsters, null, 2)} as const;\n\nexport const GAME_DATA_BUILDING_PARTS = ${JSON.stringify(buildingParts, null, 2)} as const;\n\nexport type GameDataItemId = (typeof GAME_DATA_ITEMS)[number]['id'];\nexport type GameDataRecipeId = (typeof GAME_DATA_RECIPES)[number]['id'];\nexport type GameDataMonsterId = (typeof GAME_DATA_MONSTERS)[number]['id'];\nexport type GameDataBuildingPartId = (typeof GAME_DATA_BUILDING_PARTS)[number]['id'];\n\nexport const GAME_DATA_ITEM_IDS = GAME_DATA_ITEMS.map((item) => item.id) as readonly GameDataItemId[];\nexport const GAME_DATA_RECIPE_IDS = GAME_DATA_RECIPES.map((recipe) => recipe.id) as readonly GameDataRecipeId[];\nexport const GAME_DATA_MONSTER_IDS = GAME_DATA_MONSTERS.map((monster) => monster.id) as readonly GameDataMonsterId[];\nexport const GAME_DATA_BUILDING_PART_IDS = GAME_DATA_BUILDING_PARTS.map((part) => part.id) as readonly GameDataBuildingPartId[];\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, generated);
console.log(`[game-data] Generated ${outputPath}`);
