import type { EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainV2 } from './TerrainWorldPlanV2';

export async function generateWorldPlanTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  return generateWorldPlanTerrainV2(options);
}
