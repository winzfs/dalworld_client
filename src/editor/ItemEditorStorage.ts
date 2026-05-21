import type { EditorItemOverride } from './types';

const ITEM_EDITOR_STORAGE_KEY = 'dalworld:editor:item-overrides:v1';

export function loadEditorItemOverrides(): EditorItemOverride[] {
  try {
    const raw = window.localStorage.getItem(ITEM_EDITOR_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEditorItemOverride).map((override) => ({
      ...override,
      fields: override.fields ? { ...override.fields } : undefined,
    }));
  } catch {
    return [];
  }
}

export function saveEditorItemOverrides(overrides: EditorItemOverride[]): void {
  window.localStorage.setItem(ITEM_EDITOR_STORAGE_KEY, JSON.stringify(overrides.map((override) => ({
    ...override,
    fields: override.fields ? { ...override.fields } : undefined,
  }))));
}

function isEditorItemOverride(value: unknown): value is EditorItemOverride {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EditorItemOverride>;
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0;
}
