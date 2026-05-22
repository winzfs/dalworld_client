import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorWorldMapDraft, EditorWorldSave } from './types';
import { WorldCellDraftStore } from './WorldCellDraftStore';

const DEFAULT_WORLD_SIZE = 3000;
const DEFAULT_MAP_NAME = 'dalworld-map-lightweight';

type ServerWorldMapForSession = {
  version: 1;
  name: string;
  tileSize: number;
  cellSize: number;
  cells: Array<{ gridX: number; gridY: number; placements: unknown[] }>;
  monsterSpawnRules?: EditorWorldMapDraft['monsterSpawnRules'];
  itemOverrides?: EditorWorldMapDraft['itemOverrides'];
};

type WorldMapGridLike = {
  readonly current: { gridX: number; gridY: number };
  readonly cells: Array<{ gridX: number; gridY: number }>;
  load(draft: EditorWorldMapDraft | undefined): void;
  selectCell(gridX: number, gridY: number): void;
  deleteCell(gridX: number, gridY: number): void;
};

export type MapEditorSessionOptions = {
  state: EditorState;
  placement: TilePlacementSystem;
  status: (message: string) => void;
  mapName?: string;
  cellSize?: number;
};

export class MapEditorSession {
  readonly state: EditorState;
  readonly placement: TilePlacementSystem;
  private readonly status: (message: string) => void;
  private readonly mapName: string;
  private readonly cellSize: number;
  private readonly draftStore: WorldCellDraftStore;
  private worldMapGrid: WorldMapGridLike | null = null;

  constructor(options: MapEditorSessionOptions) {
    this.state = options.state;
    this.placement = options.placement;
    this.status = options.status;
    this.mapName = options.mapName ?? DEFAULT_MAP_NAME;
    this.cellSize = options.cellSize ?? DEFAULT_WORLD_SIZE;
    this.draftStore = new WorldCellDraftStore({
      placement: options.placement,
      defaultTileSize: options.state.gridSize,
      cellSize: this.cellSize,
    });
  }

  attachWorldMapGrid(grid: WorldMapGridLike): void {
    this.worldMapGrid = grid;
    this.draftStore.ensureCells(grid.cells);
  }

  async switchWorldCell(gridX: number, gridY: number): Promise<void> {
    this.worldMapGrid?.selectCell(gridX, gridY);
    const draft = await this.draftStore.switchTo(gridX, gridY);
    this.status(`월드맵 셀 전환 완료: ${gridX}, ${gridY} / placements=${draft.placements.length}`);
  }

  async deleteWorldCell(gridX: number, gridY: number): Promise<void> {
    this.draftStore.deleteCell(gridX, gridY);
    this.worldMapGrid?.deleteCell(gridX, gridY);
    const current = this.worldMapGrid?.current ?? { gridX: 0, gridY: 0 };
    await this.switchWorldCell(current.gridX, current.gridY);
  }

  createWorldSnapshot(): EditorWorldSave {
    if (this.worldMapGrid) {
      this.draftStore.ensureCells(this.worldMapGrid.cells);
    }
    const world = this.draftStore.snapshotWorldSave(this.mapName);
    const coords = formatCellCoords(world.cells);
    this.status(`월드 snapshot 생성. cells=${world.cells.length}, coords=${coords}`);
    return world;
  }

  async saveWorld(): Promise<void> {
    const world = this.createWorldSnapshot();
    await this.validateWorldBeforePersistence(world);
    const { saveEditorWorldSaveToServer } = await import('./EditorWorldSaveActions');
    await saveEditorWorldSaveToServer(world, this.status);
  }

  async loadWorld(): Promise<void> {
    const { loadServerWorldMap } = await import('./EditorWorldSaveActions');
    const map = await loadServerWorldMap(this.status);
    const worldMapDraft = createWorldMapDraftFromServerMap(map as ServerWorldMapForSession);

    if (this.worldMapGrid) {
      this.worldMapGrid.load(worldMapDraft);
    }

    const draft = await this.draftStore.loadFromServerMap(map);

    if (this.worldMapGrid) {
      this.draftStore.ensureCells(this.worldMapGrid.cells);
    }

    this.status(`전체 월드 불러오기 완료. cells=${map.cells.length}, current=${worldMapDraft.current.gridX},${worldMapDraft.current.gridY}, placements=${draft.placements.length}`);
  }

  async exportWorldJson(): Promise<void> {
    const world = this.createWorldSnapshot();
    await this.validateWorldBeforePersistence(world);
    const { exportEditorWorldSaveJson } = await import('./EditorWorldSaveActions');
    exportEditorWorldSaveJson(world);
    this.status(`전체 월드 JSON export 완료. cells=${world.cells.length}`);
  }

  private async validateWorldBeforePersistence(world: EditorWorldSave): Promise<void> {
    const worldCellKeys = new Set(world.cells.map((cell) => cellKey(cell.gridX, cell.gridY)));
    const gridCells = this.worldMapGrid?.cells ?? [];
    const missingGridCells = gridCells.filter((cell) => !worldCellKeys.has(cellKey(cell.gridX, cell.gridY)));

    if (missingGridCells.length > 0) {
      const missing = formatCellCoords(missingGridCells);
      const message = `저장 중단: 월드맵 UI 셀이 snapshot에 없습니다. missing=${missing}`;
      this.status(message);
      throw new Error(message);
    }

    const { compileRuntimeWorldMap } = await import('../worldMap/compileRuntimeWorldMap');
    const compiled = compileRuntimeWorldMap(world);
    const worldCounts = world.cells.map((cell) => `${cell.gridX},${cell.gridY}:${cell.draft.placements.length}`).join(' | ');
    const compiledCounts = compiled.cells.map((cell) => `${cell.gridX},${cell.gridY}:${cell.placements.length}`).join(' | ');

    if (compiled.cells.length !== world.cells.length) {
      const message = `저장 중단: snapshot cells와 compiled cells 수가 다릅니다. snapshot=${world.cells.length}, compiled=${compiled.cells.length}`;
      this.status(message);
      throw new Error(message);
    }

    this.status(`저장 검증 완료. snapshot=[${worldCounts}] compiled=[${compiledCounts}]`);
  }
}

function createWorldMapDraftFromServerMap(map: ServerWorldMapForSession): EditorWorldMapDraft {
  const first = map.cells[0] ?? { gridX: 0, gridY: 0 };
  return {
    version: 1,
    cellSize: map.cellSize || DEFAULT_WORLD_SIZE,
    current: { gridX: first.gridX, gridY: first.gridY },
    cells: map.cells.map((cell) => ({
      id: `cell-${cell.gridX}-${cell.gridY}`,
      name: `Cell ${cell.gridX},${cell.gridY}`,
      gridX: cell.gridX,
      gridY: cell.gridY,
    })),
    monsterSpawnRules: map.monsterSpawnRules,
    itemOverrides: map.itemOverrides,
  };
}

function cellKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

function formatCellCoords(cells: Array<{ gridX: number; gridY: number }>): string {
  return cells.map((cell) => `${cell.gridX},${cell.gridY}`).join(' | ') || 'none';
}
