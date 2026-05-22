import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorWorldSave } from './types';
import { WorldCellDraftStore } from './WorldCellDraftStore';

const DEFAULT_WORLD_SIZE = 3000;
const DEFAULT_MAP_NAME = 'dalworld-map-lightweight';

type WorldMapGridLike = {
  readonly current: { gridX: number; gridY: number };
  readonly cells: Array<{ gridX: number; gridY: number }>;
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
    const coords = world.cells.map((cell) => `${cell.gridX},${cell.gridY}`).join(' | ');
    this.status(`월드 snapshot 생성. cells=${world.cells.length}, coords=${coords}`);
    return world;
  }

  async saveWorld(): Promise<void> {
    const world = this.createWorldSnapshot();
    const { saveEditorWorldSaveToServer } = await import('./EditorWorldSaveActions');
    await saveEditorWorldSaveToServer(world, this.status);
  }

  async loadWorld(): Promise<void> {
    const { loadServerWorldMap } = await import('./EditorWorldSaveActions');
    const map = await loadServerWorldMap(this.status);
    const draft = await this.draftStore.loadFromServerMap(map);
    if (this.worldMapGrid) {
      for (const cell of map.cells) {
        this.worldMapGrid.selectCell(cell.gridX, cell.gridY);
      }
      const current = map.cells[0] ?? { gridX: 0, gridY: 0 };
      this.worldMapGrid.selectCell(current.gridX, current.gridY);
    }
    this.status(`전체 월드 불러오기 완료. cells=${map.cells.length}, placements=${draft.placements.length}`);
  }

  async exportWorldJson(): Promise<void> {
    const world = this.createWorldSnapshot();
    const { exportEditorWorldSaveJson } = await import('./EditorWorldSaveActions');
    exportEditorWorldSaveJson(world);
    this.status(`전체 월드 JSON export 완료. cells=${world.cells.length}`);
  }
}
