import type { EditorState } from './EditorState';
import type { EditorSourceRect, EditorTilesetAsset, EditorTilesetCategory } from './types';

export type MinimalTilesetPanelOptions = {
  categories: EditorTilesetCategory[];
  state: EditorState;
  selected: HTMLElement;
  container: HTMLElement;
  status: (message: string) => void;
};

type TilePickerWindowInstance = {
  readonly element: HTMLDivElement;
  mount(parent: HTMLElement): void;
  open(asset: EditorTilesetAsset): void;
};

let sharedTilePickerWindow: TilePickerWindowInstance | null = null;

export function renderMinimalTilesetPanel(options: MinimalTilesetPanelOptions): void {
  const { categories } = options;
  options.container.replaceChildren();

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = '타일셋 검색...';
  searchInput.autocomplete = 'off';
  searchInput.style.cssText = fieldStyle();

  const resultSummary = document.createElement('div');
  resultSummary.style.cssText = 'color:rgba(255,255,255,.62);font-size:11px;';

  const list = document.createElement('div');
  list.style.cssText = 'display:grid;gap:8px;';

  const assetCards = new Map<string, HTMLElement>();

  const updateAssetSelection = () => {
    const selectedAssetId = options.state.selectedBrush?.asset.id ?? '';
    for (const [assetId, card] of assetCards) {
      setCardPressed(card, assetId === selectedAssetId);
    }
  };

  const render = () => {
    assetCards.clear();
    list.replaceChildren();

    const query = normalizeSearchQuery(searchInput.value);
    let visibleCategoryCount = 0;
    let visibleAssetCount = 0;

    for (const category of categories) {
      const visibleAssets = category.assets.filter((asset) => matchesAssetSearch(category, asset, query));
      if (visibleAssets.length === 0) continue;

      visibleCategoryCount += 1;
      visibleAssetCount += visibleAssets.length;

      const details = document.createElement('details');
      details.open = query.length > 0 || visibleCategoryCount <= 1;
      details.style.cssText = 'border-top:1px solid rgba(255,255,255,.1);padding-top:6px;';

      const summary = document.createElement('summary');
      summary.textContent = `${category.name} (${visibleAssets.length})`;
      summary.style.cssText = 'cursor:pointer;color:#ffe4a3;font-weight:700;padding:4px 0;';

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr;gap:8px;margin-top:6px;';

      for (const asset of visibleAssets) {
        const card = createAssetCard(asset, category, options);
        assetCards.set(asset.id, card);
        grid.appendChild(card);
      }

      details.append(summary, grid);
      list.appendChild(details);
    }

    resultSummary.textContent = query
      ? `검색 결과: 카테고리 ${visibleCategoryCount}개 / 에셋 ${visibleAssetCount}개`
      : `전체: 카테고리 ${categories.length}개 / 에셋 ${categories.reduce((sum, item) => sum + item.assets.length, 0)}개`;

    if (visibleAssetCount === 0) {
      const empty = document.createElement('div');
      empty.textContent = '검색 결과가 없습니다.';
      empty.style.cssText = 'padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.7);';
      list.appendChild(empty);
    }

    updateAssetSelection();
  };

  searchInput.addEventListener('input', render);
  options.state.subscribe(updateAssetSelection);

  options.container.append(searchInput, resultSummary, list);
  render();
}

function createAssetCard(asset: EditorTilesetAsset, category: EditorTilesetCategory, options: MinimalTilesetPanelOptions): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'display:grid',
    'grid-template-columns:56px 1fr',
    'gap:8px',
    'align-items:center',
    'padding:8px',
    'border:1px solid rgba(255,255,255,.12)',
    'border-radius:12px',
    'background:rgba(0,0,0,.18)',
  ].join(';');

  const preview = createAssetPreview(asset);

  const content = document.createElement('div');
  content.style.cssText = 'display:grid;gap:6px;min-width:0;';

  const title = document.createElement('div');
  title.textContent = asset.name;
  title.style.cssText = 'color:#fff;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  const meta = document.createElement('div');
  meta.textContent = `${category.name} · ${asset.tileWidth ?? '?'}x${asset.tileHeight ?? '?'}`;
  meta.style.cssText = 'color:rgba(255,255,255,.55);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  const buttons = createButtonGrid(2);
  const selectButton = createPanelButton('선택', () => {
    options.state.selectAsset(asset);
    options.selected.textContent = `선택: ${category.name} / ${asset.name}`;
    options.status(`선택됨: ${asset.name}`);
  });
  const pickButton = createPanelButton('부분 선택', () => {
    void openTilePickerForAsset(asset, options.state, options.status);
  });
  pickButton.disabled = !canOpenTilePicker(asset);
  pickButton.title = pickButton.disabled ? '이미지 URL이 있는 타일셋만 부분 선택할 수 있습니다.' : '큰 타일셋 이미지에서 영역을 선택합니다.';

  buttons.append(selectButton, pickButton);
  content.append(title, meta, buttons);
  card.append(preview, content);
  return card;
}

