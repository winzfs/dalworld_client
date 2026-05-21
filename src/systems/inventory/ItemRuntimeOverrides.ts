import { BASE_ITEM_DEFINITIONS, type InventoryItemId, type ItemDefinition } from './ItemDefinitions';
import type { WorldMapItemOverride } from '../../worldMap/types';

let runtimeOverrides: WorldMapItemOverride[] = [];

export function setRuntimeItemOverrides(overrides: WorldMapItemOverride[] | null | undefined): void {
  runtimeOverrides = Array.isArray(overrides) ? overrides.map((override) => ({ ...override, fields: override.fields ? { ...override.fields } : undefined })) : [];
}

export function getRuntimeItemOverrides(): WorldMapItemOverride[] {
  return runtimeOverrides.map((override) => ({ ...override, fields: override.fields ? { ...override.fields } : undefined }));
}

export function getRuntimeItemDefinition(itemId: string): ItemDefinition | null {
  const base = BASE_ITEM_DEFINITIONS[itemId];
  if (!base) return null;
  return applyOverride(base, runtimeOverrides.find((override) => override.id === itemId));
}

export function getRuntimeItemDefinitions(): Record<string, ItemDefinition> {
  return Object.fromEntries(
    Object.values(BASE_ITEM_DEFINITIONS).map((definition) => [definition.id, getRuntimeItemDefinition(definition.id) ?? definition]),
  );
}

export function getRuntimeItemField(itemId: string, fieldKey: string): string | number | boolean | undefined {
  return runtimeOverrides.find((override) => override.id === itemId)?.fields?.[fieldKey];
}

function applyOverride(base: ItemDefinition, override: WorldMapItemOverride | undefined): ItemDefinition {
  if (!override) return base;

  return {
    ...base,
    id: base.id as InventoryItemId,
    label: override.label ?? base.label,
    description: override.description ?? base.description,
    icon: override.icon ?? base.icon,
    category: override.category ?? base.category,
    stackable: override.stackable ?? base.stackable,
    maxStack: override.maxStack ?? base.maxStack,
  };
}
