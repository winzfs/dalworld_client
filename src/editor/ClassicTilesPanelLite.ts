import type { EditorLayerId, EditorToolMode } from './types';
import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';

const GRID_SIZES = [16, 32, 64] as const;
const LAYERS: Array<{ id: EditorLayerId; label: string; extraClass?: string }> = [
  { id: 'ground', label: 'Ground' },
  { id: 'object', label: 'Object' },
  { id: 'collision', label: 'Block', extraClass: 'is-collision' },
];
const TOOL_MODES: Array<{ mode: EditorToolMode; label: string }> = [
  { mode: 'paint', label: '배치' },
  { mode: 'picker', label: '피커' },
  { mode: 'erase', label: '삭제' },
];

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
  const layers = createLayerControls(options);
  const tools = createToolControls(options);

  const note = document.createElement('div');
  note.className = 'map-editor-empty';
  note.textContent = '패널 껍데기 + 탭 + 스케일 + Grid + 레이어 + 도구 표시 완료';

  panel.append(header, tabs, scale, grid, layers, tools, note);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 도구 표시 완료.');
}

function createToolControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-tools';

  for (const item of TOOL_MODES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-editor-tool';
    if (options.state.mode === item.mode) button.classList.add('is-active');
    button.textContent = item.label;
    button.onclick = () => {
      options.state.setMode(item.mode);
      options.status(`도구 변경: ${item.label}`);
    };
    container.appendChild(button);
  }

  return container;
}

function createLayerControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-layers';

  const label = document.createElement('span');
  label.className = 'map-editor-layer-label';
  label.textContent = '레이어';
  container.appendChild(label);

  for (const layer of LAYERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `map-editor-layer${layer.extraClass ? ` ${layer.extraClass}` : ''}`;
    if (options.state.activeLayer === layer.id) button.classList.add('is-active');
    button.textContent = layer.label;
    button.onclick = () => {
      options.state.setLayer(layer.id);
      options.status(`레이어 변경: ${layer.label}`);
    };
    container.appendChild(button);
  }

  return container;
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
