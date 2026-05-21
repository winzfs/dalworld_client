import type { BuildPartDefinition, BuildPartId } from './BuildingTypes';

type Row = [BuildPartId, string, BuildPartDefinition['category'], BuildPartDefinition['slotKind'], string, boolean, boolean, BuildPartDefinition['allowedOn'], BuildPartDefinition['placementCost']];

const FLOOR_SUPPORTS: BuildPartId[] = ['floor_1x1', 'stone_floor_1x1', 'deck_floor_1x1', 'wood_half_floor', 'stone_half_floor', 'wood_stair_landing', 'stone_stair_landing', 'wood_round_floor', 'stone_round_floor'];
const STAIR_SUPPORTS: BuildPartId[] = [...FLOOR_SUPPORTS, 'wood_stairs', 'stone_stairs', 'wood_corner_stairs', 'stone_corner_stairs'];
const WALL_SUPPORTS: BuildPartId[] = ['thin_wall', 'wood_wall_sprite_test', 'stone_wall', 'half_wall', 'railing', 'fence', 'wood_wall_corner', 'stone_wall_corner', 'wood_wall_end', 'stone_wall_end', 'wood_gable_wall', 'stone_gable_wall', 'wood_round_wall', 'stone_round_wall', 'wood_beam_horizontal', 'stone_beam_horizontal', 'wood_diagonal_support', 'stone_diagonal_support', 'pillar', 'stone_pillar', 'short_post', 'door', 'stone_door', 'window', 'wide_window'];

