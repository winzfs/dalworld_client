import type { EditorMapDraft } from './types';
import type { TilePlacementSystem } from './TilePlacementSystem';

export type WorldCellDraftStoreOptions = {
  placement: TilePlacementSystem;
  defaultTileSize: number;
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
