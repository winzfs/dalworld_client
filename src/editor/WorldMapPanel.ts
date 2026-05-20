import { WorldMapGrid } from './WorldMapGrid';
import type { EditorMonsterSpawnRule } from './types';

export type WorldMapPanelOptions = {
  grid: WorldMapGrid;
  onSelectCell: (gridX: number, gridY: number) => void;
  onDeleteCurrentCell: () => void;
};

const VIEW_RADIUS = 2;

export class WorldMapPanel {
  readonly element: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private readonly gridEl: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly spawnRules: HTMLDivElement;
  private openState = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(private readonly options: WorldMapPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'world-map-panel';
    this.element.style.right = '20px';
    this.element.style.top = '220px';
    this.element.hidden = true;

    this.header = document.createElement('div');
    this.header.className = 'world-map-header';

    const title = document.createElement('strong');
    title.textContent = 'World Map';

    const close = document.createElement('button');
    close.className = 'world-map-close';
    close.textContent = '×';
    close.onclick = () => this.close();

    this.header.append(title, close);

    this.controls = document.createElement('div');
    this.controls.className = 'world-map-controls';

    this.spawnRules = document.createElement('div');
    this.spawnRules.className = 'world-map-spawn-rules';

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'world-map-grid';

    this.element.append(this.header, this.controls, this.spawnRules, this.gridEl);
    this.attachDragHandlers();
    this.options.grid.subscribe(() => this.render());
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  open(): void {
    this.openState = true;
    this.element.hidden = false;
    this.render();
  }

  close(): void {
    this.openState = false;
    this.element.hidden = true;
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  private render(): void {
    this.renderControls();
    this.renderSpawnRules();
    this.renderGrid();
  }

  private renderControls(): void {
    const current = this.options.grid.current;
    this.controls.innerHTML = '';

    const info = document.createElement('div');
    info.className = 'world-map-info';
    info.textContent = `현재: ${current.gridX}, ${current.gridY}`;

    const row = document.createElement('div');
    row.className = 'world-map-create-row';

    row.append(
      this.createNeighborButton('←', -1, 0),
      this.createNeighborButton('↑', 0, -1),
      this.createNeighborButton('↓', 0, 1),
      this.createNeighborButton('→', 1, 0),
    );

    const deleteButton = document.createElement('button');
    deleteButton.className = 'world-map-delete-current';
    deleteButton.textContent = '현재맵 삭제';
    deleteButton.onclick = () => this.options.onDeleteCurrentCell();

    this.controls.append(info, row, deleteButton);
  }

  private renderSpawnRules(): void {
    this.spawnRules.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'world-map-spawn-title';
    title.textContent = '전체맵 몬스터 스폰';

    const note = document.createElement('div');
    note.className = 'world-map-spawn-note';
    note.textContent = '서버가 블락/건물/플레이어/몬스터 위치를 피해 스폰합니다.';

    this.spawnRules.append(title, note);

    for (const rule of this.options.grid.monsterSpawnRules) {
      this.spawnRules.appendChild(this.createSpawnRuleCard(rule));
    }
  }

  private createSpawnRuleCard(rule: EditorMonsterSpawnRule): HTMLElement {
    const card = document.createElement('div');
    card.className = 'world-map-spawn-card';
    if (!rule.enabled) card.classList.add('is-disabled');

    const toggle = document.createElement('label');
    toggle.className = 'world-map-spawn-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.onchange = () => this.patchSpawnRule(rule.id, { enabled: checkbox.checked });

    const name = document.createElement('strong');
    name.textContent = rule.monsterType === 'sheep' ? 'Sheep' : 'Wild Slime';
    toggle.append(checkbox, name);

    card.append(
      toggle,
      this.createNumberField('최대 유지', rule.maxAlive, 0, 500, 1, (value) => {
        this.patchSpawnRule(rule.id, { maxAlive: Math.round(value) });
      }),
      this.createNumberField('시간당', rule.spawnsPerHour, 1, 36000, 1, (value) => {
        this.patchSpawnRule(rule.id, { spawnsPerHour: Math.round(value) });
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
    label.className = 'world-map-spawn-field';

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

  private patchSpawnRule(ruleId: string, patch: Partial<EditorMonsterSpawnRule>): void {
    this.options.grid.setMonsterSpawnRules(this.options.grid.monsterSpawnRules.map((rule) => (
      rule.id === ruleId ? { ...rule, ...patch } : rule
    )));
  }

  private renderGrid(): void {
    const current = this.options.grid.current;
    this.gridEl.innerHTML = '';
    this.gridEl.style.gridTemplateColumns = `repeat(${VIEW_RADIUS * 2 + 1}, 44px)`;

    for (let y = current.gridY - VIEW_RADIUS; y <= current.gridY + VIEW_RADIUS; y += 1) {
      for (let x = current.gridX - VIEW_RADIUS; x <= current.gridX + VIEW_RADIUS; x += 1) {
        this.gridEl.appendChild(this.createCellButton(x, y));
      }
    }
  }

  private createCellButton(gridX: number, gridY: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'world-map-cell';

    const current = this.options.grid.current;
    const exists = this.options.grid.hasCell(gridX, gridY);
    const isCurrent = current.gridX === gridX && current.gridY === gridY;

    if (exists) button.classList.add('exists');
    if (isCurrent) button.classList.add('is-current');

    button.textContent = exists ? `${gridX},${gridY}` : '+';
    button.title = exists ? `이동: ${gridX},${gridY}` : `생성: ${gridX},${gridY}`;
    button.onclick = () => this.options.onSelectCell(gridX, gridY);

    return button;
  }

  private createNeighborButton(label: string, dx: number, dy: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'world-map-action';
    button.textContent = label;
    button.onclick = () => {
      const current = this.options.grid.current;
      this.options.onSelectCell(current.gridX + dx, current.gridY + dy);
    };
    return button;
  }

  private attachDragHandlers(): void {
    this.header.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      const rect = this.element.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      this.header.setPointerCapture(event.pointerId);
    });

    this.header.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.element.style.left = `${event.clientX - this.dragOffsetX}px`;
      this.element.style.right = 'auto';
      this.element.style.top = `${event.clientY - this.dragOffsetY}px`;
    });

    const stopDragging = () => {
      this.dragging = false;
    };

    this.header.addEventListener('pointerup', stopDragging);
    this.header.addEventListener('pointercancel', stopDragging);
  }
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
