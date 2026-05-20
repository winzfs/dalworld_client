import type { EditorMapDraft, EditorTilePlacement, EditorWorldMapDraft, EditorWorldSave } from './types';
import { uploadWorldMap, type UploadedWorldMapReport } from '../worldMap/uploadWorldMap';
import { fetchRuntimeWorldMap } from '../worldMap/fetchRuntimeWorldMap';
import type { GameWorldMap, WorldMapPlacement } from '../worldMap/types';

const STORAGE_PREFIX = 'dalworld:editor-map:';
const WORLD_STORAGE_PREFIX = 'dalworld:editor-world:';
const DEFAULT_CELL_SIZE = 3000;

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

  async saveWorld(world: EditorWorldSave): Promise<UploadedWorldMapReport> {
    const localSaved = this.writeJson(this.worldKey, world);

    if (!localSaved) {
      console.warn('[MapStorage] Local editor world backup failed. Continuing with server upload.');
    }

    const report = await uploadWorldMap(world);
    console.info('[MapStorage] Uploaded editor world map to server.', {
      ...report,
      localBackupSaved: localSaved,
    });
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

  async loadWorldFromServerBackup(): Promise<EditorWorldSave | null> {
    try {
      const runtimeMap = await fetchRuntimeWorldMap();
      if (!runtimeMap || runtimeMap.cells.length === 0) return null;

      const world = convertRuntimeMapToEditorWorldSave(runtimeMap, this.mapName);
      this.writeJson(this.worldKey, world);
      console.info('[MapStorage] Restored editor world from server map backup.', {
        cells: world.cells.length,
        placements: world.cells.reduce((sum, cell) => sum + cell.draft.placements.length, 0),
      });
      return world;
    } catch (error) {
      console.warn('[MapStorage] Failed to restore editor world from server map backup.', error);
      return null;
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
        cellSize: DEFAULT_CELL_SIZE,
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
      console.error('[MapStorage] Failed to save editor map data.', {
        key,
        approxBytes: estimateJsonBytes(value),
        error,
      });
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

function convertRuntimeMapToEditorWorldSave(map: GameWorldMap, mapName: string): EditorWorldSave {
  const cells = map.cells.map((cell) => ({
    gridX: cell.gridX,
    gridY: cell.gridY,
    draft: {
      version: 1,
      name: `${mapName}-${cell.gridX}-${cell.gridY}`,
      tileSize: map.tileSize,
      worldMap: createEditorWorldMapDraft(map),
      placements: cell.placements.map(convertRuntimePlacementToEditorPlacement),
    } satisfies EditorMapDraft,
  }));

  return {
    version: 1,
    name: mapName,
    tileSize: map.tileSize,
    worldMap: createEditorWorldMapDraft(map),
    cells,
  };
}

function createEditorWorldMapDraft(map: GameWorldMap): EditorWorldMapDraft {
  const sortedCells = [...map.cells].sort((a, b) => (a.gridY - b.gridY) || (a.gridX - b.gridX));
  const firstCell = sortedCells[0] ?? { gridX: 0, gridY: 0 };

  return {
    version: 1,
    cellSize: map.cellSize || DEFAULT_CELL_SIZE,
    current: { gridX: firstCell.gridX, gridY: firstCell.gridY },
    cells: sortedCells.map((cell) => ({
      id: `${cell.gridX}:${cell.gridY}`,
      name: `Map ${cell.gridX},${cell.gridY}`,
      gridX: cell.gridX,
      gridY: cell.gridY,
    })),
    monsterSpawnRules: map.monsterSpawnRules?.map((rule) => ({ ...rule, spec: rule.spec ? { ...rule.spec } : undefined })),
  };
}

function convertRuntimePlacementToEditorPlacement(placement: WorldMapPlacement): EditorTilePlacement {
  return {
    id: placement.id,
    assetId: placement.assetId,
    assetUrl: placement.assetUrl,
    categoryId: placement.categoryId,
    x: placement.x,
    y: placement.y,
    layer: placement.layer,
    scale: placement.scale,
    displayWidth: placement.displayWidth,
    displayHeight: placement.displayHeight,
    sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
    solidColor: placement.solidColor,
    transparentBlack: placement.transparentBlack,
    gameplay: placement.gameplay ? { ...placement.gameplay, spec: 'spec' in placement.gameplay && placement.gameplay.spec ? { ...placement.gameplay.spec } : undefined } : undefined,
  };
}

function estimateJsonBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return -1;
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
