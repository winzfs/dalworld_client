import { loadEditorItemOverrides } from './ItemEditorStorage';
import type { EditorItemOverride, EditorMonsterSpawnRule } from './types';
import { uploadItemOverrides, uploadMonsterSpawnRules } from '../worldMap/uploadWorldMap';
import type { WorldMapItemOverride, WorldMapMonsterSpawnRule } from '../worldMap/types';

export type EditorSaveNoticeKind = 'info' | 'success' | 'error';

export function installMonsterTabSaveInterceptor(options: {
  panel: HTMLElement;
  getRules: () => EditorMonsterSpawnRule[];
  notify: (message: string, kind: EditorSaveNoticeKind, durationMs?: number) => void;
}): void {
  options.panel.addEventListener('click', (event) => {
    const button = (event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null);
    if (!button || button.textContent?.trim() !== '저장') return;
    if (!isMonsterTabActive(options.panel)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    void saveMonsterTab(options);
  }, { capture: true });
}

export async function saveMonsterTabToServer(rules: EditorMonsterSpawnRule[]): Promise<number> {
  const payload: WorldMapMonsterSpawnRule[] = rules.map((rule) => ({
    id: rule.id,
    enabled: rule.enabled,
    monsterType: rule.monsterType,
    scope: rule.scope,
    maxAlive: rule.maxAlive,
    spawnsPerMinute: rule.spawnsPerMinute,
    spawnsPerHour: rule.spawnsPerHour,
    spec: rule.spec ? { ...rule.spec } : undefined,
  }));
  await uploadMonsterSpawnRules(payload);
  return payload.length;
}

export async function saveItemTabToServer(): Promise<number> {
  const payload: WorldMapItemOverride[] = loadEditorItemOverrides().map((override: EditorItemOverride) => ({
    id: override.id,
    label: override.label,
    description: override.description,
    icon: override.icon,
    category: override.category,
    stackable: override.stackable,
    maxStack: override.maxStack,
    fields: override.fields ? { ...override.fields } : undefined,
  }));
  await uploadItemOverrides(payload);
  return payload.length;
}

async function saveMonsterTab(options: {
  getRules: () => EditorMonsterSpawnRule[];
  notify: (message: string, kind: EditorSaveNoticeKind, durationMs?: number) => void;
}): Promise<void> {
  options.notify('몬스터 저장 중... 서버에 바로 반영하고 있습니다.', 'info', 0);

  try {
    const count = await saveMonsterTabToServer(options.getRules());
    options.notify(`몬스터 저장 완료 · 전체맵 스폰 규칙 ${count}개 서버 반영`, 'success', 3500);
  } catch (error) {
    console.error('[MapEditor] Monster tab save failed.', error);
    options.notify('몬스터 저장 실패 · 서버에는 아직 반영되지 않았습니다.', 'error', 5000);
  }
}

function isMonsterTabActive(panel: HTMLElement): boolean {
  const active = panel.querySelector<HTMLElement>('.map-editor-tab.is-active');
  return active?.textContent?.trim() === 'Monsters';
}