const rows: Row[] = [
  ['floor_1x1', '나무 바닥', 'floor', 'tile', '▱', false, false, 'ground', [{ itemId: 'wood', quantity: 1 }]],
  ['stone_floor_1x1', '돌 바닥', 'floor', 'tile', '▰', false, false, 'ground', [{ itemId: 'stone', quantity: 2 }]],
  ['deck_floor_1x1', '데크 바닥', 'floor', 'tile', '▤', false, false, 'ground', [{ itemId: 'wood', quantity: 2 }]],
  ['wood_half_floor', '나무 반칸 바닥', 'floor', 'tile', '◧', false, false, 'ground', [{ itemId: 'wood', quantity: 1 }]],
  ['stone_half_floor', '돌 반칸 바닥', 'floor', 'tile', '◨', false, false, 'ground', [{ itemId: 'stone', quantity: 1 }]],
  ['wood_stair_landing', '나무 계단참', 'floor', 'tile', '▣', false, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_stair_landing', '돌 계단참', 'floor', 'tile', '▣', false, true, FLOOR_SUPPORTS, [{ itemId: 'stone', quantity: 2 }]],
  ['wood_stairs', '나무 계단', 'floor', 'edge', '▟', false, true, STAIR_SUPPORTS, [{ itemId: 'wood', quantity: 3 }]],
  ['stone_stairs', '돌 계단', 'floor', 'edge', '◢', false, true, STAIR_SUPPORTS, [{ itemId: 'stone', quantity: 4 }]],
  ['wood_corner_stairs', '나무 ㄱ자 계단', 'floor', 'corner', '◰', false, true, STAIR_SUPPORTS, [{ itemId: 'wood', quantity: 4 }]],
  ['stone_corner_stairs', '돌 ㄱ자 계단', 'floor', 'corner', '◲', false, true, STAIR_SUPPORTS, [{ itemId: 'stone', quantity: 5 }]],
  ['wood_round_floor', '나무 원형바닥', 'floor', 'tile', '◜', false, false, 'ground', [{ itemId: 'wood', quantity: 2 }]],
  ['stone_round_floor', '돌 원형바닥', 'floor', 'tile', '◝', false, false, 'ground', [{ itemId: 'stone', quantity: 3 }]],
  ['thin_wall', '나무 벽', 'wall', 'edge', '▌', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['wood_wall_sprite_test', '나무 벽 스프라이트 테스트', 'wall', 'edge', '🪵', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_wall', '돌 벽', 'wall', 'edge', '▥', true, true, FLOOR_SUPPORTS, [{ itemId: 'stone', quantity: 3 }]],
  ['half_wall', '반벽', 'wall', 'edge', '▂', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['railing', '난간', 'wall', 'edge', '╫', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['fence', '울타리', 'wall', 'edge', '♯', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['wood_wall_corner', '나무 코너 벽', 'wall', 'corner', '┏', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_wall_corner', '돌 코너 벽', 'wall', 'corner', '┓', true, true, FLOOR_SUPPORTS, [{ itemId: 'stone', quantity: 3 }]],
  ['wood_wall_end', '나무 벽 끝마감', 'wall', 'edge', '▐', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['stone_wall_end', '돌 벽 끝마감', 'wall', 'edge', '▧', true, true, FLOOR_SUPPORTS, [{ itemId: 'stone', quantity: 2 }]],
  ['wood_gable_wall', '나무 박공 벽', 'wall', 'edge', '△', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_gable_wall', '돌 박공 벽', 'wall', 'edge', '▲', true, true, FLOOR_SUPPORTS, [{ itemId: 'stone', quantity: 3 }]],
  ['wood_round_wall', '나무 원형벽', 'wall', 'edge', '◠', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_round_wall', '돌 원형벽', 'wall', 'edge', '◡', true, true, FLOOR_SUPPORTS, [{ itemId: 'stone', quantity: 3 }]],
  ['wood_beam_horizontal', '나무 가로 보', 'support', 'edge', '═', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_beam_horizontal', '돌 가로 보', 'support', 'edge', '═', true, true, WALL_SUPPORTS, [{ itemId: 'stone', quantity: 3 }]],
  ['wood_diagonal_support', '나무 대각 보강재', 'support', 'edge', '╱', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['stone_diagonal_support', '돌 대각 보강재', 'support', 'edge', '╱', true, true, WALL_SUPPORTS, [{ itemId: 'stone', quantity: 2 }]],
  ['roof_1x1', '나무 지붕', 'roof', 'tile', '⌂', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 2 }, { itemId: 'stone', quantity: 1 }]],
  ['flat_roof_1x1', '평지붕', 'roof', 'tile', '▔', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['thatch_roof_1x1', '초가지붕', 'roof', 'tile', '⌃', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['wood_roof_slope', '나무 경사 지붕', 'roof', 'tile', '◿', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 3 }]],
  ['stone_roof_slope', '돌 경사 지붕', 'roof', 'tile', '◺', true, true, WALL_SUPPORTS, [{ itemId: 'stone', quantity: 4 }]],
  ['thatch_roof_slope', '초가 경사 지붕', 'roof', 'tile', '⌃', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['wood_roof_corner', '나무 지붕 코너', 'roof', 'corner', '◫', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 3 }]],
  ['stone_roof_corner', '돌 지붕 코너', 'roof', 'corner', '◫', true, true, WALL_SUPPORTS, [{ itemId: 'stone', quantity: 4 }]],
  ['thatch_roof_corner', '초가 지붕 코너', 'roof', 'corner', '◫', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['wood_roof_ridge', '나무 지붕 마루', 'roof', 'edge', '▔', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['stone_roof_ridge', '돌 지붕 마루', 'roof', 'edge', '▔', true, true, WALL_SUPPORTS, [{ itemId: 'stone', quantity: 2 }]],
  ['thatch_roof_ridge', '초가 지붕 마루', 'roof', 'edge', '▔', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['wood_eave', '나무 처마', 'roof', 'edge', '﹀', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['stone_eave', '돌 처마', 'roof', 'edge', '︾', true, true, WALL_SUPPORTS, [{ itemId: 'stone', quantity: 2 }]],
  ['thatch_eave', '초가 처마', 'roof', 'edge', '⌄', true, true, WALL_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['pillar', '나무 기둥', 'support', 'corner', '▮', true, true, [...FLOOR_SUPPORTS, 'pillar', 'stone_pillar', 'short_post'], [{ itemId: 'wood', quantity: 2 }]],
  ['stone_pillar', '돌 기둥', 'support', 'corner', '▯', true, true, [...FLOOR_SUPPORTS, 'pillar', 'stone_pillar', 'short_post'], [{ itemId: 'stone', quantity: 2 }]],
  ['short_post', '짧은 말뚝', 'support', 'corner', '▪', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }]],
  ['door', '나무 문', 'door', 'edge', '▯', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }]],
  ['stone_door', '돌문', 'door', 'edge', '▢', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }, { itemId: 'stone', quantity: 2 }]],
  ['window', '창문', 'window', 'edge', '▣', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 1 }, { itemId: 'stone', quantity: 1 }]],
  ['wide_window', '넓은 창문', 'window', 'edge', '▦', true, true, FLOOR_SUPPORTS, [{ itemId: 'wood', quantity: 2 }, { itemId: 'stone', quantity: 1 }]],
  ['station_workbench', '작업대', 'station', 'tile', '🛠️', true, false, 'ground', [{ itemId: 'workbench', quantity: 1 }]],
];

function common(...row: Row): BuildPartDefinition {
  const [id, label, category, slotKind, icon, blocksMovement, requiresSupport, allowedOn, placementCost] = row;
  return { id, label, category, slotKind, icon, spriteKey: `build_${id}`, size: { w: 1, d: 1, h: 1 }, anchor: { x: 0.5, y: 1 }, blocksMovement, requiresSupport, allowedOn, placementCost };
}

export const BUILD_PARTS: Record<BuildPartId, BuildPartDefinition> = Object.fromEntries(rows.map((row) => [row[0], common(...row)])) as Record<BuildPartId, BuildPartDefinition>;
export const BUILD_PART_LIST = Object.values(BUILD_PARTS);

export function getBuildPartDefinition(partId: BuildPartId): BuildPartDefinition {
  return BUILD_PARTS[partId];
}
