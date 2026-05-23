import type { EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainLayeredV2 } from './TerrainWorldPlanLayeredV2';

export async function generateWorldPlanTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  return generateWorldPlanTerrainLayeredV2(options);
}
