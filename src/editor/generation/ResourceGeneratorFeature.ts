import type { EditorMapDraft, EditorTilePlacement, EditorTilesetAsset } from '../types';
import { generateResourcePlacements, type EditorResourceGenerationRule } from './ResourceGenerator';
import { ResourceGeneratorPanel } from './ResourceGeneratorPanel';

type MapEditorLike = {
  state?: any;
  placement?: any;
};

export function installResourceGeneratorFeature(editor: MapEditorLike, root: HTMLElement = document.body): void {
  if ((editor as any).__resourceGeneratorInstalled) return;
  (editor as any).__resourceGeneratorInstalled = true;
  const mapName = 'dalworld-map';
  let panel: ResourceGeneratorPanel | null = null;
  const button = createButton();

  const ensurePanel = () => {
    if (panel) return panel;
    panel = new ResourceGeneratorPanel({
      mapName,
      getCurrentAsset: () => getCurrentAsset(editor),
      getRules: () => loadRules(mapName),
      onSaveRules: (rules) => saveRules(mapName, rules),
      onGenerate: () => { void generateResources(editor, mapName); },
    });
    panel.mount(root);
    return panel;
  };

  button.addEventListener('pointerdown', stopEvent);
  button.addEventListener('click', (event) => { stopEvent(event); ensurePanel().open(); });
  root.appendChild(button);
}

async function generateResources(editor: MapEditorLike, mapName: string): Promise<void> {
  const rules = loadRules(mapName).filter((rule) => rule.enabled && rule.amount > 0);
  const currentDraft = editor.placement?.mapDraft as EditorMapDraft | undefined;
  if (!currentDraft || rules.length === 0) {
    notify(editor, '자원생성 실패 · 등록된 자원 또는 맵이 없습니다.', 'error', 3000);
    return;
  }
  if (!window.confirm(`현재 셀의 기존 resource object를 교체하고 자원을 자동 배치할까요? 등록 자원 ${rules.length}개를 사용합니다.`)) return;
  notify(editor, '자원 생성 중...', 'info', 0);
  try {
    const gridSize = normalizeGridSize(editor.state?.gridSize ?? currentDraft.tileSize ?? 32);
    const generated = generateResourcePlacements({ rules, placements: currentDraft.placements, gridSize, seed: readSeed(mapName) });
    const keptPlacements = currentDraft.placements.filter((placement) => !isResourcePlacement(placement));
    await editor.placement.replaceDraft({ ...currentDraft, tileSize: gridSize, placements: [...keptPlacements, ...generated] });
    (editor as any).persistCurrentCellDraft?.();
    notify(editor, `자원 생성 완료 · ${generated.length}개 배치`, 'success', 3500);
  } catch (error) {
    console.warn('[ResourceGenerator] generation failed.', error);
    notify(editor, `자원 생성 실패 · ${formatError(error)}`, 'error', 5000);
  }
}

function getCurrentAsset(editor: MapEditorLike): { asset: EditorTilesetAsset; sourceRect?: any } | null {
  const state = editor.state;
  const brush = state?.selectedBrush;
  const asset = brush?.asset ?? state?.selectedAsset ?? null;
  if (!asset || asset.solidColor !== undefined || String(asset.url).startsWith('solid://')) return null;
  return { asset, sourceRect: brush?.sourceRect ? { ...brush.sourceRect } : undefined };
}

function isResourcePlacement(placement: EditorTilePlacement): boolean {
  return placement.layer === 'object' && placement.gameplay?.kind === 'resource';
}

function loadRules(mapName: string): EditorResourceGenerationRule[] {
  const rules = readJson<EditorResourceGenerationRule[]>(rulesKey(mapName)) ?? [];
  return Array.isArray(rules) ? rules.filter((rule) => rule?.asset?.id && rule?.asset?.url) : [];
}

function saveRules(mapName: string, rules: EditorResourceGenerationRule[]): void {
  writeJson(rulesKey(mapName), rules);
  writeJson(rulesKey('dalworld-map'), rules);
}

function createButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '자원생성';
  button.className = 'map-editor-top-mode-button resource-mode-button';
  button.style.cssText = 'position:fixed;top:14px;left:calc(50% + 116px);transform:translateX(-50%);z-index:10003;border:1px solid rgba(74,222,128,.48);border-radius:999px;background:rgba(22,163,74,.24);color:#f8fafc;padding:9px 16px;font-weight:900;box-shadow:0 10px 32px rgba(0,0,0,.32);cursor:pointer;';
  return button;
}

function notify(editor: MapEditorLike, message: string, kind: 'info' | 'success' | 'error', durationMs?: number): void {
  (editor as any).showToast?.(message, kind, durationMs);
  (editor as any).report?.(message);
}

function rulesKey(mapName: string): string { return `dalworld:editor-resource-rules:${mapName}`; }
function readSeed(mapName: string): number { return normalizeSeed(Number(window.localStorage.getItem(`dalworld:editor-terrain-seed:${mapName}`) ?? '1')); }
function readJson<T>(key: string): T | null { try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; } }
function writeJson(key: string, value: unknown): void { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function stopEvent(event: Event): void { event.preventDefault(); event.stopPropagation(); }
function normalizeGridSize(value: number): number { return !Number.isFinite(value) || value <= 0 ? 32 : Math.max(1, Math.round(value)); }
function normalizeSeed(value: number): number { return !Number.isFinite(value) ? 1 : Math.max(0, Math.min(999999999, Math.round(value))); }
function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