function createAssetPreview(asset: EditorTilesetAsset): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'width:56px',
    'height:56px',
    'border:1px solid rgba(255,255,255,.12)',
    'border-radius:10px',
    'background:rgba(0,0,0,.32)',
    'display:grid',
    'place-items:center',
    'overflow:hidden',
  ].join(';');

  if (asset.solidColor !== undefined) {
    const swatch = document.createElement('div');
    swatch.style.cssText = `width:36px;height:36px;border-radius:8px;background:#${asset.solidColor.toString(16).padStart(6, '0')};border:1px solid rgba(255,255,255,.2);`;
    wrap.appendChild(swatch);
    return wrap;
  }

  if (!asset.url) {
    wrap.textContent = 'no img';
    wrap.style.color = 'rgba(255,255,255,.45)';
    wrap.style.fontSize = '10px';
    return wrap;
  }

  const image = document.createElement('img');
  image.src = asset.url;
  image.alt = asset.name;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.draggable = false;
  image.style.cssText = [
    'max-width:100%',
    'max-height:100%',
    'object-fit:contain',
    'image-rendering:pixelated',
    'image-rendering:crisp-edges',
  ].join(';');
  image.onerror = () => {
    wrap.textContent = 'load fail';
    wrap.style.color = 'rgba(255,255,255,.45)';
    wrap.style.fontSize = '10px';
  };
  wrap.appendChild(image);
  return wrap;
}

async function openTilePickerForAsset(asset: EditorTilesetAsset, state: EditorState, status: (message: string) => void): Promise<void> {
  if (!canOpenTilePicker(asset)) {
    status('부분 선택은 이미지 URL이 있는 타일셋에서만 가능합니다.');
    return;
  }

  try {
    status('TilePickerWindow import started...');
    const { TilePickerWindow } = await import('./TilePickerWindow');
    if (!sharedTilePickerWindow) {
      sharedTilePickerWindow = new TilePickerWindow({
        defaultGridSize: state.gridSize,
        onPick: (pickedAsset: EditorTilesetAsset, sourceRect: EditorSourceRect) => {
          state.setSourceRect(pickedAsset, sourceRect);
          status(`부분 선택됨: ${pickedAsset.name} rect=${sourceRect.x},${sourceRect.y},${sourceRect.width},${sourceRect.height}`);
        },
      });
      sharedTilePickerWindow.mount(document.body);
    }
    status(`TilePickerWindow open: ${asset.name}`);
    sharedTilePickerWindow.open(asset);
  } catch (error) {
    const message = `부분 선택 창 로딩 실패: ${formatErrorMessage(error)}`;
    status(message);
    console.warn('[MinimalTilesetPanel] Tile picker load failed.', error);
  }
}

function canOpenTilePicker(asset: EditorTilesetAsset): boolean {
  return !asset.solidColor && Boolean(asset.url) && !asset.url.startsWith('solid://');
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAssetSearch(category: EditorTilesetCategory, asset: EditorTilesetAsset, query: string): boolean {
  if (!query) return true;
  return (
    category.name.toLowerCase().includes(query) ||
    category.id.toLowerCase().includes(query) ||
    asset.name.toLowerCase().includes(query) ||
    asset.id.toLowerCase().includes(query) ||
    asset.categoryId.toLowerCase().includes(query)
  );
}

function createButtonGrid(columns: number): HTMLDivElement {
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:8px;`;
  return grid;
}

function createPanelButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-editor-action';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

function setCardPressed(card: HTMLElement, pressed: boolean): void {
  card.style.outline = pressed ? '2px solid rgba(85,214,190,.8)' : '';
  card.style.background = pressed ? 'rgba(85,214,190,.16)' : 'rgba(0,0,0,.18)';
}

function fieldStyle(): string {
  return [
    'width:100%',
    'box-sizing:border-box',
    'padding:9px 10px',
    'border:1px solid rgba(255,255,255,.16)',
    'border-radius:10px',
    'background:rgba(0,0,0,.28)',
    'color:#fff',
    'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'outline:none',
  ].join(';');
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
