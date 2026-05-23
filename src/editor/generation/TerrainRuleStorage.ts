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
    const loaded = this.loadBestStoredRuleSet();
    if (!loaded) return createEmptyRuleSet();
    this.mirrorSave(loaded);
    return loaded;
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
    const normalizedRule = normalizeRule({
      ...rule,
      material,
      movementMode,
      blocksMovement: rule.blocksMovement ?? settings.blocksMovement ?? movementMode === 'blocked',
    });
    const nextRules = current.rules.filter((item) => item.id !== normalizedRule.id);
    nextRules.push(normalizedRule);
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
    const nextRules = current.rules.map((rule) => normalizeRule(
      rule.tilesetId === asset.id && rule.tilesetUrl === asset.url
        ? { ...rule, material, movementMode: normalizedMovement, blocksMovement }
        : rule,
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

  private loadBestStoredRuleSet(): EditorTerrainRuleSet | null {
    const candidates: EditorTerrainRuleSet[] = [];
    for (const key of this.getCandidateKeys()) {
      const ruleSet = readRuleSetFromKey(key);
      if (ruleSet) candidates.push(ruleSet);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const timeDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      if (timeDiff !== 0) return timeDiff;
      return (b.rules?.length ?? 0) - (a.rules?.length ?? 0);
    });
    return normalizeRuleSet(candidates[0]);
  }

  private getCandidateKeys(): string[] {
    const keys = new Set<string>([this.key, this.legacyKey]);
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) keys.add(key);
      }
    } catch (error) {
      console.warn('[TerrainRuleStorage] Failed to scan terrain rule keys.', error);
    }
    return [...keys];
  }

  private mirrorSave(ruleSet: EditorTerrainRuleSet): void {
    const normalized = normalizeRuleSet(ruleSet);
    const payload = JSON.stringify(normalized);
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

function readRuleSetFromKey(key: string): EditorTerrainRuleSet | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
    if (!isValidRuleSet(parsed)) return null;
    return normalizeRuleSet(parsed);
  } catch (error) {
    console.warn(`[TerrainRuleStorage] Failed to parse terrain rules from ${key}.`, error);
    return null;
  }
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

  const deduped = new Map<string, EditorTerrainTileRule>();
  for (const rule of ruleSet.rules ?? []) {
    const saved = lookup.get(`${rule.tilesetId}:${rule.tilesetUrl}`);
    const material = rule.material ?? saved?.material ?? 'grass';
    const movementMode = normalizeMovementMode(rule.movementMode ?? saved?.movementMode, material);
    const normalized = normalizeRule({
      ...rule,
      material,
      movementMode,
      blocksMovement: rule.blocksMovement ?? saved?.blocksMovement ?? movementMode === 'blocked',
    });
    deduped.set(createRuleIdentity(normalized), normalized);
  }

  return {
    version: 1,
    rules: [...deduped.values()],
    tilesets,
    updatedAt: ruleSet.updatedAt ?? Date.now(),
  };
}

function normalizeRule(rule: EditorTerrainTileRule): EditorTerrainTileRule {
  const scale = normalizeScale(rule.scale);
  return {
    ...rule,
    scale,
    id: createRuleId(rule, scale),
  };
}

function createRuleIdentity(rule: EditorTerrainTileRule): string {
  return createRuleId(rule, normalizeScale(rule.scale));
}

function createRuleId(rule: EditorTerrainTileRule, scale: number): string {
  const rect = rule.sourceRect;
  return `${rule.tilesetId}:${rule.tilesetUrl}:${rule.tileSize}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${rule.role}:scale-${normalizeScale(scale)}`;
}

function normalizeScale(value: number | undefined): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return 1;
  return Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10));
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
