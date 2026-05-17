import { Container, Graphics } from 'pixi.js';
import type { MonsterSnapshot } from '../protocol/messages';
import { Interpolator2D } from '../game/interpolation';

const MONSTER_COLOR_IDLE = 0xc62828;
const MONSTER_COLOR_CHASE = 0xff5252;

type MonsterView = {
  container: Container;
  body: Graphics;
  state: MonsterSnapshot['state'];
  interp: Interpolator2D;
};

export class MonsterRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, MonsterView>();

  constructor(parent: Container) {
    parent.addChild(this.layer);
  }

  sync(monsters: MonsterSnapshot[]): void {
    const seen = new Set<string>();

    for (const monster of monsters) {
      seen.add(monster.id);
      let view = this.views.get(monster.id);
      if (!view) {
        view = this.createView(monster);
        this.views.set(monster.id, view);
      }

      view.interp.setTarget(monster.x, monster.y);

      if (view.state !== monster.state) {
        view.state = monster.state;
        view.body.clear();
        view.body
          .circle(0, 0, 16)
          .fill({ color: monster.state === 'chase' ? MONSTER_COLOR_CHASE : MONSTER_COLOR_IDLE });
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

  private createView(monster: MonsterSnapshot): MonsterView {
    const container = new Container();
    const body = new Graphics();
    body
      .circle(0, 0, 16)
      .fill({ color: monster.state === 'chase' ? MONSTER_COLOR_CHASE : MONSTER_COLOR_IDLE });
    container.addChild(body);
    container.position.set(monster.x, monster.y);
    this.layer.addChild(container);
    return {
      container,
      body,
      state: monster.state,
      interp: new Interpolator2D(monster.x, monster.y, 10),
    };
  }
}
