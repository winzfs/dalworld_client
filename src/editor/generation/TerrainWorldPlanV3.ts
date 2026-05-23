import type { EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainV2 } from './TerrainWorldPlanV2';

export async function generateWorldPlanTerrainV3(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainV2(options);
  return placements.map((placement) => {
    if (placement.terrainMaterial !== 'rock') return placement;
    return { ...placement, transparentBlack: true };
  });
}
