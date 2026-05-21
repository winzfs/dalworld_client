import type { Facing, MonsterType } from '../protocol/messages';

export type DirectionalRows = Record<Facing, number>;

export type MonsterActionRows = {
  idle: number;
  walk: DirectionalRows;
  attack?: DirectionalRows;
};

export type MonsterSpriteSheetConfig = {
  src: string;
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  rowsCount?: number;
  frameCount: number;
  fps: number;
  scale: number;
  anchor: { x: number; y: number };
  rows: DirectionalRows;
  actionRows?: MonsterActionRows;
};

export type MonsterCollisionConfig = {
  radius: number;
  offsetX: number;
  offsetY: number;
};

export type MonsterFallbackConfig = {
  radius: number;
  idleColor: number;
  chaseColor: number;
};

export type MonsterRenderConfig = {
  type: MonsterType;
  spriteSheet?: MonsterSpriteSheetConfig;
  collision: MonsterCollisionConfig;
  fallback: MonsterFallbackConfig;
};

const DEFAULT_ROWS: DirectionalRows = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};

const SLIME01_ACTION_ROWS: MonsterActionRows = {
  idle: 0,
  walk: {
    down: 1,
    up: 2,
    left: 3,
    right: 4,
  },
  attack: {
    down: 5,
    up: 6,
    left: 7,
    right: 8,
  },
};

export const MONSTER_CONFIGS = {
  wild_slime: {
    type: 'wild_slime',
    spriteSheet: {
      src: '/assets/characters/monsters/slime01.png?v=2',
      columns: 6,
      rowsCount: 9,
      frameCount: 6,
      fps: 8,
      scale: 1.35,
      anchor: { x: 0.5, y: 0.92 },
      rows: SLIME01_ACTION_ROWS.walk,
      actionRows: SLIME01_ACTION_ROWS,
    },
    collision: {
      radius: 18,
      offsetX: 0,
      offsetY: 0,
    },
    fallback: {
      radius: 16,
      idleColor: 0xc62828,
      chaseColor: 0xff5252,
    },
  },
  sheep: {
    type: 'sheep',
    spriteSheet: {
      src: '/assets/characters/monsters/sheep.png?v=2',
      frameWidth: 50,
      frameHeight: 50,
      frameCount: 4,
      fps: 8,
      scale: 0.8,
      anchor: { x: 0.5, y: 1 },
      rows: DEFAULT_ROWS,
    },
    collision: {
      radius: 18,
      offsetX: 0,
      offsetY: -8,
    },
    fallback: {
      radius: 18,
      idleColor: 0xf6f1df,
      chaseColor: 0xfff2c7,
    },
  },
} satisfies Record<MonsterType, MonsterRenderConfig>;

export function getMonsterConfig(type: MonsterType): MonsterRenderConfig {
  return MONSTER_CONFIGS[type] ?? MONSTER_CONFIGS.wild_slime;
}
