import type {
  EditorTerrainMaterial,
  EditorTerrainMovementMode,
  EditorTerrainRuleSet,
  EditorTerrainTilesetMaterial,
  EditorTerrainTileRule,
  EditorTilesetAsset,
} from '../types';

const STORAGE_PREFIX = 'dalworld:editor-terrain-rules:';
const LEGACY_MAP_NAME = 'dalworld-map';

export class TerrainRuleStorage {
  constructor(private readonly mapName: string) {}

  load(): EditorTerrainRuleSet {
    const raw = window.localStorage.getItem(this.key) ?? window.localStorage.getItem(this.legacyKey);
    if (!raw) return createEmptyRuleSet();

    try {
      const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
      if (!isValidRuleSet(parsed)) return createEmptyRuleSet();
      const normalized = normalizeRuleSet(parsed);
      this.mirrorSave(normalized);
      return normalized;
    } catch (error) {
      console.warn('[TerrainRuleStorage] Failed to parse terrain rules.', error);
      return createEmptyRuleSet();
    }
  }

  save(ruleSet: EditorTerrainRuleSet): boolean {
    try {
      this.mirrorSave(normalizeRuleSet(ruleSet));
      return true;
    } catch (error) {
      console.error('[TerrainRuleStorage] Failed to save terrain rules.', error);
      return false;
    }
  }

  upsert(rule: EditorTerrainTileRule): EditorTerrainRuleSet {
    const current = this.load();
    const settings = this.getTilesetMaterialByKey(rule.tilesetId, rule.tilesetUrl, current);
    const material = rule.material ?? settings.material;
    const movementMode = rule.movementMode ?? settings.movementMode ?? getDefaultMovementMode(material);
    const ruleWithSettings: EditorTerrainTileRule = {
      ...rule,
      material,
      movementMode,
      blocksMovement: rule.blocksMovement ?? settings.blocksMovement ?? movementMode === 'blocked',
    };
    const nextRules = current.rules.filter((item) => item.id !== rule.id);
    nextRules.push(ruleWithSettings);
    const next: EditorTerrainRuleSet = {
      version: 1,
      rules: nextRules,
      tilesets: current.tilesets ?? [],
      updatedAt: Date.now(),
    };
    this.save(next);
    return normalizeRuleSet(next);
  }

  remove(ruleId: string): EditorTerrainRuleSet {
    const current = this.load();
    const next: EditorTerrainRuleSet = {
      version: 1,
      rules: current.rules.filter((item) => item.id !== ruleId),
      tilesets: current.tilesets ?? [],
      updatedAt: Date.now(),
    };
    this.save(next);
    return normalizeRuleSet(next);
  }

  upsertTilesetMaterial(
    asset: EditorTilesetAsset,
    material: EditorTerrainMaterial,
    movementMode: EditorTerrainMovementMode = getDefaultMovementMode(material),
  ): EditorTerrainRuleSet {
    const current = this.load();
    const normalizedMovement = normalizeMovementMode(movementMode, material);
    const blocksMovement = normalizedMovement === 'blocked';
    const nextTileset: EditorTerrainTilesetMaterial = {
      tilesetId: asset.id,
      tilesetUrl: asset.url,
      material,
      movementMode: normalizedMovement,
      blocksMovement,
    };
    const nextTilesets = (current.tilesets ?? []).filter((item) => !isSameTileset(item, nextTileset));
    nextTilesets.push(nextTileset);
    const nextRules = current.rules.map((rule) => (
      rule.tilesetId === asset.id && rule.tilesetUrl === asset.url
        ? { ...rule, material, movementMode: normalizedMovement, blocksMovement }
        : rule
    ));
    const next: EditorTerrainRuleSet = {
      version: 1,
      rules: nextRules,
      tilesets: nextTilesets,
      updatedAt: Date.now(),
    };
    this.save(next);
    return normalizeRuleSet(next);
  }

