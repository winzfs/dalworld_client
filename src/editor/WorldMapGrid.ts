import type { EditorMapCell, EditorMapCoord, EditorMonsterSpawnRule, EditorWorldMapDraft } from './types';

export type WorldMapGridListener = () => void;

export type WorldMapGridOptions = {
  cellSize: number;
};

export class WorldMapGrid {
  private readonly listeners = new Set<WorldMapGridListener>();
  private draft: EditorWorldMapDraft;

  constructor(options: WorldMapGridOptions) {
    this.draft = {
      version: 1,
      cellSize: options.cellSize,
      current: { gridX: 0, gridY: 0 },
      cells: [createCell(0, 0)],
      monsterSpawnRules: createDefaultMonsterSpawnRules(),
    };
  }

  get current(): EditorMapCoord {
    return { ...this.draft.current };
  }

  get cellSize(): number {
    return this.draft.cellSize;
  }

  get cells(): EditorMapCell[] {
    return this.draft.cells.map((cell) => ({ ...cell }));
  }

  get monsterSpawnRules(): EditorMonsterSpawnRule[] {
    return cloneSpawnRules(this.draft.monsterSpawnRules ?? []);
  }

  get snapshot(): EditorWorldMapDraft {
    return {
      ...this.draft,
      current: { ...this.draft.current },
      cells: this.cells,
      monsterSpawnRules: this.monsterSpawnRules,
    };
  }

  subscribe(listener: WorldMapGridListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(draft: EditorWorldMapDraft | undefined): void {
    if (!draft || draft.version !== 1 || !Array.isArray(draft.cells)) return;

    this.draft = {
      version: 1,
      cellSize: draft.cellSize || this.draft.cellSize,
      current: draft.current ? { ...draft.current } : { gridX: 0, gridY: 0 },
      cells: normalizeCells(draft.cells),
      monsterSpawnRules: normalizeSpawnRules(draft.monsterSpawnRules),
    };

    this.ensureCell(this.draft.current.gridX, this.draft.current.gridY);
    this.emit();
  }

  setMonsterSpawnRules(rules: EditorMonsterSpawnRule[]): void {
    this.draft.monsterSpawnRules = normalizeSpawnRules(rules);
    this.emit();
  }

  selectCell(gridX: number, gridY: number): void {
    this.ensureCell(gridX, gridY);
    this.draft.current = { gridX, gridY };
    this.emit();
  }

  deleteCell(gridX: number, gridY: number): void {
    const id = cellId(gridX, gridY);
    const isOrigin = id === cellId(0, 0);

    if (!isOrigin) {
      this.draft.cells = this.draft.cells.filter((cell) => cellId(cell.gridX, cell.gridY) !== id);
    }

    if (isOrigin || this.draft.cells.length === 0) {
      this.draft.cells = [createCell(0, 0)];
      this.draft.current = { gridX: 0, gridY: 0 };
    } else if (this.draft.current.gridX === gridX && this.draft.current.gridY === gridY) {
      this.draft.current = { gridX: 0, gridY: 0 };
      this.ensureCell(0, 0);
    }

    this.emit();
  }

  createNeighbor(dx: number, dy: number): EditorMapCell {
    const nextX = this.draft.current.gridX + dx;
    const nextY = this.draft.current.gridY + dy;
    const cell = this.ensureCell(nextX, nextY);
    this.emit();
    return { ...cell };
  }

  getCell(gridX: number, gridY: number): EditorMapCell | null {
    return this.draft.cells.find((cell) => cell.gridX === gridX && cell.gridY === gridY) ?? null;
  }

  hasCell(gridX: number, gridY: number): boolean {
    return this.getCell(gridX, gridY) !== null;
  }

  private ensureCell(gridX: number, gridY: number): EditorMapCell {
    let cell = this.getCell(gridX, gridY);
    if (!cell) {
      cell = createCell(gridX, gridY);
      this.draft.cells.push(cell);
    }
    return cell;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function createCell(gridX: number, gridY: number): EditorMapCell {
  return {
    id: cellId(gridX, gridY),
    name: `Map ${gridX},${gridY}`,
    gridX,
    gridY,
  };
}

function normalizeCells(cells: EditorMapCell[]): EditorMapCell[] {
  const seen = new Set<string>();
  const result: EditorMapCell[] = [];

  for (const cell of cells) {
    const gridX = Number.isFinite(cell.gridX) ? cell.gridX : 0;
    const gridY = Number.isFinite(cell.gridY) ? cell.gridY : 0;
    const id = cellId(gridX, gridY);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name: cell.name || `Map ${gridX},${gridY}`,
      gridX,
      gridY,
    });
  }

  if (!seen.has(cellId(0, 0))) {
    result.unshift(createCell(0, 0));
  }

  return result;
}

function createDefaultMonsterSpawnRules(): EditorMonsterSpawnRule[] {
  return [
    {
      id: 'world-spawn-wild-slime',
      enabled: false,
      monsterType: 'wild_slime',
      scope: 'world',
      maxAlive: 12,
      spawnsPerHour: 60,
    },
    {
      id: 'world-spawn-sheep',
      enabled: false,
      monsterType: 'sheep',
      scope: 'world',
      maxAlive: 8,
      spawnsPerHour: 30,
    },
  ];
}

function normalizeSpawnRules(rules: EditorMonsterSpawnRule[] | undefined): EditorMonsterSpawnRule[] {
  const source = rules && rules.length > 0 ? rules : createDefaultMonsterSpawnRules();
  return source.map((rule) => ({
    id: rule.id || crypto.randomUUID(),
    enabled: rule.enabled === true,
    monsterType: rule.monsterType === 'sheep' ? 'sheep' : 'wild_slime',
    scope: rule.scope === 'region' ? 'region' : 'world',
    maxAlive: clampInteger(rule.maxAlive, 0, 500, 10),
    spawnsPerHour: clampInteger(rule.spawnsPerHour, 1, 36000, 60),
    spec: rule.spec ? { ...rule.spec } : undefined,
  }));
}

function cloneSpawnRules(rules: EditorMonsterSpawnRule[]): EditorMonsterSpawnRule[] {
  return rules.map((rule) => ({
    ...rule,
    spec: rule.spec ? { ...rule.spec } : undefined,
  }));
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cellId(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}