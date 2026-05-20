import type { BuildPartId } from '../building/BuildingTypes';

export type ItemCategory =
  | 'resource'
  | 'consumable'
  | 'equipment'
  | 'weapon'
  | 'tool'
  | 'crafting_material'
  | 'crafting_station'
  | 'building_part'
  | 'capture'
  | 'pet';

export type InventoryItemId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'hide'
  | 'ore_copper'
  | 'ore_iron'
  | 'ore_mana'
  | 'coal'
  | 'crystal'
  | 'ancient_core'
  | 'plank'
  | 'stone_block'
  | 'rope'
  | 'cloth'
  | 'copper_ingot'
  | 'iron_ingot'
  | 'steel_ingot'
  | 'mana_thread'
  | 'circuit_board'
  | 'energy_cell'
  | 'floor_kit'
  | 'wall_kit'
  | 'roof_kit'
  | 'workbench'
  | 'campfire'
  | 'stone_forge'
  | 'loom'
  | 'advanced_workbench'
  | 'alchemy_table'
  | 'energy_assembler'
  | 'wood_pickaxe'
  | 'stone_pickaxe'
  | 'iron_pickaxe'
  | 'steel_pickaxe'
  | 'wood_axe'
  | 'stone_axe'
  | 'iron_axe'
  | 'wood_sword'
  | 'stone_spear'
  | 'iron_sword'
  | 'steel_blade'
  | 'basic_bow'
  | 'hunter_bow'
  | 'cloth_armor'
  | 'hide_armor'
  | 'iron_armor'
  | 'explorer_pack'
  | 'glider'
  | 'torch'
  | 'healing_salve'
  | 'stamina_food'
  | 'mana_potion'
  | 'capture_orb_basic'
  | 'capture_orb_refined'
  | 'capture_orb_elite'
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

