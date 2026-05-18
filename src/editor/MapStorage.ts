import type { EditorMapDraft } from './types';

const STORAGE_PREFIX = 'dalworld:editor-map:';

export class MapStorage {
  constructor(private readonly mapName: string) {}

  save(draft: EditorMapDraft): void {
    window.localStorage.setItem(this.key, JSON.stringify(draft));
  }

  load(): EditorMapDraft | null {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as EditorMapDraft;
      if (!isValidDraft(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    window.localStorage.removeItem(this.key);
  }

  downloadJson(draft: EditorMapDraft): void {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${draft.name || this.mapName}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private get key(): string {
    return `${STORAGE_PREFIX}${this.mapName}`;
  }
}

function isValidDraft(value: EditorMapDraft): boolean {
  return (
    value &&
    value.version === 1 &&
    typeof value.name === 'string' &&
    typeof value.tileSize === 'number' &&
    Array.isArray(value.placements)
  );
}
