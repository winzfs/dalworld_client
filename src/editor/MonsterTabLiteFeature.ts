import { loadServerWorldMap } from './EditorWorldSaveActions';
import { saveMonsterTabToServer } from './EditorTabServerSaves';
import type { EditorMonsterSpawnRule, EditorMonsterType } from './types';

const MONSTER_TYPES: EditorMonsterType[] = ['wild_slime', 'sheep'];
const DEFAULT_RULES: EditorMonsterSpawnRule[] = [
  {
    id: 'world-wild-slime',
    enabled: true,
    monsterType: 'wild_slime',
    scope: 'world',
    maxAlive: 12,
    spawnsPerMinute: 2,
  },
  {
    id: 'world-sheep',
    enabled: true,
    monsterType: 'sheep',
    scope: 'world',
    maxAlive: 8,
    spawnsPerMinute: 1,
  },
];

let installed = false;
let currentRules: EditorMonsterSpawnRule[] = cloneRules(DEFAULT_RULES);

export function installMonsterTabLiteFeature(options: {
  status?: (message: string) => void;
} = {}): void {
  const status = options.status ?? ((message: string) => console.log('[MonsterTabLite]', message));

  if (!installed) {
    installed = true;
    const observer = new MutationObserver(() => enhancePanels(status));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  enhancePanels(status);
}

function enhancePanels(status: (message: string) => void): void {
  document.querySelectorAll<HTMLElement>('.staged-classic-editor-panel').forEach((panel) => {
    if (panel.dataset.monsterLiteInstalled === 'true') return;
    if (wireMonsterTab(panel, status)) {
      panel.dataset.monsterLiteInstalled = 'true';
      status('Monsters 탭 패널 연결 완료.');
    }
  });
}

function wireMonsterTab(panel: HTMLElement, status: (message: string) => void): boolean {
  const tabsContainer = panel.querySelector<HTMLElement>('.map-editor-tabs');
  const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>('.map-editor-tab'));
  const tilesTab = tabs.find((tab) => tab.textContent?.trim() === 'Tiles');
  const monstersTab = tabs.find((tab) => tab.textContent?.trim() === 'Monsters');

  if (!tabsContainer || !tilesTab || !monstersTab) {
    status('Monsters 탭 연결 대기 중...');
    return false;
  }

  const monsterContent = createMonsterContent(status);
  monsterContent.style.display = 'none';
  panel.appendChild(monsterContent);

  const getTilesContentNodes = () => Array.from(panel.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.classList.contains('map-editor-header')) return false;
    if (child.classList.contains('map-editor-tabs')) return false;
    if (child === monsterContent) return false;
    return true;
  }) as HTMLElement[];

  const showTiles = () => {
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab === tilesTab));
    getTilesContentNodes().forEach((node) => {
      node.style.display = '';
    });
    monsterContent.style.display = 'none';
    status('Tiles 탭 선택됨.');
  };

  const showMonsters = () => {
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab === monstersTab));
    getTilesContentNodes().forEach((node) => {
      node.style.display = 'none';
    });
    monsterContent.style.display = 'grid';
    renderMonsterRules(monsterContent, status);
    status(`Monsters 탭 선택됨. rules=${currentRules.length}`);
  };

  tilesTab.onclick = (event) => {
    event.preventDefault();
    showTiles();
  };

  monstersTab.onclick = (event) => {
    event.preventDefault();
    showMonsters();
  };

  tilesTab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showTiles();
  });

  monstersTab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showMonsters();
  });

  return true;
}

function createMonsterContent(status: (message: string) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-editor-monster-lite';
  root.style.cssText = 'padding:12px;display:grid;gap:10px;font-size:12px;line-height:1.45;max-height:min(70vh,620px);overflow:auto;';

  const intro = document.createElement('div');
  intro.className = 'map-editor-empty';
  intro.textContent = '월드 전체 몬스터 스폰 규칙을 편집합니다. 저장은 /maps/default/monsters로 분리 저장되며 런타임 월드맵에 즉시 반영됩니다.';

  const actions = document.createElement('div');
  actions.className = 'map-editor-actions';

  const loadButton = createActionButton('불러오기', () => {
    void loadMonsterRules(root, status);
  });
  const addButton = createActionButton('규칙 추가', () => {
    currentRules = [...currentRules, createDefaultRule()];
    renderMonsterRules(root, status);
    status(`몬스터 규칙 추가. rules=${currentRules.length}`);
  });
  const saveButton = createActionButton('저장', () => {
    void saveMonsterRules(root, status);
  });
  actions.append(loadButton, addButton, saveButton);

  const list = document.createElement('div');
  list.dataset.role = 'monster-rules';
  list.style.cssText = 'display:grid;gap:10px;';

  root.append(intro, actions, list);
  renderMonsterRules(root, status);
  return root;
}

