import type { EditorTerrainMaterial, EditorTerrainRuleSet, EditorTerrainTilesetMaterial, EditorTerrainTileRule, EditorTilesetAsset } from '../types';

const STORAGE_PREFIX = 'dalworld:editor-terrain-rules:';

export class TerrainRuleStorage {
  constructor(private readonly mapName: string) {}

  load(): EditorTerrainRuleSet {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) return createEmptyRuleSet();

    try {
      const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
      if (!isValidRuleSet(parsed)) return createEmptyRuleSet();
      return {
        version: 1,
        rules: parsed.rules,
        tilesets: parsed.tilesets ?? [],
        updatedAt: parsed.updatedAt,
      };
    } catch (error) {
      console.warn('[TerrainRuleStorage] Failed to parse terrain rules.', error);
      return createEmptyRuleSet();
    }
  }

  save(ruleSet: EditorTerrainRuleSet): boolean {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(ruleSet));
      return true;
    } catch (error) {
      console.error('[TerrainRuleStorage] Failed to save terrain rules.', error);
      return false;
    }
  }

  upsert(rule: EditorTerrainTileRule): EditorTerrainRuleSet {
    const current = this.load();
    const material = this.getTilesetMaterialByKey(rule.tilesetId, rule.tilesetUrl, current);
    const ruleWithMaterial: EditorTerrainTileRule = {
      ...rule,
      material: rule.material ?? material.material,
      blocksMovement: rule.blocksMovement ?? material.blocksMovement,
    };
    const nextRules = current.rules.filter((item) => item.id !== rule.id);
    nextRules.push(ruleWithMaterial);
    const next: EditorTerrainRuleSet = {
      version: 1,
      rules: nextRules,
      tilesets: current.tilesets ?? [],
      updatedAt: Date.now(),
    };
    this.save(next);
    return next;
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
    return next;
  }

  upsertTilesetMaterial(asset: EditorTilesetAsset, material: EditorTerrainMaterial): EditorTerrainRuleSet {
    const current = this.load();
    const blocksMovement = material === 'water' || material === 'rock';
    const nextTileset: EditorTerrainTilesetMaterial = {
      tilesetId: asset.id,
      tilesetUrl: asset.url,
      material,
      blocksMovement,
    };
    const nextTilesets = (current.tilesets ?? []).filter((item) => !isSameTileset(item, nextTileset));
    nextTilesets.push(nextTileset);
    const nextRules = current.rules.map((rule) => (
      rule.tilesetId === asset.id && rule.tilesetUrl === asset.url
        ? { ...rule, material, blocksMovement }
        : rule
    ));
    const next: EditorTerrainRuleSet = {
      version: 1,
      rules: nextRules,
      tilesets: nextTilesets,
      updatedAt: Date.now(),
    };
    this.save(next);
    return next;
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
    if (saved) return saved;
    return { tilesetId, tilesetUrl, material: 'grass', blocksMovement: false };
  }

  private get key(): string {
    return `${STORAGE_PREFIX}${this.mapName}`;
  }
}

export function createEmptyRuleSet(): EditorTerrainRuleSet {
  return { version: 1, rules: [], tilesets: [], updatedAt: Date.now() };
}

function isSameTileset(a: EditorTerrainTilesetMaterial, b: EditorTerrainTilesetMaterial): boolean {
  return a.tilesetId === b.tilesetId && a.tilesetUrl === b.tilesetUrl;
}

function isValidRuleSet(value: EditorTerrainRuleSet): boolean {
  return Boolean(value && value.version === 1 && Array.isArray(value.rules) && typeof value.updatedAt === 'number');
}
