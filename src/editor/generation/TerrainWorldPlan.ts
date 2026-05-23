import type { EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainLayered } from './TerrainWorldPlanLayered';

export async function generateWorldPlanTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  return generateWorldPlanTerrainLayered(options);
}
