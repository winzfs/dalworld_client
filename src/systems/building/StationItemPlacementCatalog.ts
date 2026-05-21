import type { BuildPartId } from './BuildingTypes';

const STATION_ITEM_TO_BUILD_PART: Record<string, BuildPartId> = {
  workbench: 'station_workbench',
};

export function getStationBuildPartIdFromItemId(itemId: string): BuildPartId | null {
  return STATION_ITEM_TO_BUILD_PART[itemId] ?? null;
}

export function isPlaceableStationItem(itemId: string): boolean {
  return getStationBuildPartIdFromItemId(itemId) !== null;
}
