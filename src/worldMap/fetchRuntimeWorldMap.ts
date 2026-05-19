import { getServerHttpPath } from '../net/serverHttp';
import type { GameWorldMap } from './types';

export async function fetchRuntimeWorldMap(): Promise<GameWorldMap | null> {
  const response = await fetch(withCacheBuster(getServerHttpPath('/maps/default')), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch runtime world map: ${response.status}`);
  }

  return await response.json() as GameWorldMap | null;
}

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}
