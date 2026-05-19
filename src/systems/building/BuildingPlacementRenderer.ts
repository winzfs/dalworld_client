import { Container, Graphics } from 'pixi.js';
import { getIsoZIndex, gridToScreen, ISO_LAYER_HEIGHT, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
import type { BuildRotation, BuildingSnapshot, PlacedBuildPart } from './BuildingTypes';

export class BuildingPlacementRenderer {
  readonly container = new Container();

  private readonly nodes = new Map<string, Container>();
  private readonly parts = new Map<string, PlacedBuildPart>();

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

    this.parts.set(part.entityId, part);
    node.removeChildren();

    const screen = gridToScreen(part.x, part.y, part.z);
    node.x = screen.x;
    node.y = screen.y;
    node.zIndex = getIsoZIndex(part.x, part.y, part.z, getPartLayerOffset(part));

    switch (part.partId) {
      case 'floor_1x1':
        node.addChild(renderFloor());
        break;
      case 'thin_wall':
        node.addChild(renderThinWall(part.rotation));
        break;
      case 'roof_1x1':
        node.addChild(renderRoof());
        break;
      case 'pillar':
        node.addChild(renderPillar(part.rotation));
        break;
      case 'door':
        node.addChild(renderDoor(part.rotation, Boolean(part.state?.open)));
        break;
      case 'window':
        node.addChild(renderWindow(part.rotation));
        break;
    }
  }

  updateDoor(entityId: string, open: boolean): void {
    const part = this.parts.get(entityId);

    if (!part || part.partId !== 'door') {
      return;
    }

    this.addOrUpdate({
      ...part,
      state: {
        ...part.state,
        open,
      },
    });
  }

  remove(entityId: string): void {
    const node = this.nodes.get(entityId);

    if (!node) {
      return;
    }

    node.destroy({ children: true });
    this.nodes.delete(entityId);
    this.parts.delete(entityId);
  }

  clear(): void {
    for (const node of this.nodes.values()) {
      node.destroy({ children: true });
    }

    this.nodes.clear();
    this.parts.clear();
  }
}

function renderFloor(): Container {
  const node = new Container();
  const top = new Graphics();
  const side = new Graphics();
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const thickness = 8;

  side
    .moveTo(-halfW, 0)
    .lineTo(0, halfH)
    .lineTo(halfW, 0)
    .lineTo(halfW, thickness)
    .lineTo(0, halfH + thickness)
    .lineTo(-halfW, thickness)
    .lineTo(-halfW, 0)
    .fill({ color: 0x5d7d5a, alpha: 1 });

  top
    .moveTo(0, -halfH)
    .lineTo(halfW, 0)
    .lineTo(0, halfH)
    .lineTo(-halfW, 0)
    .lineTo(0, -halfH)
    .fill({ color: 0x7fb073, alpha: 1 })
    .stroke({ width: 1, color: 0xdaf2c9, alpha: 0.55 });

  node.addChild(side, top);
  return node;
}

function renderRoof(): Container {
  const node = new Container();
  const roof = new Graphics();
  const ridge = new Graphics();
  const halfW = ISO_TILE_WIDTH / 2 + 6;
  const halfH = ISO_TILE_HEIGHT / 2 + 3;
  const lift = 12;

  roof
    .moveTo(0, -halfH - lift)
    .lineTo(halfW, -lift)
    .lineTo(0, halfH - lift)
    .lineTo(-halfW, -lift)
    .lineTo(0, -halfH - lift)
    .fill({ color: 0xb84e43, alpha: 1 })
    .stroke({ width: 1, color: 0xffc1a8, alpha: 0.52 });

  ridge
    .moveTo(0, -halfH - lift)
    .lineTo(0, halfH - lift)
    .stroke({ width: 2, color: 0x7f2d2a, alpha: 0.7 });

  node.addChild(roof, ridge);
  return node;
}

function renderThinWall(rotation: BuildRotation): Container {
  const node = new Container();
  const wall = new Graphics();
  const points = getEdgeSegment(rotation);
  const height = ISO_LAYER_HEIGHT + 18;
  const normal = getWallNormal(rotation);
  const depth = 4;
  const ax = points.a.x + normal.x * depth;
  const ay = points.a.y + normal.y * depth;
  const bx = points.b.x + normal.x * depth;
  const by = points.b.y + normal.y * depth;

  wall
    .moveTo(points.a.x, points.a.y)
    .lineTo(points.b.x, points.b.y)
    .lineTo(bx, by - height)
    .lineTo(ax, ay - height)
    .lineTo(points.a.x, points.a.y)
    .fill({ color: 0x8b6b4f, alpha: 1 })
    .stroke({ width: 1, color: 0xe1c19f, alpha: 0.45 });

  const cap = new Graphics();
  cap
    .moveTo(ax, ay - height)
    .lineTo(bx, by - height)
    .lineTo(points.b.x, points.b.y - height - 3)
    .lineTo(points.a.x, points.a.y - height - 3)
    .lineTo(ax, ay - height)
    .fill({ color: 0xa78260, alpha: 1 });

  node.addChild(wall, cap);
  return node;
}

