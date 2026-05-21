import { loadEditorItemOverrides } from './ItemEditorStorage';
import type { EditorItemOverride, EditorMonsterSpawnRule } from './types';
import { uploadItemOverrides, uploadMonsterSpawnRules } from '../worldMap/uploadWorldMap';
import type { WorldMapItemOverride, WorldMapMonsterSpawnRule } from '../worldMap/types';

export async function saveMonsterTabToServer(rules: EditorMonsterSpawnRule[]): Promise<number> {
  const payload: WorldMapMonsterSpawnRule[] = rules.map((rule) => ({
    id: rule.id,
    enabled: rule.enabled,
    monsterType: rule.monsterType,
    scope: rule.scope,
    maxAlive: rule.maxAlive,
    spawnsPerMinute: rule.spawnsPerMinute,
    spawnsPerHour: rule.spawnsPerHour,
    spec: rule.spec ? { ...rule.spec } : undefined,
  }));
  await uploadMonsterSpawnRules(payload);
  return payload.length;
}

export async function saveItemTabToServer(): Promise<number> {
  const payload: WorldMapItemOverride[] = loadEditorItemOverrides().map((override: EditorItemOverride) => ({
    id: override.id,
    label: override.label,
    description: override.description,
    icon: override.icon,
    category: override.category,
    stackable: override.stackable,
    maxStack: override.maxStack,
    fields: override.fields ? { ...override.fields } : undefined,
  }));
  await uploadItemOverrides(payload);
  return payload.length;
}
