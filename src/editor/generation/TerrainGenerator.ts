import type { EditorBrush, EditorTilePlacement } from '../types';

export type BasicTerrainGenerationOptions = {
  brush?: EditorBrush;
  brushes?: EditorBrush[];
  width: number;
  height: number;
  gridSize: number;
  maxPlacements?: number;
};

const DEFAULT_MAX_PLACEMENTS = 12000;

export function generateBasicGroundTerrain(options: BasicTerrainGenerationOptions): EditorTilePlacement[] {
  const terrainBrushes = normalizeBrushes(options.brushes, options.brush);
  if (terrainBrushes.length === 0) return [];

  const gridSize = normalizeGridSize(options.gridSize);
  const width = normalizePositiveInteger(options.width, 3000);
  const height = normalizePositiveInteger(options.height, 3000);
  const maxPlacements = normalizePositiveInteger(options.maxPlacements, DEFAULT_MAX_PLACEMENTS);
  const placements: EditorTilePlacement[] = [];

  let index = 0;
  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      if (placements.length >= maxPlacements) return placements;
      const brush = terrainBrushes[index % terrainBrushes.length];
      placements.push(createGroundPlacement(brush, x, y));
      index += 1;
    }
  }

  return placements;
}

function normalizeBrushes(brushes: EditorBrush[] | undefined, fallback: EditorBrush | undefined): EditorBrush[] {
  const source = brushes && brushes.length > 0 ? brushes : fallback ? [fallback] : [];
  const seen = new Set<string>();
  const result: EditorBrush[] = [];

  for (const brush of source) {
    if (!brush?.asset) continue;
    const key = createBrushKey(brush);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ asset: brush.asset, sourceRect: brush.sourceRect ? { ...brush.sourceRect } : undefined });
  }

  return result;
}

function createBrushKey(brush: EditorBrush): string {
  return JSON.stringify({
    assetId: brush.asset.id,
    assetUrl: brush.asset.url,
    sourceRect: brush.sourceRect,
    solidColor: brush.asset.solidColor,
  });
}

function createGroundPlacement(brush: EditorBrush, x: number, y: number): EditorTilePlacement {
  const asset = brush.asset;
  const sourceRect = brush.sourceRect ? { ...brush.sourceRect } : undefined;

  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    assetUrl: asset.url,
    categoryId: asset.categoryId,
    x,
    y,
    layer: 'ground',
    scale: 1,
    displayWidth: sourceRect?.width ?? asset.tileWidth,
    displayHeight: sourceRect?.height ?? asset.tileHeight,
    sourceRect,
    solidColor: asset.solidColor,
    transparentBlack: false,
    gameplay: undefined,
  };
}

function normalizeGridSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 32;
  return Math.max(1, Math.min(256, Math.round(value)));
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value as number));
}
