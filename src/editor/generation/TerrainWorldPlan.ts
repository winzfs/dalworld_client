import type { EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainNatural } from './TerrainWorldPlanNatural';

export async function generateWorldPlanTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  return generateWorldPlanTerrainNatural(options);
}
