import type { EditorTerrainTileRole, EditorTilePlacement } from '../types';
import type { BasicTerrainGenerationOptions } from './TerrainGenerator';
import { generateWorldPlanTerrainDebug } from './TerrainWorldPlanDebug';

type DebugPlacement = EditorTilePlacement & {
  terrainDebugRole?: EditorTerrainTileRole;
};

const OVERLAY_ROLES = new Set<EditorTerrainTileRole>([
  'edgeTop',
  'edgeBottom',
  'edgeLeft',
  'edgeRight',
  'outerTopLeft',
  'outerTopRight',
  'outerBottomLeft',
  'outerBottomRight',
  'innerTopLeft',
  'innerTopRight',
  'innerBottomLeft',
  'innerBottomRight',
]);

export async function generateWorldPlanTerrainLayered(options: BasicTerrainGenerationOptions): Promise<EditorTilePlacement[]> {
  const placements = await generateWorldPlanTerrainDebug(options) as DebugPlacement[];
  const visualBaseCandidates = placements.filter((placement) =>
    placement.layer === 'ground'
    && !placement.feature
    && (placement.terrainMaterial === 'grass' || placement.terrainMaterial === 'dirt' || placement.terrainMaterial === 'sand')
    && placement.sourceRect,
  );

  if (visualBaseCandidates.length === 0) return placements;

  const layered: EditorTilePlacement[] = [];
  for (const placement of placements) {
    if (shouldAddUnderlay(placement)) {
      const underlaySource = findNearestVisualBase(visualBaseCandidates, placement);
      if (underlaySource) layered.push(createVisualUnderlay(underlaySource, placement));
    }
    layered.push(placement);
  }

  return layered;
}

function shouldAddUnderlay(placement: DebugPlacement): boolean {
  if (placement.layer !== 'ground') return false;
  if (placement.terrainMaterial !== 'rock') return false;
  const role = placement.terrainDebugRole;
  if (!role) return true;
  return OVERLAY_ROLES.has(role);
}

function findNearestVisualBase(candidates: EditorTilePlacement[], target: EditorTilePlacement): EditorTilePlacement | undefined {
  let best: EditorTilePlacement | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.x - target.x;
    const dy = candidate.y - target.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function createVisualUnderlay(source: EditorTilePlacement, target: EditorTilePlacement): EditorTilePlacement {
  return {
    id: crypto.randomUUID(),
    assetId: source.assetId,
    assetUrl: source.assetUrl,
    categoryId: source.categoryId,
    x: target.x,
    y: target.y,
    layer: 'ground',
    scale: source.scale,
    displayWidth: source.displayWidth,
    displayHeight: source.displayHeight,
    sourceRect: source.sourceRect ? { ...source.sourceRect } : undefined,
    solidColor: source.solidColor,
    transparentBlack: true,
    gameplay: undefined,
    terrainMaterial: undefined,
    terrainMovementMode: undefined,
  };
}