export const BASE_ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  wood: item('wood', '나무', '채집으로 얻는 기본 재료입니다. 제작과 건설에 사용됩니다.', '🪵', 'resource', 999),
  stone: item('stone', '돌', '채집으로 얻는 단단한 재료입니다. 제작과 건설에 사용됩니다.', '🪨', 'resource', 999),
  fiber: item('fiber', '섬유', '풀과 덤불에서 얻는 기본 섬유 재료입니다.', '🧵', 'resource', 999),
  hide: item('hide', '가죽', '몬스터와 야생 생물에게서 얻는 방어구 재료입니다.', '🥾', 'resource', 999),
  ore_copper: item('ore_copper', '구리 광석', '중반 제작의 시작이 되는 금속 광석입니다.', '🟠', 'resource', 999),
  ore_iron: item('ore_iron', '철 광석', '튼튼한 도구와 무기 제작에 필요한 광석입니다.', '⛓️', 'resource', 999),
  ore_mana: item('ore_mana', '마나 광석', '후반 마법/에너지 제작에 쓰이는 희귀 광석입니다.', '💠', 'resource', 999),
  coal: item('coal', '석탄', '제련과 고급 제작에 필요한 연료입니다.', '⚫', 'resource', 999),
  crystal: item('crystal', '수정', '에너지 장치와 고급 포획 장비에 쓰입니다.', '🔷', 'resource', 999),
  ancient_core: item('ancient_core', '고대 코어', '후반 장비와 자동화 장치의 핵심 재료입니다.', '🧿', 'resource', 99),

  plank: item('plank', '목재 판자', '나무를 가공한 기본 건축/제작 재료입니다.', '🟫', 'crafting_material', 999),
  stone_block: item('stone_block', '석재 블록', '돌을 가공한 건축/제작 재료입니다.', '▣', 'crafting_material', 999),
  rope: item('rope', '밧줄', '도구, 활, 장비 제작에 쓰이는 기본 재료입니다.', '🪢', 'crafting_material', 999),
  cloth: item('cloth', '천', '방어구, 침구, 소비 아이템에 쓰입니다.', '🧶', 'crafting_material', 999),
  copper_ingot: item('copper_ingot', '구리 주괴', '중반 제작대와 장비의 기본 금속 재료입니다.', '🟧', 'crafting_material', 999),
  iron_ingot: item('iron_ingot', '철 주괴', '중반 이후 도구와 무기의 핵심 금속 재료입니다.', '⬜', 'crafting_material', 999),
  steel_ingot: item('steel_ingot', '강철 주괴', '후반 장비와 강화 건축에 필요한 재료입니다.', '🔩', 'crafting_material', 999),
  mana_thread: item('mana_thread', '마나 실', '마법 장비와 고급 포획구 제작에 쓰입니다.', '🧬', 'crafting_material', 999),
  circuit_board: item('circuit_board', '회로판', '전기/자동화 계열 장치 제작에 쓰입니다.', '🟩', 'crafting_material', 199),
  energy_cell: item('energy_cell', '에너지 셀', '고급 제작 장비와 후반 장비에 쓰이는 동력 부품입니다.', '🔋', 'crafting_material', 99),
  floor_kit: item('floor_kit', '바닥 키트', '바닥 부품 제작에 쓰이는 중간 제작품입니다.', '▱', 'crafting_material', 99),
  wall_kit: item('wall_kit', '벽 키트', '벽/문/창문 계열 부품 제작에 쓰이는 중간 제작품입니다.', '▌', 'crafting_material', 99),
  roof_kit: item('roof_kit', '지붕 키트', '지붕 부품 제작에 쓰이는 중간 제작품입니다.', '⌂', 'crafting_material', 99),

  workbench: item('workbench', '작업대', '초반 제작의 중심이 되는 기본 제작도구입니다.', '🛠️', 'crafting_station', 1, false),
  campfire: item('campfire', '모닥불', '기본 회복 아이템과 음식 제작에 쓰입니다.', '🔥', 'crafting_station', 1, false),
  stone_forge: item('stone_forge', '석재 화로', '광석을 주괴로 제련하는 제작도구입니다.', '🏭', 'crafting_station', 1, false),
  loom: item('loom', '직조대', '섬유를 천과 특수 실로 가공합니다.', '🧶', 'crafting_station', 1, false),
  advanced_workbench: item('advanced_workbench', '고급 작업대', '중반 이후 장비와 복합 재료 제작에 필요합니다.', '⚙️', 'crafting_station', 1, false),
  alchemy_table: item('alchemy_table', '연금 작업대', '포션, 마나 재료, 포획구 제작에 필요합니다.', '⚗️', 'crafting_station', 1, false),
  energy_assembler: item('energy_assembler', '에너지 조립기', '후반 자동화/에너지 장비 제작에 필요합니다.', '🔌', 'crafting_station', 1, false),

  wood_pickaxe: item('wood_pickaxe', '나무 곡괭이', '돌과 기초 광물을 캐기 위한 초반 도구입니다.', '⛏️', 'tool', 1, false),
  stone_pickaxe: item('stone_pickaxe', '돌 곡괭이', '구리 광석 채굴에 적합한 초반 강화 도구입니다.', '⛏️', 'tool', 1, false),
  iron_pickaxe: item('iron_pickaxe', '철 곡괭이', '철과 마나 광석 채굴에 필요한 중반 도구입니다.', '⛏️', 'tool', 1, false),
  steel_pickaxe: item('steel_pickaxe', '강철 곡괭이', '후반 희귀 광물 채굴용 고급 도구입니다.', '⛏️', 'tool', 1, false),
  wood_axe: item('wood_axe', '나무 도끼', '나무 채집 효율을 높이는 초반 도구입니다.', '🪓', 'tool', 1, false),
  stone_axe: item('stone_axe', '돌 도끼', '나무와 섬유 채집에 좋은 강화 도구입니다.', '🪓', 'tool', 1, false),
  iron_axe: item('iron_axe', '철 도끼', '중반 채집 효율을 크게 높이는 도구입니다.', '🪓', 'tool', 1, false),

  wood_sword: item('wood_sword', '나무 검', '가장 기본적인 근접 무기입니다.', '🗡️', 'weapon', 1, false),
  stone_spear: item('stone_spear', '돌 창', '초반 사냥에 적합한 사거리 있는 무기입니다.', '🔱', 'weapon', 1, false),
  iron_sword: item('iron_sword', '철 검', '중반 전투를 위한 안정적인 근접 무기입니다.', '⚔️', 'weapon', 1, false),
  steel_blade: item('steel_blade', '강철 블레이드', '후반 전투용 고급 근접 무기입니다.', '🗡️', 'weapon', 1, false),
  basic_bow: item('basic_bow', '기초 활', '초반 원거리 전투와 사냥에 쓰입니다.', '🏹', 'weapon', 1, false),
  hunter_bow: item('hunter_bow', '사냥꾼 활', '중반 원거리 전투에 쓰이는 강화 활입니다.', '🏹', 'weapon', 1, false),

  cloth_armor: item('cloth_armor', '천 방어구', '초반 생존을 돕는 가벼운 방어구입니다.', '🥋', 'equipment', 1, false),
  hide_armor: item('hide_armor', '가죽 방어구', '초중반 탐험에 적합한 방어구입니다.', '🦺', 'equipment', 1, false),
  iron_armor: item('iron_armor', '철 방어구', '중반 전투와 탐험을 위한 튼튼한 방어구입니다.', '🛡️', 'equipment', 1, false),
  explorer_pack: item('explorer_pack', '탐험가 배낭', '탐험과 채집 장거리 루프를 위한 장비입니다.', '🎒', 'equipment', 1, false),
  glider: item('glider', '글라이더', '지형 탐험과 이동을 돕는 중후반 장비입니다.', '🪂', 'equipment', 1, false),

  torch: item('torch', '횃불', '밤 탐험과 초반 거점 확보에 쓰입니다.', '🕯️', 'consumable', 99),
  healing_salve: item('healing_salve', '회복 연고', 'HP 회복에 쓰이는 기본 소비 아이템입니다.', '🧴', 'consumable', 99),
  stamina_food: item('stamina_food', '스태미나 음식', '스태미나 회복에 쓰이는 간단한 음식입니다.', '🍖', 'consumable', 99),
  mana_potion: item('mana_potion', '마나 포션', '마나/특수 행동 시스템 확장용 소비 아이템입니다.', '🧪', 'consumable', 99),
  capture_orb_basic: item('capture_orb_basic', '기초 포획구', '약한 몬스터를 포획하기 위한 초반 아이템입니다.', '🔴', 'capture', 99),
  capture_orb_refined: item('capture_orb_refined', '정제 포획구', '중반 몬스터 포획에 쓰이는 강화 아이템입니다.', '🟣', 'capture', 99),
  capture_orb_elite: item('capture_orb_elite', '엘리트 포획구', '강력한 몬스터 포획용 후반 아이템입니다.', '🟡', 'capture', 99),
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

function item(
  id: Exclude<InventoryItemId, `build_part:${BuildPartId}`>,
  label: string,
  description: string,
  icon: string,
  category: ItemCategory,
  maxStack: number,
  stackable = true,
): ItemDefinition {
  return { id, label, description, icon, category, stackable, maxStack };
}
