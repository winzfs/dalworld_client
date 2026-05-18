import type { NetworkStatus } from '../net/network';
import type { PlayerSnapshot, ResourceSnapshot } from '../protocol/messages';

export type GameHudState = {
  status: NetworkStatus;
  tick: number;
  player: PlayerSnapshot | null;
  nearbyGather: ResourceSnapshot | null;
  latencyMs: number;
};

const HUD_ROOT_ID = 'dalworld-ui';

type HudRefs = {
  root: HTMLDivElement;
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
  prompt: HTMLDivElement;
  promptText: HTMLSpanElement;
};

export class GameHud {
  private readonly refs: HudRefs;

  constructor() {
    this.refs = createOrGetHud();
  }

  render(state: GameHudState): void {
    const player = state.player;
    const hp = player ? player.hp : 0;
    const maxHp = player ? player.maxHp : 1;
    const stamina = player ? player.stamina : 0;
    const maxStamina = player ? player.maxStamina : 1;
    const inventory = player ? player.inventory : { wood: 0, stone: 0 };

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

    if (state.nearbyGather) {
      this.refs.prompt.hidden = false;
      this.refs.promptText.textContent = `E 키로 ${getResourceLabel(state.nearbyGather.type)} 채집`;
    } else {
      this.refs.prompt.hidden = true;
      this.refs.promptText.textContent = '';
    }
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
    prompt: query(root, '[data-ui="prompt"]'),
    promptText: query(root, '[data-ui="prompt-text"]'),
  };
}

function getHudMarkup(): string {
  return `
    <section class="ui-panel ui-player-panel" aria-label="Player status">
      <div class="ui-panel-title">Dale</div>
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
    </section>

    <section class="ui-prompt" data-ui="prompt" hidden>
      <kbd>E</kbd>
      <span data-ui="prompt-text"></span>
    </section>

    <section class="ui-hotbar" aria-label="Hotbar">
      <button class="ui-slot is-active" type="button">1</button>
      <button class="ui-slot" type="button">2</button>
      <button class="ui-slot" type="button">3</button>
      <button class="ui-slot" type="button">4</button>
    </section>
  `;
}

function getBarMarkup(label: string, key: 'hp' | 'stamina'): string {
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

function getResourceLabel(type: ResourceSnapshot['type']): string {
  switch (type) {
    case 'tree':
      return '나무';
    case 'stone':
      return '돌';
  }
}
