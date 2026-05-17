import { Container, Graphics } from 'pixi.js';
import type { ResourceSnapshot } from '../protocol/messages';

const TREE_COLOR = 0x4caf50;
const TREE_TRUNK = 0x6d4c41;
const STONE_COLOR = 0x90a4ae;
const HP_BAR_WIDTH = 32;

type ResourceView = {
  container: Container;
  body: Graphics;
  hpBar: Graphics;
  type: ResourceSnapshot['type'];
};

export class ResourceRenderer {
  private readonly layer = new Container();
  private readonly views = new Map<string, ResourceView>();

  constructor(parent: Container) {
    parent.addChild(this.layer);
  }

  sync(resources: ResourceSnapshot[]): void {
    const seen = new Set<string>();

    for (const resource of resources) {
      seen.add(resource.id);
      let view = this.views.get(resource.id);
      if (!view) {
        view = this.createView(resource);
        this.views.set(resource.id, view);
      }

      view.container.position.set(resource.x, resource.y);

      if (!resource.alive) {
        view.container.alpha = 0.2;
        view.hpBar.visible = false;
      } else {
        view.container.alpha = 1;
        const hpRatio = resource.hp / resource.maxHp;
        view.hpBar.visible = hpRatio < 1;
        if (view.hpBar.visible) {
          view.hpBar.clear();
          view.hpBar
            .rect(-HP_BAR_WIDTH / 2, -38, HP_BAR_WIDTH, 4)
            .fill({ color: 0x1a1a2e });
          view.hpBar
            .rect(-HP_BAR_WIDTH / 2, -38, HP_BAR_WIDTH * Math.max(0, hpRatio), 4)
            .fill({ color: resource.type === 'tree' ? 0x66bb6a : 0xb0bec5 });
        }
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

  /** Closest alive resource within maxDistance of (x, y), or null. */
  getClosestAlive(
    resources: ResourceSnapshot[],
    x: number,
    y: number,
    maxDistance: number,
  ): ResourceSnapshot | null {
    let best: ResourceSnapshot | null = null;
    let bestDist = maxDistance;
    for (const resource of resources) {
      if (!resource.alive) continue;
      const dx = resource.x - x;
      const dy = resource.y - y;
      const d = Math.hypot(dx, dy);
      if (d <= bestDist) {
        bestDist = d;
        best = resource;
      }
    }
    return best;
  }

  private createView(resource: ResourceSnapshot): ResourceView {
    const container = new Container();
    const body = new Graphics();

    if (resource.type === 'tree') {
      body.rect(-3, -4, 6, 20).fill({ color: TREE_TRUNK });
      body.circle(0, -26, 22).fill({ color: TREE_COLOR });
      body.circle(-10, -18, 14).fill({ color: 0x43a047 });
      body.circle(10, -18, 14).fill({ color: 0x43a047 });
      body.circle(0, -34, 13).fill({ color: 0x81c784 });
    } else {
      body.circle(0, 4, 18).fill({ color: STONE_COLOR });
      body.circle(-7, -2, 12).fill({ color: 0xcfd8dc });
      body.circle(8, 0, 10).fill({ color: 0xb0bec5 });
      body.circle(-2, 8, 8).fill({ color: 0x78909c });
    }

    const hpBar = new Graphics();
    hpBar.visible = false;

    container.addChild(body);
    container.addChild(hpBar);
    container.position.set(resource.x, resource.y);
    this.layer.addChild(container);

    return { container, body, hpBar, type: resource.type };
  }
}
