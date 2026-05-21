import { getDefaultHttpApiUrl } from './network';

export function getDefaultServerHttpUrl(): string {
  const url = new URL(getDefaultHttpApiUrl('/'), window.location.href);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function getServerHttpPath(path: string): string {
  return getDefaultHttpApiUrl(path);
}
