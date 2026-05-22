import type { EditorMapDraft, EditorTilePlacement, EditorWorldSave } from './types';
import type { TilePlacementSystem } from './TilePlacementSystem';

type ServerWorldPlacement = EditorTilePlacement;
type ServerWorldMap = {
  version: 1;
  name: string;
  tileSize: number;
  cellSize: number;
  cells: Array<{
    gridX: number;
    gridY: number;
    placements: ServerWorldPlacement[];
  }>;
  monsterSpawnRules?: unknown;
  itemOverrides?: unknown;
};

type WorldCellCoord = {
  gridX: number;
  gridY: number;
};

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
    this.drafts.set(this.activeKey, optionsDraftClone(this.options.placement.mapDraft));
  }

  ensureCells(cells: WorldCellCoord[]): void {
    for (const cell of cells) {
      const gridX = Number.isFinite(cell.gridX) ? cell.gridX : 0;
      const gridY = Number.isFinite(cell.gridY) ? cell.gridY : 0;
      const key = cellKey(gridX, gridY);
      if (!this.drafts.has(key)) {
        this.drafts.set(key, createEmptyCellDraft(gridX, gridY, this.options.defaultTileSize));
      }
    }
  }

  async switchTo(gridX: number, gridY: number): Promise<EditorMapDraft> {
    this.saveActive();

    const nextKey = cellKey(gridX, gridY);
    this.activeKey = nextKey;

    const nextDraft = this.drafts.get(nextKey) ?? createEmptyCellDraft(gridX, gridY, this.options.defaultTileSize);
    this.drafts.set(nextKey, nextDraft);
    await this.options.placement.replaceDraft(optionsDraftClone(nextDraft));
    return nextDraft;
  }

  async loadFromServerMap(map: ServerWorldMap): Promise<EditorMapDraft> {
    this.drafts.clear();

    const worldMap = {
      version: 1 as const,
      cellSize: map.cellSize || this.options.cellSize || 3000,
      current: { gridX: map.cells[0]?.gridX ?? 0, gridY: map.cells[0]?.gridY ?? 0 },
      cells: map.cells.map((cell) => ({
        id: `cell-${cell.gridX}-${cell.gridY}`,
        name: `Cell ${cell.gridX},${cell.gridY}`,
        gridX: cell.gridX,
        gridY: cell.gridY,
      })),
      monsterSpawnRules: map.monsterSpawnRules as never,
      itemOverrides: map.itemOverrides as never,
    };

    for (const cell of map.cells) {
      this.drafts.set(cellKey(cell.gridX, cell.gridY), {
        version: 1,
        name: `${map.name || 'Map'} ${cell.gridX},${cell.gridY}`,
        tileSize: map.tileSize || this.options.defaultTileSize || 32,
        worldMap,
        placements: cell.placements.map((placement) => ({
          ...placement,
          sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
          gameplay: placement.gameplay ? { ...placement.gameplay } : undefined,
        })),
      });
    }

    if (this.drafts.size === 0) {
      this.drafts.set(cellKey(0, 0), createEmptyCellDraft(0, 0, map.tileSize || this.options.defaultTileSize || 32));
    }

    const first = map.cells[0] ?? { gridX: 0, gridY: 0 };
    this.activeKey = cellKey(first.gridX, first.gridY);
    const draft = this.drafts.get(this.activeKey) ?? createEmptyCellDraft(first.gridX, first.gridY, map.tileSize || 32);
    await this.options.placement.replaceDraft(optionsDraftClone(draft));
    return draft;
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
          placements: cell.draft.placements.map((placement) => ({
            ...placement,
            sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
            gameplay: placement.gameplay ? { ...placement.gameplay } : undefined,
          })),
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

function optionsDraftClone(draft: EditorMapDraft): EditorMapDraft {
  return {
    ...draft,
    worldMap: draft.worldMap ? {
      ...draft.worldMap,
      current: draft.worldMap.current ? { ...draft.worldMap.current } : { gridX: 0, gridY: 0 },
      cells: draft.worldMap.cells.map((cell) => ({ ...cell })),
      monsterSpawnRules: draft.worldMap.monsterSpawnRules?.map((rule) => ({
        ...rule,
        spec: rule.spec ? { ...rule.spec } : undefined,
      })),
      itemOverrides: draft.worldMap.itemOverrides?.map((override) => ({
        ...override,
        fields: override.fields ? { ...override.fields } : undefined,
      })),
    } : undefined,
    placements: draft.placements.map((placement) => ({
      ...placement,
      sourceRect: placement.sourceRect ? { ...placement.sourceRect } : undefined,
      gameplay: placement.gameplay ? { ...placement.gameplay } : undefined,
    })),
  };
}

function parseCellKey(key: string): [number, number] {
  const [rawX, rawY] = key.split(',');
  const gridX = Number(rawX);
  const gridY = Number(rawY);
  return [Number.isFinite(gridX) ? gridX : 0, Number.isFinite(gridY) ? gridY : 0];
}
