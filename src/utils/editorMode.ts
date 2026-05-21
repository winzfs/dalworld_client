export function isEditorEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  return params.get('editor') === '1' ||
    params.get('editor') === 'true' ||
    params.get('mode') === 'editor' ||
    params.get('mapEditor') === '1' ||
    params.get('mapEditor') === 'true' ||
    path === '/editor' ||
    path === '/editor/' ||
    hash === '#editor' ||
    hash === '#/editor';
}
