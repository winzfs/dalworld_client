import { loadEditorItemOverrides } from '../editor/ItemEditorStorage';
import type {
  EditorItemOverride,
  EditorMonsterSpecOverrides,
  EditorMonsterSpawnRule,
  EditorPlacementGameplay,
  EditorTilePlacement,
  EditorWorldSave,
} from '../editor/types';
import type {
  GameWorldMap,
  WorldMapItemOverride,
  WorldMapMonsterSpawnRule,
  WorldMapPlacement,
  WorldMapPlacementGameplay,
  WorldMapSourceRect,
} from './types';

const DEFAULT_CELL_SIZE = 3000;
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const MAX_DISPLAY_SIZE = 4096;
const MAX_STRING_LENGTH = 512;
const MAX_ITEM_FIELD_LENGTH = 128;
const MAX_ITEM_OVERRIDES = 500;
const MAX_ITEM_FIELDS = 32;
const EDITOR_ONLY_PLACEMENT_IDS = new Set(['editor-black-base']);
const VALID_LAYERS = new Set(['ground', 'object', 'collision']);
const VALID_RESOURCE_TYPES = new Set(['tree', 'stone']);
const VALID_MONSTER_TYPES = new Set(['wild_slime', 'sheep']);
const VALID_ITEM_CATEGORIES = new Set([
  'resource',
  'consumable',
  'equipment',
  'weapon',
  'tool',
  'crafting_material',
  'crafting_station',
  'building_part',
  'capture',
  'pet',
]);

export function compileRuntimeWorldMap(world: EditorWorldSave): GameWorldMap {
  const editorItemOverrides = world.worldMap?.itemOverrides ?? loadEditorItemOverrides();

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
    monsterSpawnRules: compileMonsterSpawnRules(world.worldMap?.monsterSpawnRules),
    itemOverrides: compileItemOverrides(editorItemOverrides),
  };
}

function isRuntimePlacement(placement: EditorTilePlacement): boolean {
  return !EDITOR_ONLY_PLACEMENT_IDS.has(placement.id);
}

