import type { EditorPlacementGameplay, EditorTilePlacement, EditorWorldSave } from '../editor/types';
import type { GameWorldMap, WorldMapPlacement, WorldMapPlacementGameplay, WorldMapSourceRect } from './types';

const DEFAULT_CELL_SIZE = 3000;
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const MAX_DISPLAY_SIZE = 4096;
const MAX_STRING_LENGTH = 512;
const EDITOR_ONLY_PLACEMENT_IDS = new Set(['editor-black-base']);
const VALID_LAYERS = new Set(['ground', 'object', 'collision']);
const VALID_RESOURCE_TYPES = new Set(['tree', 'stone']);

export function compileRuntimeWorldMap(world: EditorWorldSave): GameWorldMap {
  return {
    version: 1,
    name: sanitizeString(world.name, 'dalworld-map'),
    tileSize: normalizePositiveNumber(world.tileSize, 32),
    cellSize: normalizePositiveNumber(world.worldMap?.cellSize, DEFAULT_CELL_SIZE),
    cells: world.cells.map((cell) => ({
      gridX: normalizeInteger(cell.gridX, 0),
      gridY: normalizeInteger(cell.gridY, 0),
      placements: cell.draft.placements
        .filter(isRuntimePlacement)
        .map(compilePlacement)
        .filter((placement): placement is WorldMapPlacement => placement !== null),
    })),
  };
}

function isRuntimePlacement(placement: EditorTilePlacement): boolean {
  return !EDITOR_ONLY_PLACEMENT_IDS.has(placement.id);
}

function compilePlacement(placement: EditorTilePlacement): WorldMapPlacement | null {
  const layer = sanitizeLayer(placement.layer);
  const assetUrl = sanitizeAssetUrl(placement.assetUrl);

  if (!layer || !assetUrl) {
    console.warn('[WorldMap] Skipping invalid map placement before upload.', {
      id: placement.id,
      assetId: placement.assetId,
      assetUrl: placement.assetUrl,
      layer: placement.layer,
    });
    return null;
  }

  const compiled: WorldMapPlacement = {
    id: sanitizeString(placement.id, crypto.randomUUID()),
    assetId: sanitizeString(placement.assetId, 'unknown-asset'),
    assetUrl,
    categoryId: sanitizeString(placement.categoryId, 'unknown'),
    x: normalizeFiniteNumber(placement.x, 0),
    y: normalizeFiniteNumber(placement.y, 0),
    layer,
    scale: clamp(normalizePositiveNumber(placement.scale, 1), MIN_SCALE, MAX_SCALE),
  };

  const displayWidth = normalizeOptionalDisplayNumber(placement.displayWidth ?? placement.sourceRect?.width);
  const displayHeight = normalizeOptionalDisplayNumber(placement.displayHeight ?? placement.sourceRect?.height);
  if (displayWidth) compiled.displayWidth = displayWidth;
  if (displayHeight) compiled.displayHeight = displayHeight;

  const sourceRect = compileSourceRect(placement.sourceRect);
  if (sourceRect) compiled.sourceRect = sourceRect;

  const gameplay = placement.layer === 'collision'
    ? undefined
    : compileGameplay(placement.gameplay) ?? inferGameplayFromAssetUrl(assetUrl);
  if (gameplay) compiled.gameplay = gameplay;

  if (isValidColor(placement.solidColor)) {
    compiled.solidColor = Math.trunc(placement.solidColor as number);
  }

  if (placement.transparentBlack === true && placement.solidColor === undefined) {
    compiled.transparentBlack = true;
  }

  return compiled;
}

function compileGameplay(gameplay: EditorPlacementGameplay | undefined): WorldMapPlacementGameplay | undefined {
  if (!gameplay) return undefined;

  if (gameplay.kind === 'resource' && VALID_RESOURCE_TYPES.has(gameplay.resourceType)) {
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

  const width = normalizeOptionalDisplayNumber(sourceRect.width);
  const height = normalizeOptionalDisplayNumber(sourceRect.height);
  if (!width || !height) return undefined;

  return {
    x: Math.max(0, Math.floor(normalizeFiniteNumber(sourceRect.x, 0))),
    y: Math.max(0, Math.floor(normalizeFiniteNumber(sourceRect.y, 0))),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function sanitizeLayer(value: string | undefined): WorldMapPlacement['layer'] | null {
  return value && VALID_LAYERS.has(value) ? value as WorldMapPlacement['layer'] : null;
}

function sanitizeAssetUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_STRING_LENGTH) return null;
  if (trimmed.startsWith('data:')) return null;
  return trimmed;
}

function sanitizeString(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_STRING_LENGTH);
}

function isValidColor(value: number | undefined): boolean {
  return Number.isFinite(value) && (value as number) >= 0 && (value as number) <= 0xffffff;
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

function normalizeOptionalDisplayNumber(value: number | undefined): number | undefined {
  const normalized = normalizeOptionalPositiveNumber(value);
  if (!normalized) return undefined;
  return Math.min(Math.floor(normalized), MAX_DISPLAY_SIZE);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