function renderDoor(rotation: BuildRotation, open: boolean): Container {
  const node = new Container();
  const frame = renderThinWall(rotation);
  frame.alpha = 0.92;

  const segment = getEdgeSegment(rotation);
  const door = new Graphics();
  const height = ISO_LAYER_HEIGHT + 10;
  const inset = 8;
  const a = interpolate(segment.a, segment.b, 0.25);
  const b = interpolate(segment.a, segment.b, 0.75);

  if (open) {
    const hinge = a;
    const swing = rotateAround(b, hinge, rotation % 2 === 0 ? -0.75 : 0.75);
    door
      .moveTo(hinge.x, hinge.y)
      .lineTo(swing.x, swing.y)
      .lineTo(swing.x, swing.y - height)
      .lineTo(hinge.x, hinge.y - height)
      .lineTo(hinge.x, hinge.y)
      .fill({ color: 0x7a4a2a, alpha: 0.82 })
      .stroke({ width: 1, color: 0xf0d0a0, alpha: 0.62 });
  } else {
    door
      .moveTo(a.x, a.y - inset)
      .lineTo(b.x, b.y - inset)
      .lineTo(b.x, b.y - height)
      .lineTo(a.x, a.y - height)
      .lineTo(a.x, a.y - inset)
      .fill({ color: 0x6e3f24, alpha: 1 })
      .stroke({ width: 1, color: 0xf0d0a0, alpha: 0.58 });
  }

  const knob = new Graphics();
  const knobPoint = interpolate(a, b, open ? 0.8 : 0.68);
  knob.circle(knobPoint.x, knobPoint.y - height * 0.48, 2).fill({ color: 0xffd166, alpha: 1 });

  node.addChild(frame, door, knob);
  return node;
}

function renderWindow(rotation: BuildRotation): Container {
  const node = renderThinWall(rotation);
  const segment = getEdgeSegment(rotation);
  const pane = new Graphics();
  const height = ISO_LAYER_HEIGHT + 18;
  const a = interpolate(segment.a, segment.b, 0.3);
  const b = interpolate(segment.a, segment.b, 0.7);
  const topY = -height * 0.72;
  const bottomY = -height * 0.34;

  pane
    .moveTo(a.x, a.y + bottomY)
    .lineTo(b.x, b.y + bottomY)
    .lineTo(b.x, b.y + topY)
    .lineTo(a.x, a.y + topY)
    .lineTo(a.x, a.y + bottomY)
    .fill({ color: 0x83d9ff, alpha: 0.78 })
    .stroke({ width: 1, color: 0xe9fbff, alpha: 0.84 });

  node.addChild(pane);
  return node;
}

function renderPillar(rotation: BuildRotation): Container {
  const node = new Container();
  const pillar = new Graphics();
  const pos = getCornerPoint(rotation);
  const width = 8;
  const height = ISO_LAYER_HEIGHT + 22;

  pillar
    .rect(pos.x - width / 2, pos.y - height, width, height)
    .fill({ color: 0x7a6149, alpha: 1 })
    .stroke({ width: 1, color: 0xd2b28c, alpha: 0.58 });

  const cap = new Graphics();
  cap
    .ellipse(pos.x, pos.y - height, width * 0.8, 3)
    .fill({ color: 0x9a7855, alpha: 1 });

  node.addChild(pillar, cap);
  return node;
}

function getPartLayerOffset(part: PlacedBuildPart): number {
  switch (part.partId) {
    case 'floor_1x1':
      return 10;
    case 'pillar':
      return 180 + part.rotation;
    case 'thin_wall':
    case 'door':
    case 'window':
      return 220 + part.rotation;
    case 'roof_1x1':
      return 320;
    default:
      return 100;
  }
}

function getEdgeSegment(rotation: BuildRotation): { a: Point; b: Point } {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const north = { x: 0, y: -halfH };
  const east = { x: halfW, y: 0 };
  const south = { x: 0, y: halfH };
  const west = { x: -halfW, y: 0 };

  switch (rotation) {
    case 0:
      return { a: west, b: north };
    case 1:
      return { a: north, b: east };
    case 2:
      return { a: east, b: south };
    case 3:
      return { a: south, b: west };
  }
}

function getCornerPoint(rotation: BuildRotation): Point {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;

  switch (rotation) {
    case 0:
      return { x: -halfW, y: 0 };
    case 1:
      return { x: 0, y: -halfH };
    case 2:
      return { x: halfW, y: 0 };
    case 3:
      return { x: 0, y: halfH };
  }
}

function getWallNormal(rotation: BuildRotation): Point {
  switch (rotation) {
    case 0:
      return { x: -0.35, y: -0.35 };
    case 1:
      return { x: 0.35, y: -0.35 };
    case 2:
      return { x: 0.35, y: 0.35 };
    case 3:
      return { x: -0.35, y: 0.35 };
  }
}

function interpolate(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function rotateAround(point: Point, pivot: Point, radians: number): Point {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

type Point = {
  x: number;
  y: number;
};
