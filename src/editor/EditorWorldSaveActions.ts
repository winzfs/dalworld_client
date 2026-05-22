import type { EditorWorldSave } from './types';

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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
