import { Container, Graphics, Text } from 'pixi.js';
import { BUILD_PARTS } from './BuildingParts';
import { getIsoZIndex, gridToScreen, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
import type { BuildingSnapshot, PlacedBuildPart } from './BuildingTypes';

export class BuildingPlacementRenderer {
  readonly container = new Container();

  private readonly nodes = new Map<string, Container>();

  constructor() {
    this.container.sortableChildren = true;
    this.container.zIndex = 60;
  }

  applySnapshot(snapshot: BuildingSnapshot): void {
    const aliveIds = new Set(snapshot.parts.map((part) => part.entityId));

    for (const entityId of this.nodes.keys()) {
      if (!aliveIds.has(entityId)) {
        this.remove(entityId);
      }
    }

    for (const part of snapshot.parts) {
      this.addOrUpdate(part);
    }
  }

  addOrUpdate(part: PlacedBuildPart): void {
    let node = this.nodes.get(part.entityId);

    if (!node) {
      node = new Container();
      this.nodes.set(part.entityId, node);
      this.container.addChild(node);
    }

    node.removeChildren();

    const definition = BUILD_PARTS[part.partId];
    const screen = gridToScreen(part.x, part.y, part.z);
    const base = new Graphics();
    const halfW = ISO_TILE_WIDTH / 2;
    const halfH = ISO_TILE_HEIGHT / 2;
    const color = getPartColor(part.partId);

    base
      .moveTo(0, -halfH)
      .lineTo(halfW, 0)
      .lineTo(0, halfH)
      .lineTo(-halfW, 0)
      .lineTo(0, -halfH)
      .fill({ color, alpha: 0.74 })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.38 });

    const icon = new Text({
      text: definition?.icon ?? '?',
      style: {
        fill: 0xffffff,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fontWeight: '700',
      },
    });
    icon.anchor.set(0.5, 0.5);
    icon.y = -8;

    node.x = screen.x;
    node.y = screen.y;
    node.zIndex = getIsoZIndex(part.x, part.y, part.z, 100);
    node.addChild(base, icon);
  }

  remove(entityId: string): void {
    const node = this.nodes.get(entityId);

    if (!node) {
      return;
    }

    node.destroy({ children: true });
    this.nodes.delete(entityId);
  }

  clear(): void {
    for (const node of this.nodes.values()) {
      node.destroy({ children: true });
    }

    this.nodes.clear();
  }
}

function getPartColor(partId: string): number {
  switch (partId) {
    case 'floor_1x1':
      return 0x8fbc8f;
    case 'wall_ne':
    case 'wall_nw':
    case 'corner':
      return 0xb08a62;
    case 'column':
      return 0x9c7a56;
    case 'stair':
      return 0xc0a36a;
    case 'roof':
      return 0xb64d4d;
    case 'door':
      return 0x7a4e2e;
    default:
      return 0x88aadd;
  }
}
