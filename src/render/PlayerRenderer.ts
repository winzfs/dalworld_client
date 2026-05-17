import { Container, Graphics } from 'pixi.js';
import type { Facing, PlayerSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';

const PLAYER_RADIUS = 18;
const COLOR_LOCAL = 0x55d6be;
const COLOR_REMOTE = 0xffd166;
const EYE_OFFSET = PLAYER_RADIUS * 0.55;
const EYE_RADIUS = 4;

type PlayerView = {
  container: Container;
  body: Graphics;
  eye: Graphics;
  hpBar: Graphics;
  facing: Facing;
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

      if (view.facing !== player.facing) {
        view.facing = player.facing;
        updateEye(view.eye, player.facing);
      }

      view.hpBar.visible = player.hp < player.maxHp;
      if (view.hpBar.visible) {
        view.hpBar.clear();
        const width = 40;
        const ratio = Math.max(0, player.hp / player.maxHp);
        view.hpBar.rect(-width / 2, -PLAYER_RADIUS - 14, width, 4).fill({ color: 0x222831 });
        view.hpBar
          .rect(-width / 2, -PLAYER_RADIUS - 14, width * ratio, 4)
          .fill({ color: 0xef476f });
      }
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.layer.removeChild(view.container);
        view.container.destroy({ children: true });
        this.views.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (const view of this.views.values()) {
      const pos = view.interp.update(dt);
      view.container.position.set(pos.x, pos.y);
    }
  }

  private createView(player: PlayerSnapshot, local: boolean): PlayerView {
    const container = new Container();
    const body = new Graphics();
    body.circle(0, 0, PLAYER_RADIUS).fill({ color: local ? COLOR_LOCAL : COLOR_REMOTE });

    const eye = new Graphics();
    updateEye(eye, player.facing);

    const hpBar = new Graphics();

    container.addChild(body);
    container.addChild(eye);
    container.addChild(hpBar);
    container.position.set(player.x, player.y);
    this.layer.addChild(container);

    return {
      container,
      body,
      eye,
      hpBar,
      facing: player.facing,
      interp: new Interpolator2D(player.x, player.y, local ? 30 : 12),
    };
  }
}

function updateEye(eye: Graphics, facing: Facing): void {
  eye.clear();
  const offset = facingOffset(facing);
  eye.circle(offset.x * EYE_OFFSET, offset.y * EYE_OFFSET, EYE_RADIUS).fill({ color: 0x102027 });
}

function facingOffset(facing: Facing): { x: number; y: number } {
  switch (facing) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}