function renderMonsterRules(root: HTMLElement, status: (message: string) => void): void {
  const list = root.querySelector<HTMLElement>('[data-role="monster-rules"]');
  if (!list) return;

  list.replaceChildren();

  if (currentRules.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'map-editor-empty';
    empty.textContent = '몬스터 스폰 규칙이 없습니다. 규칙 추가를 눌러 생성하세요.';
    list.appendChild(empty);
    return;
  }

  currentRules.forEach((rule, index) => {
    list.appendChild(createRuleEditor(rule, index, status, () => renderMonsterRules(root, status)));
  });
}

function createRuleEditor(
  rule: EditorMonsterSpawnRule,
  index: number,
  status: (message: string) => void,
  rerender: () => void,
): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = 'display:grid;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(0,0,0,.18);';

  const title = document.createElement('div');
  title.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;color:#ffe4a3;font-weight:700;';
  title.textContent = `Rule ${index + 1}`;

  const remove = createActionButton('삭제', () => {
    currentRules = currentRules.filter((entry) => entry !== rule);
    rerender();
    status(`몬스터 규칙 삭제. rules=${currentRules.length}`);
  }, 'danger');
  title.appendChild(remove);

  const enabled = createCheckboxField('enabled', rule.enabled, (value) => {
    rule.enabled = value;
  });
  const monsterType = createSelectField('monsterType', rule.monsterType, MONSTER_TYPES, (value) => {
    rule.monsterType = value as EditorMonsterType;
    rule.id = rule.id.trim() || createRuleId(rule.monsterType);
  });
  const scope = createSelectField('scope', rule.scope, ['world', 'region'], (value) => {
    rule.scope = value === 'region' ? 'region' : 'world';
  });
  const maxAlive = createNumberField('maxAlive', rule.maxAlive, 0, 500, 1, (value) => {
    rule.maxAlive = value;
  });
  const spawnsPerMinute = createNumberField('spawns/min', rule.spawnsPerMinute, 1, 600, 1, (value) => {
    rule.spawnsPerMinute = value;
    rule.spawnsPerHour = value * 60;
  });

  const specTitle = document.createElement('div');
  specTitle.textContent = 'Spec override';
  specTitle.style.cssText = 'margin-top:4px;color:rgba(255,255,255,.72);font-weight:700;';

  const spec = rule.spec ?? {};
  rule.spec = spec;

  const specGrid = document.createElement('div');
  specGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;';
  specGrid.append(
    createOptionalNumberField('maxHp', spec.maxHp, 1, 99999, 1, (value) => { spec.maxHp = value; }),
    createOptionalNumberField('moveSpeed', spec.moveSpeed, 1, 2000, 1, (value) => { spec.moveSpeed = value; }),
    createOptionalNumberField('detectRange', spec.detectRange, 1, 5000, 1, (value) => { spec.detectRange = value; }),
    createOptionalNumberField('attackDamage', spec.attackDamage, 1, 9999, 1, (value) => { spec.attackDamage = value; }),
  );

  card.append(title, enabled, monsterType, scope, maxAlive, spawnsPerMinute, specTitle, specGrid);
  return card;
}

async function loadMonsterRules(root: HTMLElement, status: (message: string) => void): Promise<void> {
  try {
    status('몬스터 규칙 불러오는 중...');
    const map = await loadServerWorldMap(status);
    currentRules = normalizeRules(map.monsterSpawnRules as EditorMonsterSpawnRule[] | undefined);
    renderMonsterRules(root, status);
    status(`몬스터 규칙 불러오기 완료. rules=${currentRules.length}`);
  } catch (error) {
    status(`몬스터 규칙 불러오기 실패: ${formatErrorMessage(error)}`);
  }
}

