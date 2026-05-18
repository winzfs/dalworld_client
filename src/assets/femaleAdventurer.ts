import type { Facing } from '../protocol/messages';

export type FemaleAdventurerAnim = 'idle' | 'walk' | 'dash' | 'jump' | 'death';

export type FemaleAdventurerConfig = {
  id: 'female_adventurer';
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  scale: number;
  anchor: { x: number; y: number };
  facings: readonly Facing[];
  animations: readonly FemaleAdventurerAnim[];
  fps: Record<FemaleAdventurerAnim, number>;
  sheets: Record<FemaleAdventurerAnim, Record<Facing, string>>;
};

const BASE = '/assets/characters/female_adventurer';

export const FEMALE_ADVENTURER: FemaleAdventurerConfig = {
  id: 'female_adventurer',
  frameWidth: 48,
  frameHeight: 64,
  frameCount: 8,
  scale: 2,
  anchor: { x: 0.5, y: 0.8 },
  facings: ['down', 'left', 'up', 'right'],
  animations: ['idle', 'walk', 'dash', 'jump', 'death'],
  fps: {
    idle: 7,
    walk: 10,
    dash: 14,
    jump: 10,
    death: 8,
  },
  sheets: {
    idle: {
      down: `${BASE}/Idle/Idle_Down.png`,
      up: `${BASE}/Idle/Idle_Up.png`,
      left: `${BASE}/Idle/Idle_Left_Down.png`,
      right: `${BASE}/Idle/Idle_Right_Down.png`,
    },
    walk: {
      down: `${BASE}/Walk/walk_Down.png`,
      up: `${BASE}/Walk/walk_Up.png`,
      left: `${BASE}/Walk/walk_Left_Down.png`,
      right: `${BASE}/Walk/walk_Right_Down.png`,
    },
    dash: {
      down: `${BASE}/Dash/Dash_Down.png`,
      up: `${BASE}/Dash/Dash_Up.png`,
      left: `${BASE}/Dash/Dash_Left_Down.png`,
      right: `${BASE}/Dash/Dash_Right_Down.png`,
    },
    jump: {
      down: `${BASE}/Jump - NEW/Normal/Jump_Down.png`,
      up: `${BASE}/Jump - NEW/Normal/Jump_up.png`,
      left: `${BASE}/Jump - NEW/Normal/Jump_Left_Down.png`,
      right: `${BASE}/Jump - NEW/Normal/Jump_Right_Down.png`,
    },
    death: {
      down: `${BASE}/Death/death_Down.png`,
      up: `${BASE}/Death/death_Up.png`,
      left: `${BASE}/Death/death_Left_Down.png`,
      right: `${BASE}/Death/death_Right_Down.png`,
    },
  },
};
