import type { EditorWorldSave } from '../editor/types';
import { getServerHttpPath } from '../net/serverHttp';
import { compileRuntimeWorldMap } from './compileRuntimeWorldMap';

export async function uploadWorldMap(world: EditorWorldSave): Promise<void> {
  const payload = compileRuntimeWorldMap(world);

  const response = await fetch(getServerHttpPath('/maps/default'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload world map: ${response.status}`);
  }

  console.info('[WorldMap] Uploaded world cells:', payload.cells.map((cell) => `${cell.gridX}:${cell.gridY}`));
}
