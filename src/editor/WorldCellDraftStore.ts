import type { EditorMapDraft, EditorWorldSave } from './types';
import type { TilePlacementSystem } from './TilePlacementSystem';

export type WorldCellDraftStoreOptions = {
  placement: TilePlacementSystem;
  defaultTileSize: number;
  cellSize?: number;
};

export class WorldCellDraftStore {
  private readonly drafts = new Map<string, EditorMapDraft>();
  private activeKey = cellKey(0, 0);

  constructor(private readonly options: WorldCellDraftStoreOptions) {
    this.drafts.set(this.activeKey, options.placement.mapDraft);
  }

  get activeCellKey(): string {
    return this.activeKey;
  }

  saveActive(): void {
    this.drafts.set(this.activeKey, this.options.placement.mapDraft);
  }

  async switchTo(gridX: number, gridY: number): Promise<EditorMapDraft> {
    this.saveActive();

    const nextKey = cellKey(gridX, gridY);
    this.activeKey = nextKey;

    const nextDraft = this.drafts.get(nextKey) ?? createEmptyCellDraft(gridX, gridY, this.options.defaultTileSize);
    this.drafts.set(nextKey, nextDraft);
    await this.options.placement.replaceDraft(nextDraft);
    return nextDraft;
  }

  deleteCell(gridX: number, gridY: number): void {
    const key = cellKey(gridX, gridY);
    if (key === cellKey(0, 0)) return;
    this.drafts.delete(key);
  }

  snapshotWorldSave(name: string): EditorWorldSave {
    this.saveActive();

    const cells = Array.from(this.drafts.entries())
      .map(([key, draft]) => {
        const [gridX, gridY] = parseCellKey(key);
        return { gridX, gridY, draft };
      })
      .sort((a, b) => (a.gridY - b.gridY) || (a.gridX - b.gridX));

    const [currentX, currentY] = parseCellKey(this.activeKey);
    const tileSize = this.options.defaultTileSize || 32;
    const worldMap = {
      version: 1 as const,
      cellSize: this.options.cellSize ?? 3000,
      current: { gridX: currentX, gridY: currentY },
      cells: cells.map((cell) => ({
        id: `cell-${cell.gridX}-${cell.gridY}`,
        name: `Cell ${cell.gridX},${cell.gridY}`,
        gridX: cell.gridX,
        gridY: cell.gridY,
      })),
    };

    return {
      version: 1,
      name,
      tileSize,
      worldMap,
      cells: cells.map((cell) => ({
        gridX: cell.gridX,
        gridY: cell.gridY,
        draft: {
          ...cell.draft,
          tileSize: cell.draft.tileSize || tileSize,
          worldMap,
        },
      })),
    };
  }
}

export function cellKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

function createEmptyCellDraft(gridX: number, gridY: number, tileSize: number): EditorMapDraft {
  return {
    version: 1,
    name: `Map ${gridX},${gridY}`,
    tileSize,
    placements: [],
  };
}

function parseCellKey(key: string): [number, number] {
  const [rawX, rawY] = key.split(',');
  const gridX = Number(rawX);
  const gridY = Number(rawY);
  return [Number.isFinite(gridX) ? gridX : 0, Number.isFinite(gridY) ? gridY : 0];
}