function compilePlacement(placement: EditorTilePlacement): WorldMapPlacement | null {
  const layer = sanitizeLayer(placement.layer);
  const assetUrl = sanitizeAssetUrl(placement.assetUrl)
    ?? createSolidEditorAssetUrl(placement);

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

function createSolidEditorAssetUrl(placement: EditorTilePlacement): string | null {
  if (!isValidColor(placement.solidColor)) return null;
  const assetId = sanitizeString(placement.assetId, 'solid-editor-tile')
    .replace(/[^a-zA-Z0-9_.:-]/g, '-')
    .slice(0, 96);
  return `solid://${assetId || 'solid-editor-tile'}`;
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

  if (gameplay.kind === 'monsterSpawn' && VALID_MONSTER_TYPES.has(gameplay.monsterType)) {
    const spec = compileMonsterSpec(gameplay.spec);
    const compiled: WorldMapPlacementGameplay = {
      kind: 'monsterSpawn',
      monsterType: gameplay.monsterType,
      spawnRadius: clamp(normalizePositiveNumber(gameplay.spawnRadius, 160), 16, 2000),
      maxAlive: clamp(normalizeInteger(gameplay.maxAlive, 1), 1, 50),
      respawnMs: clamp(normalizePositiveNumber(gameplay.respawnMs, 30_000), 1_000, 3_600_000),
      spawnsPerMinute: clamp(resolveSpawnsPerMinute(gameplay.spawnsPerMinute, gameplay.spawnsPerHour, 2), 1, 600),
    };
    if (gameplay.spawnsPerHour !== undefined) compiled.spawnsPerHour = clamp(normalizePositiveNumber(gameplay.spawnsPerHour, 120), 1, 36000);
    if (spec && Object.keys(spec).length > 0) compiled.spec = spec;
    return compiled;
  }

  return undefined;
}

function compileMonsterSpawnRules(rules: EditorMonsterSpawnRule[] | undefined): WorldMapMonsterSpawnRule[] | undefined {
  if (!rules || rules.length === 0) return undefined;

  const compiled: WorldMapMonsterSpawnRule[] = [];

  for (const rule of rules) {
    if (!VALID_MONSTER_TYPES.has(rule.monsterType)) continue;
    const spec = compileMonsterSpec(rule.spec);
    const compiledRule: WorldMapMonsterSpawnRule = {
      id: sanitizeString(rule.id, crypto.randomUUID()),
      enabled: rule.enabled !== false,
      monsterType: rule.monsterType,
      scope: rule.scope === 'region' ? 'region' : 'world',
      maxAlive: clamp(normalizeInteger(rule.maxAlive, 10), 0, 500),
      spawnsPerMinute: clamp(resolveSpawnsPerMinute(rule.spawnsPerMinute, rule.spawnsPerHour, 1), 1, 600),
    };
    if (rule.spawnsPerHour !== undefined) compiledRule.spawnsPerHour = clamp(normalizePositiveNumber(rule.spawnsPerHour, 60), 1, 36000);
    if (spec && Object.keys(spec).length > 0) compiledRule.spec = spec;
    compiled.push(compiledRule);
  }

  return compiled.length > 0 ? compiled : undefined;
}

function compileItemOverrides(overrides: EditorItemOverride[] | undefined): WorldMapItemOverride[] | undefined {
  if (!overrides || overrides.length === 0) return undefined;

  const compiled: WorldMapItemOverride[] = [];
  const seen = new Set<string>();

  for (const override of overrides.slice(0, MAX_ITEM_OVERRIDES)) {
    const id = sanitizeString(override.id, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const next: WorldMapItemOverride = { id };
    const label = sanitizeOptionalString(override.label, 96);
    const description = sanitizeOptionalString(override.description, MAX_STRING_LENGTH);
    const icon = sanitizeOptionalString(override.icon, 16);
    if (label) next.label = label;
    if (description) next.description = description;
    if (icon) next.icon = icon;
    if (override.category && VALID_ITEM_CATEGORIES.has(override.category)) next.category = override.category;
    if (typeof override.stackable === 'boolean') next.stackable = override.stackable;
    if (Number.isFinite(override.maxStack)) next.maxStack = clamp(normalizeInteger(override.maxStack as number, 1), 1, 9999);

    const fields = compileItemFields(override.fields);
    if (fields) next.fields = fields;

    if (Object.keys(next).length > 1) compiled.push(next);
  }

  return compiled.length > 0 ? compiled : undefined;
}

function compileItemFields(fields: EditorItemOverride['fields']): WorldMapItemOverride['fields'] | undefined {
  if (!fields) return undefined;

  const entries = Object.entries(fields).slice(0, MAX_ITEM_FIELDS);
  const compiled: NonNullable<WorldMapItemOverride['fields']> = {};

  for (const [rawKey, value] of entries) {
    const key = sanitizeString(rawKey, '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 64);
    if (!key) continue;

    if (typeof value === 'boolean') {
      compiled[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      compiled[key] = Math.round(value * 1000) / 1000;
    } else if (typeof value === 'string') {
      const text = sanitizeOptionalString(value, MAX_ITEM_FIELD_LENGTH);
      if (text) compiled[key] = text;
    }
  }

  return Object.keys(compiled).length > 0 ? compiled : undefined;
}

function compileMonsterSpec(spec: EditorMonsterSpecOverrides | undefined): NonNullable<Extract<WorldMapPlacementGameplay, { kind: 'monsterSpawn' }>['spec']> | undefined {
  if (!spec) return undefined;

  return removeUndefinedFields({
    maxHp: normalizeOptionalPositiveNumber(spec.maxHp),
    moveSpeed: normalizeOptionalPositiveNumber(spec.moveSpeed),
    detectRange: normalizeOptionalPositiveNumber(spec.detectRange),
    loseRange: normalizeOptionalPositiveNumber(spec.loseRange),
    attackRange: normalizeOptionalPositiveNumber(spec.attackRange),
    attackDamage: normalizeOptionalPositiveNumber(spec.attackDamage),
    attackCooldownMs: normalizeOptionalPositiveNumber(spec.attackCooldownMs),
  });
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

function sanitizeOptionalString(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
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

function resolveSpawnsPerMinute(
  spawnsPerMinute: number | undefined,
  legacySpawnsPerHour: number | undefined,
  fallback: number,
): number {
  if (Number.isFinite(spawnsPerMinute) && (spawnsPerMinute as number) > 0) return spawnsPerMinute as number;
  if (Number.isFinite(legacySpawnsPerHour) && (legacySpawnsPerHour as number) > 0) {
    return Math.max(1, Math.round((legacySpawnsPerHour as number) / 60));
  }
  return fallback;
}

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
