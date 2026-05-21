import type { EditorMonsterSpecOverrides, EditorMonsterType } from './types';

export type EditorMonsterDefaultStats = Required<EditorMonsterSpecOverrides>;

/**
 * Display-only mirror of dalworld_server/src/systems/monster/MonsterDefinitions.ts.
 * The server remains authoritative; the map editor uses these values only to show
 * what an empty override field will resolve to at runtime.
 */
export const EDITOR_MONSTER_DEFAULT_STATS: Record<EditorMonsterType, EditorMonsterDefaultStats> = {
  wild_slime: {
    maxHp: 50,
    moveSpeed: 80,
    detectRange: 250,
    loseRange: 450,
    attackRange: 42,
    attackDamage: 8,
    attackCooldownMs: 900,
  },
  sheep: {
    maxHp: 35,
    moveSpeed: 65,
    detectRange: 180,
    loseRange: 320,
    attackRange: 34,
    attackDamage: 2,
    attackCooldownMs: 1200,
  },
};

export const EDITOR_MONSTER_STAT_LABELS: Record<keyof EditorMonsterDefaultStats, string> = {
  maxHp: 'HP',
  moveSpeed: '이동속도',
  detectRange: '감지범위',
  loseRange: '추적해제',
  attackRange: '공격범위',
  attackDamage: '공격력',
  attackCooldownMs: '공격쿨(ms)',
};

export function getEditorMonsterDefaultStats(type: EditorMonsterType): EditorMonsterDefaultStats {
  return EDITOR_MONSTER_DEFAULT_STATS[type] ?? EDITOR_MONSTER_DEFAULT_STATS.wild_slime;
}
