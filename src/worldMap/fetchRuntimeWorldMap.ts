import { getServerHttpPath } from '../net/serverHttp';
import type { GameWorldMap } from './types';

export async function fetchRuntimeWorldMap(): Promise<GameWorldMap | null> {
  const response = await fetch(getServerHttpPath('/maps/default'), {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch runtime world map: ${response.status}`);
  }

  return await response.json<GameWorldMap | null>();
}
