import type { BuildPartDefinition, BuildPartId } from "./BuildingTypes";

const FLOOR_SUPPORTS: BuildPartId[] = [
  "floor_1x1",
  "stone_floor_1x1",
  "deck_floor_1x1",
  "wood_half_floor",
  "stone_half_floor",
  "wood_round_floor",
  "stone_round_floor",
];
const STAIR_SUPPORTS: BuildPartId[] = [...FLOOR_SUPPORTS, "wood_stairs", "stone_stairs"];
const WALL_SUPPORTS: BuildPartId[] = [
  "thin_wall",
  "stone_wall",
  "half_wall",
  "railing",
  "fence",
  "wood_wall_corner",
  "stone_wall_corner",
  "wood_wall_end",
  "stone_wall_end",
  "wood_gable_wall",
  "stone_gable_wall",
  "wood_round_wall",
  "stone_round_wall",
  "pillar",
  "stone_pillar",
  "short_post",
  "door",
  "stone_door",
  "window",
  "wide_window",
];

function common(
  id: BuildPartId,
  label: string,
  category: BuildPartDefinition["category"],
  slotKind: BuildPartDefinition["slotKind"],
  icon: string,
  blocksMovement: boolean,
  requiresSupport: boolean,
  allowedOn: BuildPartDefinition["allowedOn"],
  placementCost: BuildPartDefinition["placementCost"],
): BuildPartDefinition {
  return {
    id,
    label,
    category,
    slotKind,
    icon,
    spriteKey: `build_${id}`,
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement,
    requiresSupport,
    allowedOn,
    placementCost,
  };
}

export const BUILD_PARTS: Record<BuildPartId, BuildPartDefinition> = {
  floor_1x1: common("floor_1x1", "나무 바닥", "floor", "tile", "▱", false, false, "ground", [{ itemId: "wood", quantity: 1 }]),
  stone_floor_1x1: common("stone_floor_1x1", "돌 바닥", "floor", "tile", "▰", false, false, "ground", [{ itemId: "stone", quantity: 2 }]),
  deck_floor_1x1: common("deck_floor_1x1", "데크 바닥", "floor", "tile", "▤", false, false, "ground", [{ itemId: "wood", quantity: 2 }]),
  wood_half_floor: common("wood_half_floor", "나무 반칸 바닥", "floor", "tile", "◧", false, false, "ground", [{ itemId: "wood", quantity: 1 }]),
  stone_half_floor: common("stone_half_floor", "돌 반칸 바닥", "floor", "tile", "◨", false, false, "ground", [{ itemId: "stone", quantity: 1 }]),
  wood_stairs: common("wood_stairs", "나무 계단", "floor", "edge", "▟", false, true, STAIR_SUPPORTS, [{ itemId: "wood", quantity: 3 }]),
  stone_stairs: common("stone_stairs", "돌 계단", "floor", "edge", "◢", false, true, STAIR_SUPPORTS, [{ itemId: "stone", quantity: 4 }]),
  wood_round_floor: common("wood_round_floor", "나무 원형바닥", "floor", "tile", "◜", false, false, "ground", [{ itemId: "wood", quantity: 2 }]),
  stone_round_floor: common("stone_round_floor", "돌 원형바닥", "floor", "tile", "◝", false, false, "ground", [{ itemId: "stone", quantity: 3 }]),

  thin_wall: common("thin_wall", "나무 벽", "wall", "edge", "▌", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  stone_wall: common("stone_wall", "돌 벽", "wall", "edge", "▥", true, true, FLOOR_SUPPORTS, [{ itemId: "stone", quantity: 3 }]),
  half_wall: common("half_wall", "반벽", "wall", "edge", "▂", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),
  railing: common("railing", "난간", "wall", "edge", "╫", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),
  fence: common("fence", "울타리", "wall", "edge", "♯", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),
  wood_wall_corner: common("wood_wall_corner", "나무 코너 벽", "wall", "corner", "┏", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  stone_wall_corner: common("stone_wall_corner", "돌 코너 벽", "wall", "corner", "┓", true, true, FLOOR_SUPPORTS, [{ itemId: "stone", quantity: 3 }]),
  wood_wall_end: common("wood_wall_end", "나무 벽 끝마감", "wall", "edge", "▐", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),
  stone_wall_end: common("stone_wall_end", "돌 벽 끝마감", "wall", "edge", "▧", true, true, FLOOR_SUPPORTS, [{ itemId: "stone", quantity: 2 }]),
  wood_gable_wall: common("wood_gable_wall", "나무 박공 벽", "wall", "edge", "△", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  stone_gable_wall: common("stone_gable_wall", "돌 박공 벽", "wall", "edge", "▲", true, true, FLOOR_SUPPORTS, [{ itemId: "stone", quantity: 3 }]),
  wood_round_wall: common("wood_round_wall", "나무 원형벽", "wall", "edge", "◠", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  stone_round_wall: common("stone_round_wall", "돌 원형벽", "wall", "edge", "◡", true, true, FLOOR_SUPPORTS, [{ itemId: "stone", quantity: 3 }]),

  roof_1x1: common("roof_1x1", "나무 지붕", "roof", "tile", "⌂", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 2 }, { itemId: "stone", quantity: 1 }]),
  flat_roof_1x1: common("flat_roof_1x1", "평지붕", "roof", "tile", "▔", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  thatch_roof_1x1: common("thatch_roof_1x1", "초가지붕", "roof", "tile", "⌃", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),
  wood_roof_slope: common("wood_roof_slope", "나무 경사 지붕", "roof", "tile", "◿", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 3 }]),
  stone_roof_slope: common("stone_roof_slope", "돌 경사 지붕", "roof", "tile", "◺", true, true, WALL_SUPPORTS, [{ itemId: "stone", quantity: 4 }]),
  thatch_roof_slope: common("thatch_roof_slope", "초가 경사 지붕", "roof", "tile", "⌃", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  wood_eave: common("wood_eave", "나무 처마", "roof", "edge", "﹀", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),
  stone_eave: common("stone_eave", "돌 처마", "roof", "edge", "︾", true, true, WALL_SUPPORTS, [{ itemId: "stone", quantity: 2 }]),
  thatch_eave: common("thatch_eave", "초가 처마", "roof", "edge", "⌄", true, true, WALL_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),

  pillar: common("pillar", "나무 기둥", "support", "corner", "▮", true, true, [...FLOOR_SUPPORTS, "pillar", "stone_pillar", "short_post"], [{ itemId: "wood", quantity: 2 }]),
  stone_pillar: common("stone_pillar", "돌 기둥", "support", "corner", "▯", true, true, [...FLOOR_SUPPORTS, "pillar", "stone_pillar", "short_post"], [{ itemId: "stone", quantity: 2 }]),
  short_post: common("short_post", "짧은 말뚝", "support", "corner", "▪", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }]),

  door: common("door", "나무 문", "door", "edge", "▯", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 2 }]),
  stone_door: common("stone_door", "돌문", "door", "edge", "▢", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }, { itemId: "stone", quantity: 2 }]),
  window: common("window", "창문", "window", "edge", "▣", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 1 }, { itemId: "stone", quantity: 1 }]),
  wide_window: common("wide_window", "넓은 창문", "window", "edge", "▦", true, true, FLOOR_SUPPORTS, [{ itemId: "wood", quantity: 2 }, { itemId: "stone", quantity: 1 }]),
};

export const BUILD_PART_LIST = Object.values(BUILD_PARTS);

export function getBuildPartDefinition(partId: BuildPartId): BuildPartDefinition {
  return BUILD_PARTS[partId];
}
