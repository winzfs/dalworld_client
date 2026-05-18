import type { Facing } from '../protocol/messages';

export type FemaleAdventurerAnim = 'idle' | 'walk';

export const FEMALE_ADVENTURER_FRAME_WIDTH = 48;
export const FEMALE_ADVENTURER_FRAME_HEIGHT = 64;
export const FEMALE_ADVENTURER_FRAME_COUNT = 8;

export const FEMALE_ADVENTURER_FPS: Record<FemaleAdventurerAnim, number> = {
  idle: 7,
  walk: 10,
};

/**
 * Runtime asset paths for The Female Adventurer - Free.
 * Put the extracted PNG folders under:
 * public/assets/characters/female_adventurer/
 *
 * The current server protocol exposes 4-way Facing only, so diagonal strips are
 * intentionally not selected here yet. They can be enabled later once the
 * authoritative snapshot protocol sends 8-way direction values.
 */
export const FEMALE_ADVENTURER_SHEETS: Record<FemaleAdventurerAnim, Record<Facing, string>> = {
  idle: {
    down: '/assets/characters/female_adventurer/Idle/Idle_Down.png',
    up: '/assets/characters/female_adventurer/Idle/Idle_Up.png',
    left: '/assets/characters/female_adventurer/Idle/Idle_Left_Down.png',
    right: '/assets/characters/female_adventurer/Idle/Idle_Right_Down.png',
  },
  walk: {
    down: '/assets/characters/female_adventurer/Walk/walk_Down.png',
    up: '/assets/characters/female_adventurer/Walk/walk_Up.png',
    left: '/assets/characters/female_adventurer/Walk/walk_Left_Down.png',
    right: '/assets/characters/female_adventurer/Walk/walk_Right_Down.png',
  },
};
