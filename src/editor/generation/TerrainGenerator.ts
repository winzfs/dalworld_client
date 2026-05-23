import type { EditorTerrainRuleSet, EditorTilePlacement, EditorTilesetAsset } from '../types';
import { generateWorldPlanTerrain } from './TerrainWorldPlan';

export type TerrainGenerationShape = 'rect' | 'island';

export type BasicTerrainGenerationOptions = {
  tilesets: EditorTilesetAsset[];
  width: number;
  height: number;
  gridSize: number;
  terrainRuleSet?: EditorTerrainRuleSet;
  shape?: TerrainGenerationShape;
  seed?: number;
  maxPlacements?: number;
};

export async function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  return generateWorldPlanTerrain(options);
}
