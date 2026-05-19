import type { EditorMapDraft, EditorWorldSave } from './types';
import { uploadWorldMap, type UploadedWorldMapReport } from '../worldMap/uploadWorldMap';

const STORAGE_PREFIX = 'dalworld:editor-map:';
const WORLD_STORAGE_PREFIX = 'dalworld:editor-world:';

export class MapStorage {
  constructor(private readonly mapName: string) {}

  save(draft: EditorMapDraft): boolean {
    return this.writeJson(this.key, draft);
  }

  load(): EditorMapDraft | null {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as EditorMapDraft;
      if (!isValidDraft(parsed)) return null;
      return parsed;
    } catch (error) {
      console.warn('[MapStorage] Failed to parse map draft.', error);
      return null;
    }
  }

  async saveWorld(world: EditorWorldSave): Promise<UploadedWorldMapReport | null> {
    const saved = this.writeJson(this.worldKey, world);
    if (!saved) return null;

    const report = await uploadWorldMap(world);
    console.info('[MapStorage] Uploaded editor world map to server.', report);
    return report;
  }

  loadWorld(): EditorWorldSave | null {
    const raw = window.localStorage.getItem(this.worldKey);
    if (!raw) return this.migrateSingleDraftToWorld();

    try {
      const parsed = JSON.parse(raw) as EditorWorldSave;
      if (!isValidWorldSave(parsed)) return this.migrateSingleDraftToWorld();
      return parsed;
    } catch (error) {
      console.warn('[MapStorage] Failed to parse world save.', error);
      return this.migrateSingleDraftToWorld();
    }
  }

  clear(): void {
    window.localStorage.removeItem(this.key);
    window.localStorage.removeItem(this.worldKey);
  }

  downloadJson(draft: EditorMapDraft): void {
    this.download(`${draft.name || this.mapName}.json`, draft);
  }

  downloadWorldJson(world: EditorWorldSave): void {
    this.download(`${world.name || this.mapName}-world.json`, world);
  }

  private migrateSingleDraftToWorld(): EditorWorldSave | null {
    const draft = this.load();
    if (!draft) return null;

    return {
      version: 1,
      name: this.mapName,
      tileSize: draft.tileSize,
      worldMap: draft.worldMap ?? {
        version: 1,
        cellSize: 3000,
        current: { gridX: 0, gridY: 0 },
        cells: [{ id: '0:0', name: 'Map 0,0', gridX: 0, gridY: 0 }],
      },
      cells: [{ gridX: 0, gridY: 0, draft }],
    };
  }

  private writeJson(key: string, value: unknown): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[MapStorage] Failed to save editor map data.', error);
      return false;
    }
  }

  private download(filename: string, value: unknown): void {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private get key(): string {
    return `${STORAGE_PREFIX}${this.mapName}`;
  }

  private get worldKey(): string {
    return `${WORLD_STORAGE_PREFIX}${this.mapName}`;
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

function isValidWorldSave(value: EditorWorldSave): boolean {
  return (
    value &&
    value.version === 1 &&
    typeof value.name === 'string' &&
    typeof value.tileSize === 'number' &&
    value.worldMap?.version === 1 &&
    Array.isArray(value.worldMap.cells) &&
    Array.isArray(value.cells) &&
    value.cells.every((cell) => (
      typeof cell.gridX === 'number' &&
      typeof cell.gridY === 'number' &&
      isValidDraft(cell.draft)
    ))
  );
}
