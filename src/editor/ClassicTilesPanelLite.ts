import type { EditorLayerId, EditorToolMode, EditorTilesetAsset } from './types';
import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';

const GRID_SIZES = [16, 32, 64] as const;
const BLACK_SOLID_ASSET_ID = 'editor-solid-black';
const DEFAULT_WORLD_SIZE = 3000;
const DEFAULT_RANDOM_CHANCE = 30;
const DEFAULT_FALLBACK_ASSET: EditorTilesetAsset = {
  id: 'fallback.grass',
  name: 'grass',
  categoryId: 'fallback',
  url: '',
  tileWidth: 32,
  tileHeight: 32,
  solidColor: 0x527a3a,
};
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
  const fill = createFillControls(options);
  const actions = createActionControls(options);

  const note = document.createElement('div');
  note.className = 'map-editor-empty';
  note.textContent = '패널 껍데기 + 탭 + 스케일 + Grid + 레이어 + 도구 + 월드맵 + Fill + Actions 표시 완료';

  panel.append(header, tabs, scale, grid, layers, tools, fill, actions, note);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 Actions 표시 완료.');
}

function createActionControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-actions';
  container.append(
    createActionButton('저장', () => {
      options.status('저장 실행 중...');
      options.onSave();
    }),
    createActionButton('불러오기', () => {
      options.status('불러오기 실행 중...');
      options.onLoad();
    }),
    createActionButton('JSON', () => {
      options.status('JSON export 실행 중...');
      options.onExport();
    }),
    createActionButton('전체삭제', () => {
      if (!window.confirm('현재 맵 배치를 모두 삭제할까요?')) return;
      options.onClear();
      options.status('전체삭제 완료.');
    }, 'danger'),
  );
  return container;
}

function createFillControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-fill';
  let randomChancePercent = DEFAULT_RANDOM_CHANCE;

  const fillButton = document.createElement('button');
  fillButton.type = 'button';
  fillButton.className = 'map-editor-action';
  fillButton.textContent = '전체 Fill';
  fillButton.onclick = () => {
    if (!window.confirm('현재 선택한 타일로 맵 전체를 채울까요?')) return;
    void options.placement.fillAll({ width: DEFAULT_WORLD_SIZE, height: DEFAULT_WORLD_SIZE })
      .then(() => options.status('전체 Fill 완료.'))
      .catch((error: unknown) => options.status(`전체 Fill 실패: ${formatErrorMessage(error)}`));
  };

  const chanceInput = document.createElement('input');
  chanceInput.className = 'map-editor-percent-input';
  chanceInput.type = 'number';
  chanceInput.min = '0';
  chanceInput.max = '100';
  chanceInput.step = '1';
  chanceInput.value = String(randomChancePercent);
  chanceInput.onchange = () => {
    randomChancePercent = clampPercent(Number(chanceInput.value));
    chanceInput.value = String(randomChancePercent);
    options.status(`랜덤 Fill 확률: ${randomChancePercent}%`);
  };

  const percent = document.createElement('span');
  percent.className = 'map-editor-percent-suffix';
  percent.textContent = '%';

  const randomButton = document.createElement('button');
  randomButton.type = 'button';
  randomButton.className = 'map-editor-action';
  randomButton.textContent = '랜덤 Fill';
  randomButton.onclick = () => {
    if (!window.confirm(`${randomChancePercent}% 확률로 맵 전체에 랜덤 배치할까요?`)) return;
    void options.placement.fillRandom({
      width: DEFAULT_WORLD_SIZE,
      height: DEFAULT_WORLD_SIZE,
      chancePercent: randomChancePercent,
    }).then(() => options.status(`랜덤 Fill 완료. chance=${randomChancePercent}%`))
      .catch((error: unknown) => options.status(`랜덤 Fill 실패: ${formatErrorMessage(error)}`));
  };

  container.append(fillButton, chanceInput, percent, randomButton);
  return container;
}

function createToolControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-tools';

  const sync = () => {
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLButtonElement)) continue;
      if (child.dataset.role === 'transparentBlack') {
        child.classList.toggle('is-active', options.state.transparentBlack);
      } else if (child.dataset.role === 'black') {
        child.classList.toggle('is-active', options.state.selectedAsset?.id === BLACK_SOLID_ASSET_ID);
      } else {
        child.classList.toggle('is-active', child.dataset.mode === options.state.mode);
      }
    }
  };

  for (const item of TOOL_MODES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-editor-tool';
    button.dataset.mode = item.mode;
    button.textContent = item.label;
    button.onclick = () => {
      options.state.setMode(item.mode);
      sync();
      options.status(`도구 변경: ${item.label} / 현재 mode=${options.state.mode}`);
    };
    container.appendChild(button);
  }

  const blackButton = document.createElement('button');
  blackButton.type = 'button';
  blackButton.className = 'map-editor-action map-editor-black-brush';
  blackButton.dataset.role = 'black';
  blackButton.textContent = 'Black';
  blackButton.onclick = () => {
    if (options.state.selectedAsset?.id === BLACK_SOLID_ASSET_ID) {
      options.state.setBrush({ asset: { ...DEFAULT_FALLBACK_ASSET, tileWidth: options.state.gridSize, tileHeight: options.state.gridSize } });
      options.state.setMode('paint');
      sync();
      options.status('Black 브러시 해제. 기본 잔디 브러시로 복귀.');
      return;
    }

    const blackAsset: EditorTilesetAsset = {
      id: BLACK_SOLID_ASSET_ID,
      name: 'Black',
      categoryId: 'editor',
      url: 'solid://black',
      solidColor: 0x000000,
      tileWidth: options.state.gridSize,
      tileHeight: options.state.gridSize,
    };
    options.state.setLayer('ground');
    options.state.setMode('paint');
    options.state.setBrush({ asset: blackAsset });
    sync();
    options.status('Black 브러시 선택됨. 다시 누르면 기본 브러시로 복귀합니다.');
  };
  container.appendChild(blackButton);

  const transparentBlackButton = document.createElement('button');
  transparentBlackButton.type = 'button';
  transparentBlackButton.className = 'map-editor-action map-editor-transparent-black';
  transparentBlackButton.dataset.role = 'transparentBlack';
  transparentBlackButton.textContent = '검정투명';
  transparentBlackButton.onclick = () => {
    options.state.toggleTransparentBlack();
    sync();
    options.status(`검정투명: ${options.state.transparentBlack ? 'on' : 'off'}`);
  };
  container.appendChild(transparentBlackButton);

  const worldMapButton = document.createElement('button');
  worldMapButton.type = 'button';
  worldMapButton.className = 'map-editor-action';
  worldMapButton.dataset.role = 'worldMap';
  worldMapButton.textContent = '월드맵';
  worldMapButton.onclick = () => {
    options.onToggleWorldMap?.();
    options.status('월드맵 버튼 클릭됨. 월드맵 패널은 다음 단계에서 안전하게 복구합니다.');
  };
  container.appendChild(worldMapButton);

  sync();
  return container;
}

function createLayerControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-layers';

  const label = document.createElement('span');
  label.className = 'map-editor-layer-label';
  label.textContent = '레이어';
  container.appendChild(label);

  const sync = () => {
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLButtonElement)) continue;
      child.classList.toggle('is-active', child.dataset.layer === options.state.activeLayer);
    }
  };

  for (const layer of LAYERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `map-editor-layer${layer.extraClass ? ` ${layer.extraClass}` : ''}`;
    button.dataset.layer = layer.id;
    button.textContent = layer.label;
    button.onclick = () => {
      options.state.setLayer(layer.id);
      sync();
      options.status(`레이어 변경: ${layer.label} / 현재 layer=${options.state.activeLayer}`);
    };
    container.appendChild(button);
  }
  sync();
  return container;
}

function createGridControls(options: Options): HTMLElement {
  const container = document.createElement('div');
  container.className = 'map-editor-grid-controls';

  const sync = () => {
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLButtonElement)) continue;
      if (child.dataset.role === 'visible') {
        child.classList.toggle('is-active', options.state.gridVisible);
      } else {
        child.classList.toggle('is-active', Number(child.dataset.size) === options.state.gridSize);
      }
    }
  };

  const gridToggle = createGridButton('Grid', () => {
    options.state.toggleGridVisible();
    sync();
    options.status(`Grid 표시: ${options.state.gridVisible ? 'on' : 'off'}`);
  });
  gridToggle.dataset.role = 'visible';
  container.appendChild(gridToggle);

  for (const size of GRID_SIZES) {
    const button = createGridButton(String(size), () => {
      options.state.setGridSize(size);
      sync();
      options.status(`Grid 크기: ${options.state.gridSize}`);
    });
    button.dataset.size = String(size);
    container.appendChild(button);
  }

  sync();
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
    input.value = String(options.state.brushScale);
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

function createActionButton(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `map-editor-action${extraClass ? ` ${extraClass}` : ''}`;
  button.textContent = label;
  button.onclick = onClick;
  return button;
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RANDOM_CHANCE;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