async function saveMonsterRules(root: HTMLElement, status: (message: string) => void): Promise<void> {
  try {
    const payload = normalizeRules(currentRules);
    currentRules = payload;
    renderMonsterRules(root, status);
    status(`몬스터 규칙 저장 중... rules=${payload.length}`);
    const count = await saveMonsterTabToServer(payload);
    status(`몬스터 규칙 저장 완료. rules=${count}`);
  } catch (error) {
    status(`몬스터 규칙 저장 실패: ${formatErrorMessage(error)}`);
  }
}

function normalizeRules(rules: EditorMonsterSpawnRule[] | undefined): EditorMonsterSpawnRule[] {
  const source = rules && rules.length > 0 ? rules : DEFAULT_RULES;
  return source.map((rule) => {
    const monsterType = MONSTER_TYPES.includes(rule.monsterType) ? rule.monsterType : 'wild_slime';
    const spawnsPerMinute = clampInt(resolveSpawnsPerMinute(rule.spawnsPerMinute, rule.spawnsPerHour), 1, 600);
    const spec = rule.spec ? { ...rule.spec } : undefined;
    return {
      id: rule.id?.trim() || createRuleId(monsterType),
      enabled: rule.enabled !== false,
      monsterType,
      scope: rule.scope === 'region' ? 'region' : 'world',
      maxAlive: clampInt(rule.maxAlive, 0, 500),
      spawnsPerMinute,
      spawnsPerHour: spawnsPerMinute * 60,
      spec,
    };
  });
}

function createDefaultRule(): EditorMonsterSpawnRule {
  return {
    id: createRuleId('wild_slime'),
    enabled: true,
    monsterType: 'wild_slime',
    scope: 'world',
    maxAlive: 10,
    spawnsPerMinute: 1,
    spawnsPerHour: 60,
  };
}

function createRuleId(monsterType: EditorMonsterType): string {
  return `world-${monsterType}-${Date.now().toString(36)}`;
}

function cloneRules(rules: EditorMonsterSpawnRule[]): EditorMonsterSpawnRule[] {
  return rules.map((rule) => ({
    ...rule,
    spec: rule.spec ? { ...rule.spec } : undefined,
  }));
}

function createCheckboxField(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const wrapper = createFieldWrapper(label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  wrapper.appendChild(input);
  return wrapper;
}

function createSelectField(label: string, value: string, values: string[], onChange: (value: string) => void): HTMLElement {
  const wrapper = createFieldWrapper(label);
  const select = document.createElement('select');
  select.className = 'map-editor-scale-input';
  values.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry;
    option.textContent = entry;
    select.appendChild(option);
  });
  select.value = value;
  select.onchange = () => onChange(select.value);
  wrapper.appendChild(select);
  return wrapper;
}

function createNumberField(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
  const wrapper = createFieldWrapper(label);
  const input = document.createElement('input');
  input.className = 'map-editor-scale-input';
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.onchange = () => {
    const next = clampInt(Number(input.value), min, max);
    input.value = String(next);
    onChange(next);
  };
  wrapper.appendChild(input);
  return wrapper;
}

function createOptionalNumberField(label: string, value: number | undefined, min: number, max: number, step: number, onChange: (value: number | undefined) => void): HTMLElement {
  const wrapper = createFieldWrapper(label);
  const input = document.createElement('input');
  input.className = 'map-editor-scale-input';
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.placeholder = 'default';
  input.value = value === undefined ? '' : String(value);
  input.onchange = () => {
    if (input.value.trim() === '') {
      onChange(undefined);
      return;
    }
    const next = clampInt(Number(input.value), min, max);
    input.value = String(next);
    onChange(next);
  };
  wrapper.appendChild(input);
  return wrapper;
}

function createFieldWrapper(label: string): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.style.cssText = 'display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;';
  const text = document.createElement('span');
  text.textContent = label;
  text.style.color = 'rgba(255,255,255,.72)';
  wrapper.appendChild(text);
  return wrapper;
}

function createActionButton(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `map-editor-action${extraClass ? ` ${extraClass}` : ''}`;
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

function resolveSpawnsPerMinute(spawnsPerMinute: number | undefined, spawnsPerHour: number | undefined): number {
  if (Number.isFinite(spawnsPerMinute) && (spawnsPerMinute as number) > 0) return spawnsPerMinute as number;
  if (Number.isFinite(spawnsPerHour) && (spawnsPerHour as number) > 0) return Math.max(1, Math.round((spawnsPerHour as number) / 60));
  return 1;
}

function clampInt(value: number | undefined, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value as number) : min;
  return Math.min(max, Math.max(min, normalized));
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
