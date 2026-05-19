import type { EditorWorldSave } from '../editor/types';
import { getServerHttpPath } from '../net/serverHttp';
import { compileRuntimeWorldMap } from './compileRuntimeWorldMap';
import type { GameWorldMap } from './types';

export async function uploadWorldMap(world: EditorWorldSave): Promise<void> {
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

  console.info('[WorldMap] Uploaded and verified world cells:', payload.cells.map((cell) => `${cell.gridX}:${cell.gridY}`));
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

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}
