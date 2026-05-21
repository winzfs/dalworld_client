import type { NetworkStatus } from '../net/network';
import type { PlayerSnapshot } from '../protocol/messages';
import { logoutAndReload } from './AuthSessionStorage';

export type GameHudState = {
  status: NetworkStatus;
  tick: number;
  player: PlayerSnapshot | null;
  latencyMs: number;
};

const HUD_ROOT_ID = 'dalworld-ui';

type HudRefs = {
  root: HTMLDivElement;
  nameText: HTMLDivElement;
  levelText: HTMLSpanElement;
  expFill: HTMLDivElement;
  expText: HTMLSpanElement;
  hpFill: HTMLDivElement;
  hpText: HTMLSpanElement;
  staminaFill: HTMLDivElement;
  staminaText: HTMLSpanElement;
  woodText: HTMLSpanElement;
  stoneText: HTMLSpanElement;
  posText: HTMLSpanElement;
  networkText: HTMLSpanElement;
  pingText: HTMLSpanElement;
  tickText: HTMLSpanElement;
  logoutButton: HTMLButtonElement;
};

export class GameHud {
  private readonly refs: HudRefs;

  constructor() {
    this.refs = createOrGetHud();
    this.refs.logoutButton.addEventListener('click', () => {
      logoutAndReload();
    });
  }

  render(state: GameHudState): void {
    const player = state.player;
    const hp = player ? player.hp : 0;
    const maxHp = player ? player.maxHp : 1;
    const stamina = player ? player.stamina : 0;
    const maxStamina = player ? player.maxStamina : 1;
    const level = player?.level ?? 1;
    const exp = player?.exp ?? 0;
    const expToNextLevel = player?.expToNextLevel ?? 0;
    const inventory = player ? player.inventory : { wood: 0, stone: 0 };

    this.refs.nameText.textContent = player?.characterName ?? 'Dale';
    this.refs.levelText.textContent = player ? `Lv.${level}` : 'Lv.—';
    setBar(this.refs.expFill, exp, expToNextLevel || 1);
    this.refs.expText.textContent = player
      ? expToNextLevel > 0
        ? `${exp} / ${expToNextLevel}`
        : 'MAX'
      : '—';

    setBar(this.refs.hpFill, hp, maxHp);
    this.refs.hpText.textContent = player ? `${Math.ceil(hp)} / ${maxHp}` : '—';

    setBar(this.refs.staminaFill, stamina, maxStamina);
    this.refs.staminaText.textContent = player ? `${Math.ceil(stamina)} / ${maxStamina}` : '—';

    this.refs.woodText.textContent = String(inventory.wood);
    this.refs.stoneText.textContent = String(inventory.stone);
    this.refs.posText.textContent = player ? `${Math.round(player.x)}, ${Math.round(player.y)}` : '—';
    this.refs.networkText.textContent = state.status;
    this.refs.networkText.className = `ui-network-value status-${state.status}`;
    this.refs.pingText.textContent = state.latencyMs > 0 ? `${state.latencyMs}ms` : '—';
    this.refs.tickText.textContent = String(state.tick);
  }
}

function createOrGetHud(): HudRefs {
  const oldDebugHud = document.getElementById('dalworld-hud');
  oldDebugHud?.remove();

  let root = document.getElementById(HUD_ROOT_ID) as HTMLDivElement | null;

  if (!root) {
    root = document.createElement('div');
    root.id = HUD_ROOT_ID;
    root.innerHTML = getHudMarkup();
    document.body.appendChild(root);
  }

  return {
    root,
    nameText: query(root, '[data-ui="character-name"]'),
    levelText: query(root, '[data-ui="level"]'),
    expFill: query(root, '[data-ui="exp-fill"]'),
    expText: query(root, '[data-ui="exp-text"]'),
    hpFill: query(root, '[data-ui="hp-fill"]'),
    hpText: query(root, '[data-ui="hp-text"]'),
    staminaFill: query(root, '[data-ui="stamina-fill"]'),
    staminaText: query(root, '[data-ui="stamina-text"]'),
    woodText: query(root, '[data-ui="wood"]'),
    stoneText: query(root, '[data-ui="stone"]'),
    posText: query(root, '[data-ui="pos"]'),
    networkText: query(root, '[data-ui="network"]'),
    pingText: query(root, '[data-ui="ping"]'),
    tickText: query(root, '[data-ui="tick"]'),
    logoutButton: query(root, '[data-ui="logout"]'),
  };
}

function getHudMarkup(): string {
  return `
    <section class="ui-panel ui-player-panel" aria-label="Player status">
      <div class="ui-player-title-row">
        <div class="ui-panel-title" data-ui="character-name">Dale</div>
        <span class="ui-level-badge" data-ui="level">Lv.—</span>
      </div>
      ${getBarMarkup('EXP', 'exp')}
      ${getBarMarkup('HP', 'hp')}
      ${getBarMarkup('ST', 'stamina')}
    </section>

    <section class="ui-panel ui-resource-panel" aria-label="Inventory">
      <div class="ui-resource"><span class="ui-resource-icon">🪵</span><b data-ui="wood">0</b></div>
      <div class="ui-resource"><span class="ui-resource-icon">🪨</span><b data-ui="stone">0</b></div>
    </section>

    <section class="ui-panel ui-debug-panel" aria-label="Connection debug">
      <div class="ui-debug-row"><span>WS</span><b data-ui="network" class="ui-network-value">idle</b></div>
      <div class="ui-debug-row"><span>Ping</span><b data-ui="ping">—</b></div>
      <div class="ui-debug-row"><span>Tick</span><b data-ui="tick">0</b></div>
      <div class="ui-debug-row"><span>Pos</span><b data-ui="pos">—</b></div>
      <button class="ui-logout-button" type="button" data-ui="logout">로그아웃</button>
    </section>
  `;
}

function getBarMarkup(label: string, key: 'exp' | 'hp' | 'stamina'): string {
  return `
    <div class="ui-stat-row ui-stat-${key}">
      <div class="ui-stat-label"><span>${label}</span><b data-ui="${key}-text">—</b></div>
      <div class="ui-bar"><div class="ui-bar-fill" data-ui="${key}-fill"></div></div>
    </div>
  `;
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing HUD element: ${selector}`);
  return el;
}

function setBar(fill: HTMLDivElement, value: number, max: number): void {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  fill.style.transform = `scaleX(${ratio})`;
}
