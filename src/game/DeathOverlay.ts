import type { PlayerSnapshot } from '../protocol/messages';

export class DeathOverlay {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'death-overlay';
    this.root.hidden = true;

    this.title = document.createElement('div');
    this.title.className = 'death-overlay-title';
    this.title.textContent = '쓰러졌습니다';

    this.body = document.createElement('div');
    this.body.className = 'death-overlay-body';

    this.root.append(this.title, this.body);
    parent.appendChild(this.root);
  }

  update(player: PlayerSnapshot | null): void {
    if (!player || player.alive) {
      this.root.hidden = true;
      return;
    }

    const remainingMs = Math.max(0, player.respawnAt - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    this.body.textContent = remainingSec > 0
      ? `${remainingSec}초 후 시작 지점에서 부활합니다.`
      : '부활 중...';
    this.root.hidden = false;
  }
}
