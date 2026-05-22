import type { EditorState } from './EditorState';
import { TilesetPanel } from './TilesetPanel';
import { TilePickerWindow } from './TilePickerWindow';
import type { TilePlacementSystem } from './TilePlacementSystem';
import type { EditorTilesetAsset } from './types';

const DIRECT_SELECT_MAX_SIZE = 96;

type BridgeOptions = {
  state: EditorState;
  placement: TilePlacementSystem;
  status: (message: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
};

let mounted: { panel: TilesetPanel; picker: TilePickerWindow } | null = null;

export function mountClassicEditorPanelBridge(options: BridgeOptions): void {
  mounted?.panel.element.remove();
  mounted?.picker.element.remove();

  const picker = new TilePickerWindow({
    defaultGridSize: options.state.gridSize,
    onPick: (asset, sourceRect) => {
      options.state.setSourceRect(asset, sourceRect);
      options.status(`부분 선택됨: ${asset.name}`);
    },
  });

  const panel = new TilesetPanel(options.state, {
    onSave: options.onSave,
    onLoad: options.onLoad,
    onExport: options.onExport,
    onClear: options.onClear,
    onPickAsset: (asset) => {
      void pickAsset(asset, options.state, picker, options.status);
    },
    onFillAll: () => {
      void options.placement.fillAll({ width: 3000, height: 3000 });
    },
    onRandomFill: (chancePercent) => {
      void options.placement.fillRandom({ width: 3000, height: 3000, chancePercent });
    },
    onToggleWorldMap: () => options.status('월드맵은 다음 단계에서 지연 복구합니다.'),
    getMonsterSpawnRules: () => options.placement.mapDraft.worldMap?.monsterSpawnRules ?? [],
    setMonsterSpawnRules: () => options.status('몬스터 저장은 다음 단계에서 지연 복구합니다.'),
  });

  document.querySelector('.minimal-editor-panel')?.remove();
  panel.mount(document.body);
  picker.mount(document.body);
  mounted = { panel, picker };
  options.status('기존 Map Editor UI 복구 완료.');
}

async function pickAsset(
  asset: EditorTilesetAsset,
  state: EditorState,
  picker: TilePickerWindow,
  status: (message: string) => void,
): Promise<void> {
  state.selectAsset(asset);
  if (await shouldOpenPicker(asset)) {
    picker.open(asset);
    status(`타일셋 부분 선택 열기: ${asset.name}`);
  } else {
    status(`선택됨: ${asset.name}`);
  }
}

async function shouldOpenPicker(asset: EditorTilesetAsset): Promise<boolean> {
  if (asset.tileWidth && asset.tileHeight) return false;
  if (asset.solidColor !== undefined) return false;
  if (!asset.url || asset.url.startsWith('solid://')) return false;
  const size = await loadImageSize(asset.url);
  return Boolean(size && (size.width > DIRECT_SELECT_MAX_SIZE || size.height > DIRECT_SELECT_MAX_SIZE));
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
