import { WorldMapGrid } from './WorldMapGrid';
import type { EditorMonsterSpawnRule } from './types';

export class GlobalMonsterSpawnPanel {
  readonly element = document.createElement('div');
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(private readonly grid: WorldMapGrid) {
    this.element.className = 'global-monster-spawn-panel';
    this.element.style.right = '20px';
    this.element.style.top = '560px';
    this.attachDragHandlers();
    this.grid.subscribe(() => this.render());
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  remove(): void {
    this.element.remove();
  }

  private render(): void {
    this.element.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'global-monster-spawn-header';
    header.textContent = '전체맵 몬스터 스폰';
    this.element.appendChild(header);

    const description = document.createElement('div');
    description.className = 'global-monster-spawn-description';
    description.textContent = '충돌/블락/건물/플레이어/몬스터 위치는 서버가 자동 회피합니다.';
    this.element.appendChild(description);

    for (const rule of this.grid.monsterSpawnRules) {
      this.element.appendChild(this.createRuleCard(rule));
    }
  }

  private createRuleCard(rule: EditorMonsterSpawnRule): HTMLElement {
    const card = document.createElement('div');
    card.className = 'global-monster-spawn-card';
    if (!rule.enabled) card.classList.add('is-disabled');

    const toggle = document.createElement('label');
    toggle.className = 'global-monster-spawn-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.onchange = () => this.patchRule(rule.id, { enabled: checkbox.checked });

    const title = document.createElement('strong');
    title.textContent = rule.monsterType === 'sheep' ? 'Sheep' : 'Wild Slime';

    toggle.append(checkbox, title);
    card.append(
      toggle,
      this.createNumberField('최대 유지', rule.maxAlive, 0, 500, 1, (value) => {
        this.patchRule(rule.id, { maxAlive: Math.round(value) });
      }),
      this.createNumberField('시간당 스폰', rule.spawnsPerHour, 1, 36000, 1, (value) => {
        this.patchRule(rule.id, { spawnsPerHour: Math.round(value) });
      }),
    );

    return card;
  }

  private createNumberField(
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const label = document.createElement('label');
    label.className = 'global-monster-spawn-field';

    const text = document.createElement('span');
    text.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.onchange = () => onChange(clampNumber(Number(input.value), min, max, value));

    label.append(text, input);
    return label;
  }

  private patchRule(ruleId: string, patch: Partial<EditorMonsterSpawnRule>): void {
    this.grid.setMonsterSpawnRules(this.grid.monsterSpawnRules.map((rule) => (
      rule.id === ruleId ? { ...rule, ...patch } : rule
    )));
  }

  private attachDragHandlers(): void {
    this.element.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
      this.dragging = true;
      const rect = this.element.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      this.element.setPointerCapture(event.pointerId);
    });

    this.element.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.element.style.left = `${event.clientX - this.dragOffsetX}px`;
      this.element.style.right = 'auto';
      this.element.style.top = `${event.clientY - this.dragOffsetY}px`;
    });

    const stop = () => {
      this.dragging = false;
    };

    this.element.addEventListener('pointerup', stop);
    this.element.addEventListener('pointercancel', stop);
  }
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