  getTilesetMaterial(asset: EditorTilesetAsset, ruleSet: EditorTerrainRuleSet = this.load()): EditorTerrainTilesetMaterial {
    return this.getTilesetMaterialByKey(asset.id, asset.url, ruleSet);
  }

  private getTilesetMaterialByKey(
    tilesetId: string,
    tilesetUrl: string,
    ruleSet: EditorTerrainRuleSet,
  ): EditorTerrainTilesetMaterial {
    const saved = (ruleSet.tilesets ?? []).find((item) => item.tilesetId === tilesetId && item.tilesetUrl === tilesetUrl);
    if (saved) {
      const material = saved.material ?? 'grass';
      const movementMode = normalizeMovementMode(saved.movementMode, material);
      return {
        tilesetId,
        tilesetUrl,
        material,
        movementMode,
        blocksMovement: saved.blocksMovement ?? movementMode === 'blocked',
      };
    }
    return { tilesetId, tilesetUrl, material: 'grass', movementMode: 'passable', blocksMovement: false };
  }

  private mirrorSave(ruleSet: EditorTerrainRuleSet): void {
    const payload = JSON.stringify(ruleSet);
    window.localStorage.setItem(this.key, payload);
    window.localStorage.setItem(this.legacyKey, payload);
  }

  private get key(): string {
    return `${STORAGE_PREFIX}${this.mapName}`;
  }

  private get legacyKey(): string {
    return `${STORAGE_PREFIX}${LEGACY_MAP_NAME}`;
  }
}

export function createEmptyRuleSet(): EditorTerrainRuleSet {
  return { version: 1, rules: [], tilesets: [], updatedAt: Date.now() };
}

function normalizeRuleSet(ruleSet: EditorTerrainRuleSet): EditorTerrainRuleSet {
  const tilesets = (ruleSet.tilesets ?? []).map((item) => {
    const material = item.material ?? 'grass';
    const movementMode = normalizeMovementMode(item.movementMode, material);
    return {
      ...item,
      material,
      movementMode,
      blocksMovement: item.blocksMovement ?? movementMode === 'blocked',
    };
  });

  const lookup = new Map<string, EditorTerrainTilesetMaterial>();
  for (const item of tilesets) lookup.set(`${item.tilesetId}:${item.tilesetUrl}`, item);

  return {
    version: 1,
    rules: (ruleSet.rules ?? []).map((rule) => {
      const saved = lookup.get(`${rule.tilesetId}:${rule.tilesetUrl}`);
      const material = rule.material ?? saved?.material ?? 'grass';
      const movementMode = normalizeMovementMode(rule.movementMode ?? saved?.movementMode, material);
      return {
        ...rule,
        material,
        movementMode,
        blocksMovement: rule.blocksMovement ?? saved?.blocksMovement ?? movementMode === 'blocked',
      };
    }),
    tilesets,
    updatedAt: ruleSet.updatedAt ?? Date.now(),
  };
}

function getDefaultMovementMode(material: EditorTerrainMaterial): EditorTerrainMovementMode {
  if (material === 'water') return 'boatOnly';
  if (material === 'rock') return 'blocked';
  return 'passable';
}

function normalizeMovementMode(value: EditorTerrainMovementMode | undefined, material: EditorTerrainMaterial): EditorTerrainMovementMode {
  if (value === 'passable' || value === 'blocked' || value === 'shallow' || value === 'swim' || value === 'boatOnly') return value;
  return getDefaultMovementMode(material);
}

function isSameTileset(a: EditorTerrainTilesetMaterial, b: EditorTerrainTilesetMaterial): boolean {
  return a.tilesetId === b.tilesetId && a.tilesetUrl === b.tilesetUrl;
}

function isValidRuleSet(value: EditorTerrainRuleSet): boolean {
  return Boolean(value && value.version === 1 && Array.isArray(value.rules) && typeof value.updatedAt === 'number');
}
