import type { EditorMonsterType, EditorPlacementGameplay } from './types';
import type { EditorState } from './EditorState';

const MONSTER_OPTIONS: Array<{ id: EditorMonsterType; label: string }> = [
  { id: 'wild_slime', label: 'Wild Slime' },
  { id: 'sheep', label: 'Sheep' },
];

const DEFAULT_SPAWN: Extract<EditorPlacementGameplay, { kind: 'monsterSpawn' }> = {
  kind: 'monsterSpawn',
  monsterType: 'wild_slime',
  spawnRadius: 160,
  maxAlive: 3,
  respawnMs: 30_000,
};

export class MonsterSpawnControls {
  readonly element = document.createElement('div');

  constructor(private readonly state: EditorState) {
    this.element.className = 'map-editor-monster-controls';
  }

  render(): void {
    this.element.innerHTML = '';

    const current = getSelectedSpawn(this.state);
    if (!current) {
      this.element.hidden = true;
      return;
    }

    this.element.hidden = false;
    const title = document.createElement('div');
    title.className = 'map-editor-section-title';
    title.textContent = '몬스터 스폰 설정';

    this.element.append(
      title,
      this.createMonsterSelect(current),
      this.createNumberInput('반경', current.spawnRadius, 16, 2000, 10, (value) => {
        this.update({ spawnRadius: value });
      }),
      this.createNumberInput('최대 수', current.maxAlive, 1, 50, 1, (value) => {
        this.update({ maxAlive: Math.round(value) });
      }),
      this.createNumberInput('리스폰(ms)', current.respawnMs, 1000, 3600000, 1000, (value) => {
        this.update({ respawnMs: value });
      }),
      this.createSpecInput('HP', current.spec?.maxHp, 'maxHp'),
      this.createSpecInput('이동속도', current.spec?.moveSpeed, 'moveSpeed'),
      this.createSpecInput('감지범위', current.spec?.detectRange, 'detectRange'),
      this.createSpecInput('추적해제', current.spec?.loseRange, 'loseRange'),
      this.createSpecInput('공격범위', current.spec?.attackRange, 'attackRange'),
      this.createSpecInput('공격력', current.spec?.attackDamage, 'attackDamage'),
      this.createSpecInput('공격쿨(ms)', current.spec?.attackCooldownMs, 'attackCooldownMs'),
    );
  }

  private createMonsterSelect(current: Extract<EditorPlacementGameplay, { kind: 'monsterSpawn' }>): HTMLElement {
    const row = document.createElement('label');
    row.className = 'map-editor-field';

    const label = document.createElement('span');
    label.textContent = '종류';

    const select = document.createElement('select');
    select.value = current.monsterType;
    for (const option of MONSTER_OPTIONS) {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      select.appendChild(item);
    }
    select.onchange = () => this.update({ monsterType: select.value as EditorMonsterType });

    row.append(label, select);
    return row;
  }

  private createNumberInput(
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'map-editor-field';

    const label = document.createElement('span');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.onchange = () => onChange(clampNumber(Number(input.value), min, max, value));

    row.append(label, input);
    return row;
  }

  private createSpecInput(
    labelText: string,
    value: number | undefined,
    key: keyof NonNullable<Extract<EditorPlacementGameplay, { kind: 'monsterSpawn' }>['spec']>,
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'map-editor-field';

    const label = document.createElement('span');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.placeholder = '기본값';
    input.value = value === undefined ? '' : String(value);
    input.onchange = () => {
      const raw = input.value.trim();
      const current = getSelectedSpawn(this.state);
      if (!current) return;

      const nextSpec = { ...(current.spec ?? {}) };
      if (!raw) {
        delete nextSpec[key];
      } else {
        nextSpec[key] = Math.max(1, Math.round(Number(raw) || 1));
      }
      this.update({ spec: Object.keys(nextSpec).length > 0 ? nextSpec : undefined });
    };

    row.append(label, input);
    return row;
  }

  private update(patch: Partial<Extract<EditorPlacementGameplay, { kind: 'monsterSpawn' }>>): void {
    const current = getSelectedSpawn(this.state);
    const brush = this.state.selectedBrush;
    if (!current || !brush) return;

    brush.asset.gameplayDefaults = {
      ...current,
      ...patch,
      spec: patch.spec !== undefined ? patch.spec : current.spec,
    };
    this.render();
  }
}

function getSelectedSpawn(state: EditorState): Extract<EditorPlacementGameplay, { kind: 'monsterSpawn' }> | null {
  const gameplay = state.selectedBrush?.asset.gameplayDefaults;
  if (gameplay?.kind !== 'monsterSpawn') return null;
  return {
    ...DEFAULT_SPAWN,
    ...gameplay,
    spec: gameplay.spec ? { ...gameplay.spec } : undefined,
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
