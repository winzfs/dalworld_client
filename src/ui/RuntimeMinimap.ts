import type { MonsterSnapshot, PlayerSnapshot, ResourceSnapshot } from '../protocol/messages';
import { getActiveCell } from '../worldMap/activeCellStore';
import type { GameWorldMap, WorldMapPlacement } from '../worldMap/types';

export type RuntimeMinimapRenderContext = {
  map: GameWorldMap | null;
  players: PlayerSnapshot[];
  resources: ResourceSnapshot[];
  monsters: MonsterSnapshot[];
  localPlayer: PlayerSnapshot | null;
};

type MinimapSizeLevel = 0 | 1 | 2;

const ROOT_ID = 'dalworld-runtime-minimap';
const SIZE_LEVELS: Array<{ label: string; size: number }> = [
  { label: 'S', size: 150 },
  { label: 'M', size: 204 },
  { label: 'L', size: 270 },
];

/**
 * Read-only runtime minimap. It visualizes server snapshots and runtime map data
 * without making any gameplay decisions on the client.
 */
export class RuntimeMinimap {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly title: HTMLSpanElement;
  private readonly sizeButton: HTMLButtonElement;
  private sizeLevel: MinimapSizeLevel = 1;
  private lastTickSignature = '';

  constructor() {
    this.root = document.createElement('section');
    this.root.id = ROOT_ID;
    this.root.className = 'runtime-minimap runtime-minimap-size-m';
    this.root.setAttribute('aria-label', '미니맵');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'runtime-minimap-canvas';

    this.title = document.createElement('span');
    this.title.className = 'runtime-minimap-title-text';
    this.title.textContent = '미니맵';

    this.sizeButton = document.createElement('button');
    this.sizeButton.type = 'button';
    this.sizeButton.className = 'runtime-minimap-size-button';
    this.sizeButton.setAttribute('aria-label', '미니맵 크기 변경');
    this.sizeButton.textContent = SIZE_LEVELS[this.sizeLevel].label;

    const header = document.createElement('div');
    header.className = 'runtime-minimap-header';
    header.append(this.title, this.sizeButton);

    this.root.append(header, this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create minimap canvas context');
    this.ctx = ctx;

    this.sizeButton.addEventListener('click', () => this.cycleSize());
    this.applySize();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  render(context: RuntimeMinimapRenderContext): void {
    const active = getActiveCell();
    const cellSize = context.map?.cellSize ?? 3000;
    const signature = [
      active.gridX,
      active.gridY,
      context.localPlayer?.x.toFixed(1) ?? '-',
      context.localPlayer?.y.toFixed(1) ?? '-',
      context.players.length,
      context.resources.length,
      context.monsters.length,
      this.sizeLevel,
    ].join('|');

    if (signature === this.lastTickSignature) return;
    this.lastTickSignature = signature;

    this.title.textContent = `미니맵 ${active.gridX}:${active.gridY}`;
    this.clear();
    this.drawGrid();
    this.drawMapPlacements(context.map, active.gridX, active.gridY, cellSize);
    this.drawResources(context.resources, active.gridX, active.gridY, cellSize);
    this.drawMonsters(context.monsters, cellSize);
    this.drawPlayers(context.players, context.localPlayer, active.gridX, active.gridY, cellSize);
  }

  private cycleSize(): void {
    this.sizeLevel = ((this.sizeLevel + 1) % SIZE_LEVELS.length) as MinimapSizeLevel;
    this.applySize();
    this.lastTickSignature = '';
  }

  private applySize(): void {
    const size = SIZE_LEVELS[this.sizeLevel].size;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(size * ratio);
    this.canvas.height = Math.floor(size * ratio);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    this.root.classList.toggle('runtime-minimap-size-s', this.sizeLevel === 0);
    this.root.classList.toggle('runtime-minimap-size-m', this.sizeLevel === 1);
    this.root.classList.toggle('runtime-minimap-size-l', this.sizeLevel === 2);
    this.root.style.setProperty('--runtime-minimap-size', `${size}px`);
    document.documentElement.style.setProperty('--runtime-minimap-size', `${size}px`);
    this.sizeButton.textContent = SIZE_LEVELS[this.sizeLevel].label;
  }

  private clear(): void {
    const size = this.getSize();
    this.ctx.clearRect(0, 0, size, size);
    this.ctx.fillStyle = 'rgba(8, 14, 18, 0.92)';
    roundRect(this.ctx, 0, 0, size, size, 14);
    this.ctx.fill();
  }

  private drawGrid(): void {
    const size = this.getSize();
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const p = (size / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(p, 0);
      this.ctx.lineTo(p, size);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(0, p);
      this.ctx.lineTo(size, p);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawMapPlacements(map: GameWorldMap | null, cellX: number, cellY: number, cellSize: number): void {
    const cell = map?.cells.find((candidate) => candidate.gridX === cellX && candidate.gridY === cellY);
    if (!cell) return;

    for (const placement of cell.placements) {
      this.drawPlacement(placement, cellSize);
    }
  }

  private drawPlacement(placement: WorldMapPlacement, cellSize: number): void {
    const size = this.getSize();
    const x = toMinimapCoord(placement.x, cellSize, size);
    const y = toMinimapCoord(placement.y, cellSize, size);
    const radius = placement.layer === 'collision' ? 2.6 : 1.8;

    if (placement.gameplay?.kind === 'resource') {
      this.ctx.fillStyle = placement.gameplay.resourceType === 'tree' ? 'rgba(80, 220, 130, 0.42)' : 'rgba(190, 198, 205, 0.42)';
    } else if (placement.gameplay?.kind === 'monsterSpawn') {
      this.ctx.fillStyle = 'rgba(255, 98, 120, 0.26)';
      this.ctx.beginPath();
      this.ctx.arc(x, y, Math.max(3, toMinimapDistance(placement.gameplay.spawnRadius, cellSize, size)), 0, Math.PI * 2);
      this.ctx.fill();
      return;
    } else if (placement.layer === 'collision') {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    } else {
      this.ctx.fillStyle = 'rgba(255, 232, 180, 0.16)';
    }

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawResources(resources: ResourceSnapshot[], cellX: number, cellY: number, cellSize: number): void {
    const size = this.getSize();
    for (const resource of resources) {
      if (!resource.alive || resource.cellX !== cellX || resource.cellY !== cellY) continue;
      const x = toMinimapCoord(resource.x, cellSize, size);
      const y = toMinimapCoord(resource.y, cellSize, size);
      this.ctx.fillStyle = resource.type === 'tree' ? '#54dc78' : '#c3ccd5';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawMonsters(monsters: MonsterSnapshot[], cellSize: number): void {
    const size = this.getSize();
    for (const monster of monsters) {
      if (monster.hp <= 0) continue;
      const x = toMinimapCoord(monster.x, cellSize, size);
      const y = toMinimapCoord(monster.y, cellSize, size);
      this.ctx.fillStyle = '#ff5f7a';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawPlayers(
    players: PlayerSnapshot[],
    localPlayer: PlayerSnapshot | null,
    cellX: number,
    cellY: number,
    cellSize: number,
  ): void {
    const size = this.getSize();
    for (const player of players) {
      if (!player.alive || player.cellX !== cellX || player.cellY !== cellY) continue;
      const x = toMinimapCoord(player.x, cellSize, size);
      const y = toMinimapCoord(player.y, cellSize, size);
      const isLocal = localPlayer?.id === player.id;
      this.ctx.fillStyle = isLocal ? '#ffe066' : '#7ee7ff';
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(x, y, isLocal ? 5 : 3.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  private getSize(): number {
    return SIZE_LEVELS[this.sizeLevel].size;
  }
}

function toMinimapCoord(value: number, cellSize: number, minimapSize: number): number {
  if (!Number.isFinite(value) || cellSize <= 0) return 0;
  return Math.min(minimapSize, Math.max(0, (value / cellSize) * minimapSize));
}

function toMinimapDistance(value: number, cellSize: number, minimapSize: number): number {
  if (!Number.isFinite(value) || cellSize <= 0) return 0;
  return Math.max(0, (value / cellSize) * minimapSize);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
