export type TimeOfDayMode = 'day' | 'night';

export type TimeOfDayState = {
  mode: TimeOfDayMode;
};

export const DEFAULT_TIME_OF_DAY: TimeOfDayState = { mode: 'day' };

export function normalizeTimeOfDay(value: TimeOfDayState | undefined): TimeOfDayState {
  if (!value || (value.mode !== 'day' && value.mode !== 'night')) {
    return DEFAULT_TIME_OF_DAY;
  }

  return value;
}
