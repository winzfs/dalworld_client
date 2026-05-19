import type { EditorWorldSave } from '../editor/types';
import { getServerHttpPath } from '../net/serverHttp';
import { compileRuntimeWorldMap } from './compileRuntimeWorldMap';
import type { GameWorldMap, WorldMapCell } from './types';

export type UploadedWorldMapReport = {
  cells: number;
  placements: number;
  resources: {
    tree: number;
    stone: number;
    total: number;
  };
};

type WorldMapManifest = {
  version: 1;
  name: string;
  tileSize: number;
  cellSize: number;
  cells: Array<{ gridX: number; gridY: number }>;
};

const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

export async function uploadWorldMap(world: EditorWorldSave): Promise<UploadedWorldMapReport> {
  const payload = compileRuntimeWorldMap(world);
  await uploadWorldMapByCell(payload);

  const report = createUploadReport(payload);

  try {
    const verified = await fetchWorldMap(getServerHttpPath('/maps/default'));
    const expectedSignature = createMapSignature(payload);
    const actualSignature = createMapSignature(verified);

    if (expectedSignature !== actualSignature) {
      console.warn('[WorldMap] Upload verification mismatch after successful chunk upload.', {
        expectedSignature,
        actualSignature,
        report,
      });
    } else {
      console.info('[WorldMap] Uploaded and verified world cells:', payload.cells.map((cell) => `${cell.gridX}:${cell.gridY}`), {
        ...report,
        approxBytes: estimateJsonBytes(payload),
      });
    }
  } catch (error) {
    console.warn('[WorldMap] Upload succeeded, but post-upload verification failed.', {
      error,
      report,
    });
  }

  return report;
}

async function uploadWorldMapByCell(map: GameWorldMap): Promise<void> {
  for (const cell of map.cells) {
    await putJsonWithRetry(
      getServerHttpPath(`/maps/default/cell?gridX=${cell.gridX}&gridY=${cell.gridY}`),
      cell,
      `cell ${cell.gridX}:${cell.gridY}`,
    );
  }

  const manifest: WorldMapManifest = {
    version: map.version,
    name: map.name,
    tileSize: map.tileSize,
    cellSize: map.cellSize,
    cells: map.cells.map((cell) => ({ gridX: cell.gridX, gridY: cell.gridY })),
  };

  await putJsonWithRetry(getServerHttpPath('/maps/default/manifest'), manifest, 'manifest');
}

async function putJsonWithRetry(url: string, value: unknown, label: string): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      await putJson(url, value);
      if (attempt > 1) {
        console.info(`[WorldMap] Upload chunk recovered after retry: ${label}`, { attempt });
      }
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[WorldMap] Upload chunk failed: ${label}`, {
        attempt,
        maxAttempts: MAX_UPLOAD_ATTEMPTS,
        error,
        approxBytes: estimateJsonBytes(value),
      });

      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to upload world map chunk: ${label}`);
}

async function putJson(url: string, value: unknown): Promise<void> {
  const approxBytes = estimateJsonBytes(value);
  const response = await fetch(url, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Dalworld-Payload-Bytes': String(approxBytes),
    },
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to upload world map chunk: ${response.status} ${text}`.trim());
  }
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
    .map((cell) => `${cell.gridX}:${cell.gridY}:${cell.placements.length}:${createCellSignature(cell)}`)
    .sort()
    .join('|');

  return `${map.version}:${map.name}:${map.tileSize}:${map.cellSize}:${cells}`;
}

function createCellSignature(cell: WorldMapCell): string {
  return cell.placements
    .map((placement) => `${placement.id}:${placement.assetId}:${placement.x}:${placement.y}:${placement.layer}`)
    .sort()
    .join(',');
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

function estimateJsonBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return -1;
  }
}

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
