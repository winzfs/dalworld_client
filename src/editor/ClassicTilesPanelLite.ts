import type { EditorState } from './EditorState';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorTilesetAsset, EditorTilesetCategory } from './types';

const BLACK_SOLID_ASSET_ID = 'editor-solid-black';

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

  const body = document.createElement('div');
  body.style.cssText = 'padding:12px;display:grid;gap:10px;font-size:12px;line-height:1.45;max-height:min(70vh,620px);overflow:auto;';

  const message = document.createElement('div');
  message.className = 'map-editor-empty';
  message.textContent = '기존 UI 형태 패널 준비 완료. 타일셋은 아래 버튼으로 따로 로드합니다.';

  body.append(message);
  panel.append(header, body);
  document.body.appendChild(panel);
  options.status('기존 UI 패널 표시 완료.');

  window.setTimeout(() => {
    body.append(createControls(options));
    options.status('기존 UI 기본 컨트롤 표시 완료.');
  }, 50);

  window.setTimeout(() => {
    body.append(createLoadTilesetsButton(options, body));
  }, 100);
}

function createControls(options: Options): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'display:grid;gap:8px;';

  const tabs = document.createElement('div');
  tabs.className = 'map-editor-tabs';
  tabs.append(
    button('Tiles', 'map-editor-tab is-active', () => undefined),
    button('Monsters', 'map-editor-tab', () => options.status('Monsters 탭은 다음 단계에서 복구합니다.')),
  );

  const scale = document.createElement('div');
  scale.className = 'map-editor-scale';
  scale.append(
    span('스케일', 'map-editor-scale-label'),
    button('◀', 'map-editor-scale-button', () => options.state.decreaseBrushScale()),
    input(String(options.state.brushScale), 'map-editor-scale-input', (value) => options.state.setBrushScale(Number(value))),
    span('x', 'map-editor-scale-suffix'),
    button('▶', 'map-editor-scale-button', () => options.state.increaseBrushScale()),
  );

  const grid = document.createElement('div');
  grid.className = 'map-editor-grid-controls';
  grid.append(
    button('Grid', 'map-editor-grid-button is-active', () => options.state.toggleGridVisible()),
    button('16', 'map-editor-grid-button', () => options.state.setGridSize(16)),
    button('32', 'map-editor-grid-button is-active', () => options.state.setGridSize(32)),
    button('64', 'map-editor-grid-button', () => options.state.setGridSize(64)),
  );

  const layers = document.createElement('div');
  layers.className = 'map-editor-layers';
  layers.append(
    span('레이어', 'map-editor-layer-label'),
    button('Ground', 'map-editor-layer is-active', () => options.state.setLayer('ground')),
    button('Object', 'map-editor-layer', () => options.state.setLayer('object')),
    button('Block', 'map-editor-layer is-collision', () => options.state.setLayer('collision')),
  );

  const tools = document.createElement('div');
  tools.className = 'map-editor-tools';
  tools.append(
    button('배치', 'map-editor-tool is-active', () => options.state.setMode('paint')),
    button('피커', 'map-editor-tool', () => options.state.setMode('picker')),
    button('삭제', 'map-editor-tool', () => options.state.setMode('erase')),
    button('Black', 'map-editor-action map-editor-black-brush', () => {
      options.state.selectAsset({
        id: BLACK_SOLID_ASSET_ID,
        name: 'Black',
        categoryId: 'editor',
        url: 'solid://black',
        solidColor: 0x000000,
      });
    }),
    button('검정투명', 'map-editor-action map-editor-transparent-black', () => options.state.toggleTransparentBlack()),
  );

  const actions = document.createElement('div');
  actions.className = 'map-editor-actions';
  actions.append(
    button('저장', 'map-editor-action', options.onSave),
    button('불러오기', 'map-editor-action', options.onLoad),
    button('JSON', 'map-editor-action', options.onExport),
    button('전체삭제', 'map-editor-action danger', options.onClear),
  );

  root.append(tabs, scale, grid, layers, tools, actions);
  return root;
}

function createLoadTilesetsButton(options: Options, body: HTMLElement): HTMLElement {
  return button('타일셋 목록 로드', 'map-editor-action', () => {
    void loadTilesets(options, body);
  });
}

async function loadTilesets(options: Options, body: HTMLElement): Promise<void> {
  let container = body.querySelector('.staged-tilesets') as HTMLElement | null;
  if (!container) {
    container = document.createElement('div');
    container.className = 'staged-tilesets';
    container.style.cssText = 'display:grid;gap:8px;';
    body.appendChild(container);
  }
  container.textContent = '타일셋 목록 로딩 중...';

  try {
    options.status('tilesetManifest import started by explicit button...');
    const { TILESET_CATEGORIES } = await import('./tilesetManifest');
    container.replaceChildren(renderTilesets(TILESET_CATEGORIES, options));
    options.status(`타일셋 목록 로딩 완료. categories=${TILESET_CATEGORIES.length}`);
  } catch (error) {
    const message = `타일셋 목록 로딩 실패: ${formatErrorMessage(error)}`;
    container.textContent = message;
    options.status(message);
  }
}

function renderTilesets(categories: EditorTilesetCategory[], options: Options): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'display:grid;gap:8px;';

  const categoriesEl = document.createElement('div');
  categoriesEl.className = 'map-editor-categories';
  const assetsEl = document.createElement('div');
  assetsEl.className = 'map-editor-assets';

  const showCategory = (category: EditorTilesetCategory) => {
    assetsEl.replaceChildren();
    for (const asset of category.assets) {
      assetsEl.appendChild(button(asset.name, 'map-editor-asset', () => selectAsset(asset, options)));
    }
  };

  for (const category of categories.filter((item) => item.id !== 'monsters')) {
    categoriesEl.appendChild(button(category.name, 'map-editor-category', () => showCategory(category)));
  }

  const first = categories.find((item) => item.id !== 'monsters');
  if (first) showCategory(first);
  root.append(categoriesEl, assetsEl);
  return root;
}

function selectAsset(asset: EditorTilesetAsset, options: Options): void {
  options.state.selectAsset(asset);
  options.status(`선택됨: ${asset.name}`);
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.onclick = onClick;
  return el;
}

function input(value: string, className: string, onChange: (value: string) => void): HTMLInputElement {
  const el = document.createElement('input');
  el.className = className;
  el.value = value;
  el.onchange = () => onChange(el.value);
  return el;
}

function span(text: string, className: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
