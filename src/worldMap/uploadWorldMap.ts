import type { EditorWorldSave } from '../editor/types';
import { getServerHttpPath } from '../net/serverHttp';
import { compileRuntimeWorldMap } from './compileRuntimeWorldMap';
import type { GameWorldMap } from './types';

export type UploadedWorldMapReport = {
  cells: number;
  placements: number;
  resources: {
    tree: number;
    stone: number;
    total: number;
  };
};

export async function uploadWorldMap(world: EditorWorldSave): Promise<UploadedWorldMapReport> {
  const payload = compileRuntimeWorldMap(world);
  const url = getServerHttpPath('/maps/default');

  const response = await fetch(url, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload world map: ${response.status}`);
  }

  const verified = await fetchWorldMap(url);
  const expectedSignature = createMapSignature(payload);
  const actualSignature = createMapSignature(verified);

  if (expectedSignature !== actualSignature) {
    throw new Error(
      `World map upload verification failed: expected ${expectedSignature}, got ${actualSignature}`,
    );
  }

  const report = createUploadReport(payload);
  console.info('[WorldMap] Uploaded and verified world cells:', payload.cells.map((cell) => `${cell.gridX}:${cell.gridY}`), report);
  return report;
}

async function fetchWorldMap(url: string): Promise<GameWorldMap | null> {
  const response = await fetch(withCacheBuster(url), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to verify uploaded world map: ${response.status}`);
  }

  return await response.json() as GameWorldMap | null;
}

function createMapSignature(map: GameWorldMap | null | undefined): string {
  if (!map) return 'null';

  const cells = map.cells
    .map((cell) => `${cell.gridX}:${cell.gridY}:${cell.placements.length}`)
    .sort()
    .join('|');

  return `${map.version}:${map.name}:${map.tileSize}:${map.cellSize}:${cells}`;
}

function createUploadReport(map: GameWorldMap): UploadedWorldMapReport {
  let placements = 0;
  let tree = 0;
  let stone = 0;

  for (const cell of map.cells) {
    placements += cell.placements.length;
    for (const placement of cell.placements) {
      if (placement.gameplay?.kind !== 'resource') continue;
      if (placement.gameplay.resourceType === 'tree') tree += 1;
      if (placement.gameplay.resourceType === 'stone') stone += 1;
    }
  }

  return {
    cells: map.cells.length,
    placements,
    resources: {
      tree,
      stone,
      total: tree + stone,
    },
  };
}

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}
