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
  options.status('기존 UI 패널 열기 클릭 확인 완료. 패널 본문은 모바일 멈춤 원인 분리를 위해 임시 비활성화됨.');
}
