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
  const panel = document.createElement('div');
  panel.className = 'map-editor-panel staged-classic-editor-panel';
  panel.style.left = '20px';
  panel.style.top = '20px';
  panel.style.zIndex = '2147483646';

  const header = document.createElement('div');
  header.className = 'map-editor-header';
  header.textContent = 'Map Editor';

  const note = document.createElement('div');
  note.className = 'map-editor-empty';
  note.textContent = '패널 껍데기 표시 완료';

  panel.append(header, note);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 껍데기 표시 완료.');
}
