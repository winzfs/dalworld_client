import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';

const GRID_SIZES = [16, 32, 64] as const;

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
  const grid = createGridControls(options);

  const note = document.createElement('div');
  note.className = 'map-editor-empty';
  note.textContent = '패널 껍데기 + 탭 + 스케일 + Grid 표시 완료';

  panel.append(header, tabs, scale, grid, note);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 Grid 표시 완료.');
}

function createGridControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-grid-controls';

  const gridToggle = createGridButton('Grid', () => {
    options.state.toggleGridVisible();
    options.status(`Grid 표시: ${options.state.gridVisible ? 'on' : 'off'}`);
  });
  if (options.state.gridVisible) gridToggle.classList.add('is-active');
  container.appendChild(gridToggle);

  for (const size of GRID_SIZES) {
    const button = createGridButton(String(size), () => {
      options.state.setGridSize(size);
      options.status(`Grid 크기: ${size}`);
    });
    if (options.state.gridSize === size) button.classList.add('is-active');
    container.appendChild(button);
  }

  return container;
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

function createGridButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-editor-grid-button';
  button.textContent = label;
  button.onclick = onClick;
  return button;
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
