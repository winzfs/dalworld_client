import type { EditorPlacementGameplay, EditorTilePlacement, EditorWorldSave } from '../editor/types';
import type { GameWorldMap, WorldMapPlacement, WorldMapPlacementGameplay, WorldMapSourceRect } from './types';

const DEFAULT_CELL_SIZE = 3000;
const MIN_SCALE = 0.1;
const EDITOR_ONLY_PLACEMENT_IDS = new Set(['editor-black-base']);

export function compileRuntimeWorldMap(world: EditorWorldSave): GameWorldMap {
  return {
    version: 1,
    name: world.name,
    tileSize: normalizePositiveNumber(world.tileSize, 32),
    cellSize: normalizePositiveNumber(world.worldMap?.cellSize, DEFAULT_CELL_SIZE),
    cells: world.cells.map((cell) => ({
      gridX: normalizeInteger(cell.gridX, 0),
      gridY: normalizeInteger(cell.gridY, 0),
      placements: cell.draft.placements
        .filter(isRuntimePlacement)
        .map(compilePlacement),
    })),
  };
}

function isRuntimePlacement(placement: EditorTilePlacement): boolean {
  return !EDITOR_ONLY_PLACEMENT_IDS.has(placement.id);
}

function compilePlacement(placement: EditorTilePlacement): WorldMapPlacement {
  const compiled: WorldMapPlacement = {
    id: placement.id,
    assetId: placement.assetId,
    assetUrl: placement.assetUrl,
    categoryId: placement.categoryId,
    x: normalizeFiniteNumber(placement.x, 0),
    y: normalizeFiniteNumber(placement.y, 0),
    layer: placement.layer,
    scale: Math.max(MIN_SCALE, normalizePositiveNumber(placement.scale, 1)),
  };

  const sourceRect = compileSourceRect(placement.sourceRect);
  if (sourceRect) compiled.sourceRect = sourceRect;

  const gameplay = placement.layer === 'collision'
    ? undefined
    : compileGameplay(placement.gameplay) ?? inferGameplayFromAssetUrl(placement.assetUrl);
  if (gameplay) compiled.gameplay = gameplay;

  if (Number.isFinite(placement.solidColor)) {
    compiled.solidColor = placement.solidColor;
  }

  if (placement.transparentBlack === true) {
    compiled.transparentBlack = true;
  }

  return compiled;
}

function compileGameplay(gameplay: EditorPlacementGameplay | undefined): WorldMapPlacementGameplay | undefined {
  if (!gameplay) return undefined;

  if (gameplay.kind === 'resource') {
    return {
      kind: 'resource',
      resourceType: gameplay.resourceType,
      blocksMovement: gameplay.blocksMovement === true,
      maxHp: normalizeOptionalPositiveNumber(gameplay.maxHp),
      respawnMs: normalizeOptionalPositiveNumber(gameplay.respawnMs),
    };
  }

  return undefined;
}

function inferGameplayFromAssetUrl(assetUrl: string): WorldMapPlacementGameplay | undefined {
  const filename = getFilename(assetUrl).toLowerCase();

  if (filename.startsWith('rock')) {
    return {
      kind: 'resource',
      resourceType: 'stone',
      blocksMovement: true,
      maxHp: 100,
      respawnMs: 35_000,
    };
  }

  if (filename.startsWith('tree')) {
    return {
      kind: 'resource',
      resourceType: 'tree',
      blocksMovement: true,
      maxHp: 75,
      respawnMs: 25_000,
    };
  }

  return undefined;
}

function getFilename(url: string): string {
  const cleanUrl = url.split('?')[0]?.split('#')[0] ?? url;
  return cleanUrl.split('/').pop() ?? '';
}

function compileSourceRect(sourceRect: EditorTilePlacement['sourceRect']): WorldMapSourceRect | undefined {
  if (!sourceRect) return undefined;

  const width = normalizePositiveNumber(sourceRect.width, 0);
  const height = normalizePositiveNumber(sourceRect.height, 0);
  if (width <= 0 || height <= 0) return undefined;

  return {
    x: Math.max(0, Math.floor(normalizeFiniteNumber(sourceRect.x, 0))),
    y: Math.max(0, Math.floor(normalizeFiniteNumber(sourceRect.y, 0))),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function normalizeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function normalizeFiniteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  const normalized = normalizeFiniteNumber(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function normalizeOptionalPositiveNumber(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return (value as number) > 0 ? value : undefined;
}
