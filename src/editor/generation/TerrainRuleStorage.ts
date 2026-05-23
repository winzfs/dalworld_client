import type { EditorTerrainRuleSet, EditorTerrainTileRule } from '../types';

const STORAGE_PREFIX = 'dalworld:editor-terrain-rules:';

export class TerrainRuleStorage {
  constructor(private readonly mapName: string) {}

  load(): EditorTerrainRuleSet {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) return createEmptyRuleSet();

    try {
      const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
      if (!isValidRuleSet(parsed)) return createEmptyRuleSet();
      return parsed;
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
    const nextRules = current.rules.filter((item) => item.id !== rule.id);
    nextRules.push(rule);
    const next: EditorTerrainRuleSet = { version: 1, rules: nextRules, updatedAt: Date.now() };
    this.save(next);
    return next;
  }

  remove(ruleId: string): EditorTerrainRuleSet {
    const current = this.load();
    const next: EditorTerrainRuleSet = {
      version: 1,
      rules: current.rules.filter((item) => item.id !== ruleId),
      updatedAt: Date.now(),
    };
    this.save(next);
    return next;
  }

  private get key(): string {
    return `${STORAGE_PREFIX}${this.mapName}`;
  }
}

export function createEmptyRuleSet(): EditorTerrainRuleSet {
  return { version: 1, rules: [], updatedAt: Date.now() };
}

function isValidRuleSet(value: EditorTerrainRuleSet): boolean {
  return Boolean(value && value.version === 1 && Array.isArray(value.rules) && typeof value.updatedAt === 'number');
}
