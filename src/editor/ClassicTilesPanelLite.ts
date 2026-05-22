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

  const scale = createScaleControls(options);

  const note = document.createElement('div');
  note.className = 'map-editor-empty';
  note.textContent = '패널 껍데기 + 탭 + 스케일 표시 완료';

  panel.append(header, tabs, scale, note);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 스케일 표시 완료.');
}

function createScaleControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-scale';

  const label = document.createElement('span');
  label.className = 'map-editor-scale-label';
  label.textContent = '스케일';

  const input = document.createElement('input');
  input.className = 'map-editor-scale-input';
  input.type = 'number';
  input.min = '0.1';
  input.max = '10';
  input.step = '0.1';
  input.value = String(options.state.brushScale);
  input.onchange = () => {
    options.state.setBrushScale(Number(input.value));
    options.status(`스케일 변경: ${input.value}`);
  };

  const suffix = document.createElement('span');
  suffix.className = 'map-editor-scale-suffix';
  suffix.textContent = 'x';

  container.append(
    label,
    createScaleButton('◀', () => {
      options.state.decreaseBrushScale();
      input.value = String(options.state.brushScale);
      options.status(`스케일 감소: ${input.value}`);
    }),
    input,
    suffix,
    createScaleButton('▶', () => {
      options.state.increaseBrushScale();
      input.value = String(options.state.brushScale);
      options.status(`스케일 증가: ${input.value}`);
    }),
  );
  return container;
}

function createScaleButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-editor-scale-button';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

function createTabButton(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = active ? 'map-editor-tab is-active' : 'map-editor-tab';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}
