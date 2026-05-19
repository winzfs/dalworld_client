import { Container, Graphics } from 'pixi.js';
import { BUILD_PARTS } from './BuildingParts';
import { getIsoZIndex, gridToScreen, ISO_LAYER_HEIGHT, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
import type { BuildPartId, BuildRotation, BuildingSnapshot, PlacedBuildPart } from './BuildingTypes';

type RenderPalette = {
  primary: number;
  secondary: number;
  accent: number;
};

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
    const definition = BUILD_PARTS[part.partId];
    node.x = screen.x;
    node.y = screen.y;
    node.zIndex = getIsoZIndex(part.x, part.y, part.z, getPartLayerOffset(part));

    if (!definition) {
      return;
    }

    switch (definition.category) {
      case 'floor':
        node.addChild(renderFloor(part.partId));
        return;
      case 'wall':
        node.addChild(renderWallVariant(part.partId, part.rotation));
        return;
      case 'roof':
        node.addChild(renderRoof(part.partId));
        return;
      case 'support':
        node.addChild(renderPillar(part.partId, part.rotation));
        return;
      case 'door':
        node.addChild(renderDoor(part.partId, part.rotation, Boolean(part.state?.open)));
        return;
      case 'window':
        node.addChild(renderWindow(part.partId, part.rotation));
        return;
    }
  }

  updateDoor(entityId: string, open: boolean): void {
    const part = this.parts.get(entityId);

    if (!part) {
      return;
    }

    const definition = BUILD_PARTS[part.partId];
    if (definition?.category !== 'door') {
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

function renderFloor(partId: BuildPartId): Container {
  const node = new Container();
  const top = new Graphics();
  const side = new Graphics();
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const thickness = partId === 'stone_floor_1x1' ? 10 : 8;
  const palette = getPalette(partId);

  side
    .moveTo(-halfW, 0)
    .lineTo(0, halfH)
    .lineTo(halfW, 0)
    .lineTo(halfW, thickness)
    .lineTo(0, halfH + thickness)
    .lineTo(-halfW, thickness)
    .lineTo(-halfW, 0)
    .fill({ color: palette.secondary, alpha: 1 });

  top
    .moveTo(0, -halfH)
    .lineTo(halfW, 0)
    .lineTo(0, halfH)
    .lineTo(-halfW, 0)
    .lineTo(0, -halfH)
    .fill({ color: palette.primary, alpha: 1 })
    .stroke({ width: 1, color: palette.accent, alpha: 0.55 });

  if (partId === 'deck_floor_1x1') {
    const lines = new Graphics();
    for (let i = -2; i <= 2; i += 1) {
      lines
        .moveTo(-halfW + 10, i * 5)
        .lineTo(halfW - 10, i * 5)
        .stroke({ width: 1, color: 0x5b3d25, alpha: 0.32 });
    }
    node.addChild(side, top, lines);
    return node;
  }

  node.addChild(side, top);
  return node;
}

function renderRoof(partId: BuildPartId): Container {
  const node = new Container();
  const roof = new Graphics();
  const ridge = new Graphics();
  const halfW = ISO_TILE_WIDTH / 2 + 6;
  const halfH = ISO_TILE_HEIGHT / 2 + 3;
  const lift = partId === 'flat_roof_1x1' ? 4 : 12;
  const palette = getPalette(partId);

  roof
    .moveTo(0, -halfH - lift)
    .lineTo(halfW, -lift)
    .lineTo(0, halfH - lift)
    .lineTo(-halfW, -lift)
    .lineTo(0, -halfH - lift)
    .fill({ color: palette.primary, alpha: 1 })
    .stroke({ width: 1, color: palette.accent, alpha: 0.52 });

  if (partId !== 'flat_roof_1x1') {
    ridge
      .moveTo(0, -halfH - lift)
      .lineTo(0, halfH - lift)
      .stroke({ width: 2, color: palette.secondary, alpha: 0.7 });
  }

  node.addChild(roof, ridge);
  return node;
}

function renderWallVariant(partId: BuildPartId, rotation: BuildRotation): Container {
  if (partId === 'railing' || partId === 'fence') {
    return renderFenceLike(partId, rotation);
  }

  const height = partId === 'half_wall' ? ISO_LAYER_HEIGHT * 0.62 : ISO_LAYER_HEIGHT + 18;
  return renderWallSlab(partId, rotation, height);
}

function renderWallSlab(partId: BuildPartId, rotation: BuildRotation, height: number): Container {
  const node = new Container();
  const wall = new Graphics();
  const points = getEdgeSegment(rotation);
  const normal = getWallNormal(rotation);
  const depth = partId === 'stone_wall' ? 6 : 4;
  const palette = getPalette(partId);
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
    .fill({ color: palette.primary, alpha: 1 })
    .stroke({ width: 1, color: palette.accent, alpha: 0.45 });

  const cap = new Graphics();
  cap
    .moveTo(ax, ay - height)
    .lineTo(bx, by - height)
    .lineTo(points.b.x, points.b.y - height - 3)
    .lineTo(points.a.x, points.a.y - height - 3)
    .lineTo(ax, ay - height)
    .fill({ color: palette.secondary, alpha: 1 });

  node.addChild(wall, cap);
  return node;
}

function renderFenceLike(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const segment = getEdgeSegment(rotation);
  const palette = getPalette(partId);
  const rail = new Graphics();
  const postA = new Graphics();
  const postB = new Graphics();
  const height = partId === 'fence' ? 26 : 20;
  const a = interpolate(segment.a, segment.b, 0.12);
  const b = interpolate(segment.a, segment.b, 0.88);

  rail
    .moveTo(a.x, a.y - height * 0.72)
    .lineTo(b.x, b.y - height * 0.72)
    .stroke({ width: 4, color: palette.primary, alpha: 1 })
    .moveTo(a.x, a.y - height * 0.34)
    .lineTo(b.x, b.y - height * 0.34)
    .stroke({ width: 3, color: palette.secondary, alpha: 1 });

  for (const [index, point] of [a, b, interpolate(a, b, 0.5)].entries()) {
    const post = index === 0 ? postA : index === 1 ? postB : new Graphics();
    post
      .rect(point.x - 3, point.y - height, 6, height)
      .fill({ color: palette.primary, alpha: 1 })
      .stroke({ width: 1, color: palette.accent, alpha: 0.45 });
    node.addChild(post);
  }

  node.addChild(rail);
  return node;
}

function renderDoor(partId: BuildPartId, rotation: BuildRotation, open: boolean): Container {
  const node = new Container();
  const frame = renderWallSlab(partId === 'stone_door' ? 'stone_wall' : 'thin_wall', rotation, ISO_LAYER_HEIGHT + 18);
  frame.alpha = 0.82;

  const segment = getEdgeSegment(rotation);
  const door = new Graphics();
  const height = ISO_LAYER_HEIGHT + 10;
  const inset = 8;
  const a = interpolate(segment.a, segment.b, 0.25);
  const b = interpolate(segment.a, segment.b, 0.75);
  const palette = getPalette(partId);

  if (open) {
    const hinge = a;
    const swing = rotateAround(b, hinge, rotation % 2 === 0 ? -0.75 : 0.75);
    door
      .moveTo(hinge.x, hinge.y)
      .lineTo(swing.x, swing.y)
      .lineTo(swing.x, swing.y - height)
      .lineTo(hinge.x, hinge.y - height)
      .lineTo(hinge.x, hinge.y)
      .fill({ color: palette.primary, alpha: 0.82 })
      .stroke({ width: 1, color: palette.accent, alpha: 0.62 });
  } else {
    door
      .moveTo(a.x, a.y - inset)
      .lineTo(b.x, b.y - inset)
      .lineTo(b.x, b.y - height)
      .lineTo(a.x, a.y - height)
      .lineTo(a.x, a.y - inset)
      .fill({ color: palette.primary, alpha: 1 })
      .stroke({ width: 1, color: palette.accent, alpha: 0.58 });
  }

  const knob = new Graphics();
  const knobPoint = interpolate(a, b, open ? 0.8 : 0.68);
  knob.circle(knobPoint.x, knobPoint.y - height * 0.48, 2).fill({ color: 0xffd166, alpha: 1 });

  node.addChild(frame, door, knob);
  return node;
}

function renderWindow(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = renderWallSlab(partId === 'wide_window' ? 'stone_wall' : 'thin_wall', rotation, ISO_LAYER_HEIGHT + 18);
  const segment = getEdgeSegment(rotation);
  const pane = new Graphics();
  const height = ISO_LAYER_HEIGHT + 18;
  const a = interpolate(segment.a, segment.b, partId === 'wide_window' ? 0.2 : 0.3);
  const b = interpolate(segment.a, segment.b, partId === 'wide_window' ? 0.8 : 0.7);
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

function renderPillar(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const pillar = new Graphics();
  const pos = getCornerPoint(rotation);
  const width = partId === 'short_post' ? 7 : partId === 'stone_pillar' ? 10 : 8;
  const height = partId === 'short_post' ? 22 : ISO_LAYER_HEIGHT + 22;
  const palette = getPalette(partId);

  pillar
    .rect(pos.x - width / 2, pos.y - height, width, height)
    .fill({ color: palette.primary, alpha: 1 })
    .stroke({ width: 1, color: palette.accent, alpha: 0.58 });

  const cap = new Graphics();
  cap
    .ellipse(pos.x, pos.y - height, width * 0.8, 3)
    .fill({ color: palette.secondary, alpha: 1 });

  node.addChild(pillar, cap);
  return node;
}

function getPartLayerOffset(part: PlacedBuildPart): number {
  const definition = BUILD_PARTS[part.partId];
  switch (definition?.category) {
    case 'floor':
      return 10;
    case 'support':
      return 180 + part.rotation;
    case 'wall':
    case 'door':
    case 'window':
      return 220 + part.rotation;
    case 'roof':
      return 320;
    default:
      return 100;
  }
}

function getPalette(partId: BuildPartId): RenderPalette {
  switch (partId) {
    case 'stone_floor_1x1':
    case 'stone_wall':
    case 'stone_pillar':
    case 'stone_door':
      return { primary: 0x7c8185, secondary: 0x5f666b, accent: 0xd7dde2 };
    case 'deck_floor_1x1':
      return { primary: 0xb07a43, secondary: 0x7b4f2d, accent: 0xf0c48f };
    case 'half_wall':
    case 'railing':
    case 'fence':
    case 'short_post':
      return { primary: 0x9b6a3d, secondary: 0x684326, accent: 0xe7bc85 };
    case 'roof_1x1':
      return { primary: 0xb84e43, secondary: 0x7f2d2a, accent: 0xffc1a8 };
    case 'flat_roof_1x1':
      return { primary: 0x6f7d5d, secondary: 0x4c5a42, accent: 0xbfcda3 };
    case 'thatch_roof_1x1':
      return { primary: 0xcaa85b, secondary: 0x8d6d32, accent: 0xffe4a3 };
    case 'door':
      return { primary: 0x6e3f24, secondary: 0x3e2417, accent: 0xf0d0a0 };
    case 'window':
    case 'wide_window':
      return { primary: 0x8b6b4f, secondary: 0xa78260, accent: 0xe1c19f };
    default:
      return { primary: 0x8b6b4f, secondary: 0xa78260, accent: 0xe1c19f };
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
