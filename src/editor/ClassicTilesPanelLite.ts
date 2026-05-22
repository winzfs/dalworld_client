import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';

type Options = {
  state: EditorState;
  placement: TilePlacementSystem;
  status: (message: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onToggleWorldMap?: () => void;
};

export function mountClassicTilesPanelLite(options: Options): void {
  document.querySelector('.staged-classic-editor-panel')?.remove();

  const panel = document.createElement('div');
  panel.className = 'map-editor-panel staged-classic-editor-panel';
  panel.style.left = '20px';
  panel.style.top = '20px';
  panel.style.zIndex = '2147483646';

  const header = document.createElement('div');
  header.className = 'map-editor-header';
  header.textContent = 'Map Editor';

  const tabs = document.createElement('div');
  tabs.className = 'map-editor-tabs';
  tabs.append(
    createTabButton('Tiles', true, () => options.status('Tiles 탭 선택됨.')),
    createTabButton('Monsters', false, () => options.status('Monsters 탭 선택됨.')),
  );

  const note = document.createElement('div');
  note.className = 'map-editor-empty';
  note.textContent = '패널 껍데기 + 탭 표시 완료';

  panel.append(header, tabs, note);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 탭 표시 완료.');
}

function createTabButton(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = active ? 'map-editor-tab is-active' : 'map-editor-tab';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}
