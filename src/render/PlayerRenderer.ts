import { Container, Graphics } from 'pixi.js';
import type { PlayerSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';

const PLAYER_RADIUS = 18;
const COLOR_LOCAL = 0x55d6be;
const COLOR_REMOTE = 0xffd166;

type PlayerView = {
  graphics: Graphics;
  hpBar: Graphics;
  interp: Interpolator2D;
};

export class PlayerRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, PlayerView>();

  constructor(parent: Container) {
    parent.addChild(this.layer);
  }

  sync(snapshots: PlayerSnapshot[], localPlayerId: string | null): void {
    const seen = new Set<string>();

    for (const player of snapshots) {
      seen.add(player.id);
      let view = this.views.get(player.id);
      if (!view) {
        view = this.createView(player, player.id === localPlayerId);
        this.views.set(player.id, view);
      }

      if (player.id === localPlayerId) {
        view.interp.snapTo(player.x, player.y);
      } else {
        view.interp.setTarget(player.x, player.y);
      }

      // 데미지를 받았을 때만 HP 바를 표시한다.
      view.hpBar.visible = player.hp < player.maxHp;
      if (view.hpBar.visible) {
        view.hpBar.clear();
        const width = 40;
        const ratio = Math.max(0, player.hp / player.maxHp);
        view.hpBar.rect(-width / 2, -PLAYER_RADIUS - 14, width, 4).fill({ color: 0x222831 });
        view.hpBar.rect(-width / 2, -PLAYER_RADIUS - 14, width * ratio, 4).fill({ color: 0xef476f });
      }
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.layer.removeChild(view.graphics);
        view.graphics.destroy({ children: true });
        this.views.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (const view of this.views.values()) {
      const pos = view.interp.update(dt);
      view.graphics.position.set(pos.x, pos.y);
    }
  }

  private createView(player: PlayerSnapshot, local: boolean): PlayerView {
    const graphics = new Graphics();
    graphics.circle(0, 0, PLAYER_RADIUS).fill({ color: local ? COLOR_LOCAL : COLOR_REMOTE });
    graphics.position.set(player.x, player.y);

    const hpBar = new Graphics();
    graphics.addChild(hpBar);

    this.layer.addChild(graphics);
    return {
      graphics,
      hpBar,
      interp: new Interpolator2D(player.x, player.y, local ? 30 : 12),
    };
  }
}
