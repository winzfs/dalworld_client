import type { EditorTilePlacement, EditorWorldSave } from './types';

type ServerWorldMap = {
  version: 1;
  name: string;
  tileSize: number;
  cellSize: number;
  cells: Array<{
    gridX: number;
    gridY: number;
    placements: EditorTilePlacement[];
  }>;
  monsterSpawnRules?: unknown;
  itemOverrides?: unknown;
};

export async function saveEditorWorldSaveToServer(
  world: EditorWorldSave,
  status: (message: string) => void,
): Promise<void> {
  try {
    status(`서버 저장 모듈 로딩 중... cells=${world.cells.length}`);
    const { uploadWorldMap } = await import('../worldMap/uploadWorldMap');
    const placementCount = world.cells.reduce((sum, cell) => sum + cell.draft.placements.length, 0);
    status(`서버 저장 중... cells=${world.cells.length}, placements=${placementCount}`);
    const report = await uploadWorldMap(world);
    status(`서버 저장 완료. cells=${report.cells}, placements=${report.placements}`);
  } catch (error) {
    const message = `서버 저장 실패: ${formatErrorMessage(error)}`;
    status(message);
    console.warn('[MapEditor] World save upload failed.', error);
  }
}

export async function loadServerWorldMap(status: (message: string) => void): Promise<ServerWorldMap> {
  status('서버 맵 불러오기 모듈 로딩 중...');
  const { getServerHttpPath } = await import('../net/serverHttp');
  const url = getServerHttpPath('/maps/default');
  status('서버 맵 불러오는 중...');
  const response = await fetch(withCacheBuster(url), {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-store' },
  });
  if (!response.ok) throw new Error(`GET /maps/default failed: ${response.status}`);

  const map = await response.json() as ServerWorldMap | null;
  if (!map) throw new Error('서버에 저장된 맵이 없습니다.');
  status(`서버 맵 수신 완료. cells=${map.cells.length}`);
  return map;
}

export function exportEditorWorldSaveJson(world: EditorWorldSave): void {
  const json = JSON.stringify(world, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${world.name || 'dalworld-map'}.world.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
