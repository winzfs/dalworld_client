import { Container, Graphics } from 'pixi.js';
import type { ResourceSnapshot } from '../protocol/messages';

const TREE_COLOR = 0x4caf50;
const TREE_TRUNK = 0x6d4c41;
const STONE_COLOR = 0x90a4ae;

type ResourceView = {
  graphics: Graphics;
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

      const dead = resource.respawnAt !== 0 || resource.hp <= 0;
      view.graphics.alpha = dead ? 0 : 1;
      view.graphics.visible = !dead;
      view.graphics.position.set(resource.x, resource.y);
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.layer.removeChild(view.graphics);
        view.graphics.destroy({ children: true });
        this.views.delete(id);
      }
    }
  }

  /** Snapshot positions for hit-testing the closest gather target. */
  getClosestAlive(
    resources: ResourceSnapshot[],
    x: number,
    y: number,
    maxDistance: number,
  ): ResourceSnapshot | null {
    let best: ResourceSnapshot | null = null;
    let bestDist = maxDistance;
    for (const resource of resources) {
      if (resource.respawnAt !== 0 || resource.hp <= 0) continue;
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
    const graphics = new Graphics();
    if (resource.type === 'tree') {
      graphics.rect(-3, -2, 6, 14).fill({ color: TREE_TRUNK });
      graphics.circle(0, -10, 18).fill({ color: TREE_COLOR });
    } else {
      graphics.circle(0, 0, 14).fill({ color: STONE_COLOR });
      graphics.circle(-4, -3, 4).fill({ color: 0xcfd8dc });
    }
    graphics.position.set(resource.x, resource.y);
    this.layer.addChild(graphics);
    return { graphics, type: resource.type };
  }
}
