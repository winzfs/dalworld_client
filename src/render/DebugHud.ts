import type { NetworkStatus } from '../net/network';
import type { PlayerSnapshot } from '../protocol/messages';

export type HudState = {
  status: NetworkStatus;
  tick: number;
  player: PlayerSnapshot | null;
};

const HUD_ID = 'dalworld-hud';

export class DebugHud {
  private readonly el: HTMLDivElement;

  constructor() {
    let existing = document.getElementById(HUD_ID) as HTMLDivElement | null;
    if (!existing) {
      existing = document.createElement('div');
      existing.id = HUD_ID;
      document.body.appendChild(existing);
    }
    this.el = existing;
  }

  render(state: HudState): void {
    const player = state.player;
    const playerLine = player
      ? `(${player.x.toFixed(0)}, ${player.y.toFixed(0)})`
      : '—';
    const hpLine = player ? `${player.hp.toFixed(0)} / ${player.maxHp}` : '—';
    const staminaLine = player
      ? `${player.stamina.toFixed(0)} / ${player.maxStamina}`
      : '—';
    const inv = player ? player.inventory : { wood: 0, stone: 0 };

    this.el.innerHTML = [
      `<div class="hud-row"><span>WS</span><b class="status-${state.status}">${state.status}</b></div>`,
      `<div class="hud-row"><span>tick</span><b>${state.tick}</b></div>`,
      `<div class="hud-row"><span>pos</span><b>${playerLine}</b></div>`,
      `<div class="hud-row"><span>hp</span><b>${hpLine}</b></div>`,
      `<div class="hud-row"><span>sta</span><b>${staminaLine}</b></div>`,
      `<div class="hud-row"><span>wood</span><b>${inv.wood}</b></div>`,
      `<div class="hud-row"><span>stone</span><b>${inv.stone}</b></div>`,
    ].join('');
  }
}
