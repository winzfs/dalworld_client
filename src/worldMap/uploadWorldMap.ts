import type { EditorWorldSave } from '../editor/types';
import { getServerHttpPath } from '../net/serverHttp';

export async function uploadWorldMap(world: EditorWorldSave): Promise<void> {
  const payload = {
    version: 1,
    name: world.name,
    tileSize: world.tileSize,
    cellSize: world.worldMap?.cellSize ?? 3000,
    cells: world.cells.map((cell) => ({
      gridX: cell.gridX,
      gridY: cell.gridY,
      placements: cell.draft.placements,
    })),
  };

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
