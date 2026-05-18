import type { GameWorldMap, WorldMapPlacement } from './types';

let currentMap: GameWorldMap | null = null;

export function setRuntimeWorldMap(map: GameWorldMap | null | undefined): void {
  currentMap = map ?? null;
}

export function getRuntimeWorldMap(): GameWorldMap | null {
  return currentMap;
}

export function getCollisionPlacements(): WorldMapPlacement[] {
  if (!currentMap) return [];

  const out: WorldMapPlacement[] = [];

  for (const cell of currentMap.cells) {
    for (const placement of cell.placements) {
      if (placement.layer === 'collision') {
        out.push(placement);
      }
    }
  }

  return out;
}
