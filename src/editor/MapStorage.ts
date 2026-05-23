import { saveEditorItemOverrides } from './ItemEditorStorage';
import type { EditorItemOverride, EditorMapDraft, EditorPlacementGameplay, EditorTerrainRuleSet, EditorTilePlacement, EditorWorldMapDraft, EditorWorldSave } from './types';
import { uploadWorldMap, type UploadedWorldMapReport } from '../worldMap/uploadWorldMap';
import { fetchRuntimeWorldMap } from '../worldMap/fetchRuntimeWorldMap';
import type { GameWorldMap, WorldMapItemOverride, WorldMapPlacement, WorldMapPlacementGameplay } from '../worldMap/types';

const STORAGE_PREFIX = 'dalworld:editor-map:';
const WORLD_STORAGE_PREFIX = 'dalworld:editor-world:';
const TERRAIN_RULE_STORAGE_PREFIX = 'dalworld:editor-terrain-rules:';
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
    const worldWithTerrainRules = this.attachLocalTerrainRules(world);
    const localSaved = this.writeJson(this.worldKey, worldWithTerrainRules);

    if (!localSaved) {
      console.warn('[MapStorage] Local editor world backup failed. Continuing with server upload.');
    }

    const report = await uploadWorldMap(worldWithTerrainRules);
    console.info('[MapStorage] Uploaded editor world map to server.', {
      ...report,
      terrainRules: worldWithTerrainRules.worldMap.terrainRuleSet?.rules.length ?? 0,
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
      this.restoreLocalTerrainRules(parsed.worldMap.terrainRuleSet);
      return parsed;
    } catch (error) {
      console.warn('[MapStorage] Failed to parse world save.', error);
      return this.migrateSingleDraftToWorld();
    }
  }

  async loadBestWorld(): Promise<EditorWorldSave | null> {
    const localWorld = this.loadWorld();
    const serverWorld = await this.loadWorldFromServerBackup({ writeLocalBackup: false });
    const localScore = getWorldSaveContentScore(localWorld);
    const serverScore = getWorldSaveContentScore(serverWorld);

    if (serverWorld && serverScore > localScore) {
      this.writeJson(this.worldKey, serverWorld);
      this.restoreLocalTerrainRules(serverWorld.worldMap.terrainRuleSet);
      console.info('[MapStorage] Using server editor world because it has more content.', {
        localScore,
        serverScore,
        cells: serverWorld.cells.length,
        terrainRules: serverWorld.worldMap.terrainRuleSet?.rules.length ?? 0,
      });
      return serverWorld;
    }

    if (localWorld) {
      console.info('[MapStorage] Using local editor world backup.', {
        localScore,
        serverScore,
        cells: localWorld.cells.length,
        terrainRules: localWorld.worldMap.terrainRuleSet?.rules.length ?? 0,
      });
      return localWorld;
    }

    return serverWorld;
  }

  async loadWorldFromServerBackup(options: { writeLocalBackup?: boolean } = {}): Promise<EditorWorldSave | null> {
    try {
      const runtimeMap = await fetchRuntimeWorldMap();
      if (!runtimeMap || runtimeMap.cells.length === 0) return null;

      const world = convertRuntimeMapToEditorWorldSave(runtimeMap, this.mapName);
      if (world.worldMap.itemOverrides) saveEditorItemOverrides(world.worldMap.itemOverrides);
      this.restoreLocalTerrainRules(world.worldMap.terrainRuleSet);
      if (options.writeLocalBackup !== false) this.writeJson(this.worldKey, world);
      console.info('[MapStorage] Restored editor world from server map backup.', {
        cells: world.cells.length,
        placements: world.cells.reduce((sum, cell) => sum + cell.draft.placements.length, 0),
        itemOverrides: world.worldMap.itemOverrides?.length ?? 0,
        terrainRules: world.worldMap.terrainRuleSet?.rules.length ?? 0,
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
    window.localStorage.removeItem(this.terrainRuleKey);
  }

  downloadJson(draft: EditorMapDraft): void {
    this.download(`${draft.name || this.mapName}.json`, draft);
  }

  downloadWorldJson(world: EditorWorldSave): void {
    this.download(`${world.name || this.mapName}-world.json`, this.attachLocalTerrainRules(world));
  }

  private migrateSingleDraftToWorld(): EditorWorldSave | null {
    const draft = this.load();
    if (!draft) return null;

    return this.attachLocalTerrainRules({
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
    });
  }

  private attachLocalTerrainRules(world: EditorWorldSave): EditorWorldSave {
    const ruleSet = this.loadLocalTerrainRules() ?? world.worldMap.terrainRuleSet;
    if (!ruleSet) return world;
    const worldMap = { ...world.worldMap, terrainRuleSet: ruleSet };
    return {
      ...world,
      worldMap,
      cells: world.cells.map((cell) => ({
        ...cell,
        draft: { ...cell.draft, worldMap },
      })),
    };
  }

  private loadLocalTerrainRules(): EditorTerrainRuleSet | undefined {
    const raw = window.localStorage.getItem(this.terrainRuleKey);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as EditorTerrainRuleSet;
      if (!isValidTerrainRuleSet(parsed)) return undefined;
      return parsed;
    } catch (error) {
      console.warn('[MapStorage] Failed to parse terrain rules.', error);
      return undefined;
    }
  }

  private restoreLocalTerrainRules(ruleSet: EditorTerrainRuleSet | undefined): void {
    if (!ruleSet || !isValidTerrainRuleSet(ruleSet)) return;
    this.writeJson(this.terrainRuleKey, ruleSet);
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

  private get terrainRuleKey(): string {
    return `${TERRAIN_RULE_STORAGE_PREFIX}${this.mapName}`;
  }
}

function convertRuntimeMapToEditorWorldSave(map: GameWorldMap, mapName: string): EditorWorldSave {
  const worldMap = createEditorWorldMapDraft(map);
  const cells = map.cells.map((cell) => ({
    gridX: cell.gridX,
    gridY: cell.gridY,
    draft: {
      version: 1,
      name: `${mapName}-${cell.gridX}-${cell.gridY}`,
      tileSize: map.tileSize,
      worldMap,
      placements: cell.placements.map(convertRuntimePlacementToEditorPlacement),
    } satisfies EditorMapDraft,
  }));

  return {
    version: 1,
    name: mapName,
    tileSize: map.tileSize,
    worldMap,
    cells,
  };
}

function createEditorWorldMapDraft(map: GameWorldMap): EditorWorldMapDraft {
  const sortedCells = [...map.cells].sort((a, b) => (a.gridY - b.gridY) || (a.gridX - b.gridX));
  const firstCell = sortedCells[0] ?? { gridX: 0, gridY: 0 };
  const monsterSpawnRules = map.monsterSpawnRules?.map((rule) => ({
    ...rule,
    ...(rule.spec ? { spec: { ...rule.spec } } : {}),
  }));
  const itemOverrides = convertRuntimeItemOverrides(map.itemOverrides);

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
    ...(monsterSpawnRules ? { monsterSpawnRules } : {}),
    ...(itemOverrides ? { itemOverrides } : {}),
  };
}

function convertRuntimeItemOverrides(overrides: WorldMapItemOverride[] | undefined): EditorItemOverride[] | undefined {
  if (!overrides || overrides.length === 0) return undefined;
  return overrides.map((override) => ({
    id: override.id,
    label: override.label,
    description: override.description,
    icon: override.icon,
    category: override.category,
    stackable: override.stackable,
    maxStack: override.maxStack,
    fields: override.fields ? { ...override.fields } : undefined,
  }));
}

function convertRuntimePlacementToEditorPlacement(placement: WorldMapPlacement): EditorTilePlacement {
  const editorPlacement: EditorTilePlacement = {
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
  };

  const gameplay = convertRuntimeGameplayToEditorGameplay(placement.gameplay);
  if (gameplay) editorPlacement.gameplay = gameplay;

  return editorPlacement;
}

function convertRuntimeGameplayToEditorGameplay(
  gameplay: WorldMapPlacementGameplay | undefined,
): EditorPlacementGameplay | undefined {
  if (!gameplay) return undefined;

  if (gameplay.kind === 'resource') {
    return {
      kind: 'resource',
      resourceType: gameplay.resourceType,
      blocksMovement: gameplay.blocksMovement,
      maxHp: gameplay.maxHp,
      respawnMs: gameplay.respawnMs,
    };
  }

  const converted: EditorPlacementGameplay = {
    kind: 'monsterSpawn',
    monsterType: gameplay.monsterType,
    spawnRadius: gameplay.spawnRadius,
    maxAlive: gameplay.maxAlive,
    respawnMs: gameplay.respawnMs,
    spawnsPerMinute: gameplay.spawnsPerMinute,
    spawnsPerHour: gameplay.spawnsPerHour,
  };

  if (gameplay.spec) converted.spec = { ...gameplay.spec };
  return converted;
}

function getWorldSaveContentScore(world: EditorWorldSave | null): number {
  if (!world) return 0;
  const placementScore = world.cells.reduce((sum, cell) => sum + countUserPlacements(cell.draft.placements), 0);
  const spawnRuleScore = world.worldMap.monsterSpawnRules?.length ?? 0;
  const itemScore = world.worldMap.itemOverrides?.length ?? 0;
  const terrainRuleScore = world.worldMap.terrainRuleSet?.rules.length ?? 0;
  return placementScore + spawnRuleScore + itemScore + terrainRuleScore;
}

function countUserPlacements(placements: EditorTilePlacement[]): number {
  return placements.filter((placement) => placement.id !== 'editor-black-base').length;
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

function isValidTerrainRuleSet(value: EditorTerrainRuleSet): boolean {
  return Boolean(value && value.version === 1 && Array.isArray(value.rules) && typeof value.updatedAt === 'number');
}
