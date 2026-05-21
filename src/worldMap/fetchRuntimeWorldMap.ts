import { getServerHttpPath } from '../net/serverHttp';
import type { GameWorldMap } from './types';

const RUNTIME_WORLD_MAP_FETCH_TIMEOUT_MS = 4_000;

export async function fetchRuntimeWorldMap(): Promise<GameWorldMap | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), RUNTIME_WORLD_MAP_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(withCacheBuster(getServerHttpPath('/maps/default')), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-store',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch runtime world map: ${response.status}`);
    }

    return await response.json() as GameWorldMap | null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function withCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}
