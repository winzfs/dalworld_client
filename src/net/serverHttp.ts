import { getDefaultWebSocketUrl } from './network';

export function getDefaultServerHttpUrl(): string {
  const envUrl = import.meta.env.VITE_DALWORLD_HTTP_URL;
  if (typeof envUrl === 'string' && envUrl.length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  const wsUrl = getDefaultWebSocketUrl();

  try {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function getServerHttpPath(path: string): string {
  const base = getDefaultServerHttpUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}
