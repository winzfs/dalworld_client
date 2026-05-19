import { Container, Graphics } from 'pixi.js';
import { BUILD_PARTS } from './BuildingParts';
import { getIsoZIndex, gridToScreen, ISO_LAYER_HEIGHT, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
import type { BuildPartId, BuildRotation, BuildingSnapshot, PlacedBuildPart } from './BuildingTypes';

type RenderPalette = { primary: number; secondary: number; accent: number };
type Point = { x: number; y: number };
type LocalPoint = { u: number; v: number };

export type BuildingOcclusionFocus = { worldX: number; worldY: number; z?: number };

const BUILDING_NORMAL_ALPHA = 1;
const BUILDING_OCCLUDING_ALPHA = 0.42;
const FLOOR_THICKNESS_WOOD = 8;
const FLOOR_THICKNESS_STONE = 10;
const WALL_RENDER_HEIGHT = ISO_LAYER_HEIGHT;
const DOOR_RENDER_HEIGHT = ISO_LAYER_HEIGHT - 8;
const PILLAR_RENDER_HEIGHT = ISO_LAYER_HEIGHT;
const WALL_POST_WIDTH = 5;
const WALL_OCCLUSION_PADDING = 14;
const PILLAR_OCCLUSION_RADIUS = 18;
const ROOF_OCCLUSION_PADDING = 8;
const OCCLUSION_LAYER_PENALTY = 8;
const ROUND_SEGMENT_STEPS = 14;

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
    for (const entityId of this.nodes.keys()) if (!aliveIds.has(entityId)) this.remove(entityId);
    for (const part of snapshot.parts) this.addOrUpdate(part);
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
    if (!definition) return;

    switch (definition.category) {
      case 'floor':
        node.addChild(renderFloor(part.partId, part.rotation));
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

  applyOcclusionFocus(focus: BuildingOcclusionFocus | null): void {
    if (!focus) {
      this.resetAlpha();
      return;
    }
    for (const [entityId, node] of this.nodes) {
      const part = this.parts.get(entityId);
      const definition = part ? BUILD_PARTS[part.partId] : null;
      if (!part || !definition || definition.category === 'floor') {
        node.alpha = BUILDING_NORMAL_ALPHA;
        continue;
      }
      node.alpha = isPartOccludingFocus(part, focus) ? BUILDING_OCCLUDING_ALPHA : BUILDING_NORMAL_ALPHA;
    }
  }

  isOccludingFocus(focus: BuildingOcclusionFocus): boolean {
    for (const part of this.parts.values()) {
      const definition = BUILD_PARTS[part.partId];
      if (!definition || definition.category === 'floor') continue;
      if (isPartOccludingFocus(part, focus)) return true;
    }
    return false;
  }

  resetAlpha(): void {
    for (const node of this.nodes.values()) node.alpha = BUILDING_NORMAL_ALPHA;
  }

  updateDoor(entityId: string, open: boolean): void {
    const part = this.parts.get(entityId);
    if (!part) return;
    const definition = BUILD_PARTS[part.partId];
    if (definition?.category !== 'door') return;
    this.addOrUpdate({ ...part, state: { ...part.state, open } });
  }

  remove(entityId: string): void {
    const node = this.nodes.get(entityId);
    if (!node) return;
    node.destroy({ children: true });
    this.nodes.delete(entityId);
    this.parts.delete(entityId);
  }

  clear(): void {
    for (const node of this.nodes.values()) node.destroy({ children: true });
    this.nodes.clear();
    this.parts.clear();
  }
}

function renderFloor(partId: BuildPartId, rotation: BuildRotation): Container {
  if (partId === 'wood_stairs' || partId === 'stone_stairs') return renderStairs(partId, rotation);
  if (partId === 'wood_round_floor' || partId === 'stone_round_floor') return renderRoundFloor(partId, rotation);

  const node = new Container();
  const top = new Graphics();
  const side = new Graphics();
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const thickness = partId === 'stone_floor_1x1' ? FLOOR_THICKNESS_STONE : FLOOR_THICKNESS_WOOD;
  const palette = getPalette(partId);

  side.moveTo(-halfW, 0).lineTo(0, halfH).lineTo(halfW, 0).lineTo(halfW, thickness).lineTo(0, halfH + thickness).lineTo(-halfW, thickness).lineTo(-halfW, 0).fill({ color: palette.secondary, alpha: 1 });
  top.moveTo(0, -halfH).lineTo(halfW, 0).lineTo(0, halfH).lineTo(-halfW, 0).lineTo(0, -halfH).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.55 });

  if (partId === 'deck_floor_1x1') {
    const lines = new Graphics();
    for (let i = -2; i <= 2; i += 1) lines.moveTo(-halfW + 10, i * 5).lineTo(halfW - 10, i * 5).stroke({ width: 1, color: 0x5b3d25, alpha: 0.32 });
    node.addChild(side, top, lines);
    return node;
  }

  node.addChild(side, top);
  return node;
}

function renderRoundFloor(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const side = new Graphics();
  const top = new Graphics();
  const seam = new Graphics();
  const palette = getPalette(partId);
  const thickness = partId === 'stone_round_floor' ? FLOOR_THICKNESS_STONE : FLOOR_THICKNESS_WOOD;
  const polygon = getQuarterDiskPoints(rotation);
  const center = getRoundPieceCenterCorner(rotation);
  const arc = getQuarterDiskArcPoints(rotation);

  drawPolygon(side, polygon.map((p) => ({ x: p.x, y: p.y + thickness })), palette.secondary, 0.9);
  drawPolygon(top, polygon, palette.primary, 1);
  top.stroke({ width: 1, color: palette.accent, alpha: 0.65 });
  seam.moveTo(center.x, center.y).lineTo(arc[0].x, arc[0].y).stroke({ width: 1, color: palette.accent, alpha: 0.28 }).moveTo(center.x, center.y).lineTo(arc[arc.length - 1].x, arc[arc.length - 1].y).stroke({ width: 1, color: palette.accent, alpha: 0.28 });
  node.addChild(side, top, seam);
  return node;
}

function renderStairs(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const body = new Graphics();
  const lines = new Graphics();
  const palette = getPalette(partId);
  const base = getStairBasePolygon(rotation);
  const rise = ISO_LAYER_HEIGHT * 0.72;

  body.moveTo(base.lowA.x, base.lowA.y).lineTo(base.lowB.x, base.lowB.y).lineTo(base.highB.x, base.highB.y - rise).lineTo(base.highA.x, base.highA.y - rise).lineTo(base.lowA.x, base.lowA.y).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.55 });
  body.moveTo(base.lowB.x, base.lowB.y).lineTo(base.highB.x, base.highB.y - rise).lineTo(base.highB.x, base.highB.y).lineTo(base.lowB.x, base.lowB.y).fill({ color: palette.secondary, alpha: 0.88 });
  for (let i = 1; i <= 5; i += 1) {
    const t = i / 5;
    const left = interpolate3d(base.lowA, base.highA, t, rise * t);
    const right = interpolate3d(base.lowB, base.highB, t, rise * t);
    lines.moveTo(left.x, left.y).lineTo(right.x, right.y).stroke({ width: 2, color: palette.accent, alpha: 0.42 });
  }
  node.addChild(body, lines);
  return node;
}

function renderWallVariant(partId: BuildPartId, rotation: BuildRotation): Container {
  if (partId === 'wood_round_wall' || partId === 'stone_round_wall') return renderRoundWall(partId, rotation);
  if (partId === 'railing' || partId === 'fence') return renderFenceLike(partId, rotation);
  return renderWallSlab(partId, rotation, partId === 'half_wall' ? WALL_RENDER_HEIGHT * 0.62 : WALL_RENDER_HEIGHT);
}

function renderRoundWall(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const wall = new Graphics();
  const cap = new Graphics();
  const posts = new Graphics();
  const palette = getPalette(partId);
  const base = getQuarterDiskArcPoints(rotation);
  const top = base.map((p) => ({ x: p.x, y: p.y - WALL_RENDER_HEIGHT }));

  for (let i = 0; i < base.length - 1; i += 1) {
    const a = base[i];
    const b = base[i + 1];
    const ta = top[i];
    const tb = top[i + 1];
    wall.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(tb.x, tb.y).lineTo(ta.x, ta.y).lineTo(a.x, a.y).fill({ color: i % 2 === 0 ? palette.primary : palette.secondary, alpha: 0.96 }).stroke({ width: 1, color: palette.accent, alpha: 0.22 });
  }
  for (let i = 0; i < top.length - 1; i += 1) cap.moveTo(top[i].x, top[i].y).lineTo(top[i + 1].x, top[i + 1].y);
  cap.stroke({ width: 4, color: palette.secondary, alpha: 0.96 });
  drawVerticalPost(posts, base[0], WALL_RENDER_HEIGHT, palette.secondary);
  drawVerticalPost(posts, base[base.length - 1], WALL_RENDER_HEIGHT, palette.secondary);
  node.addChild(wall, posts, cap);
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
  roof.moveTo(0, -halfH - lift).lineTo(halfW, -lift).lineTo(0, halfH - lift).lineTo(-halfW, -lift).lineTo(0, -halfH - lift).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.52 });
  if (partId !== 'flat_roof_1x1') ridge.moveTo(0, -halfH - lift).lineTo(0, halfH - lift).stroke({ width: 2, color: palette.secondary, alpha: 0.7 });
  node.addChild(roof, ridge);
  return node;
}

function renderWallSlab(partId: BuildPartId, rotation: BuildRotation, height: number): Container {
  const node = new Container();
  const panel = new Graphics();
  const postA = new Graphics();
  const postB = new Graphics();
  const cap = new Graphics();
  const points = getEdgeSegment(rotation);
  const palette = getPalette(partId);
  const a = trimToward(points.a, points.b, 0.12);
  const b = trimToward(points.b, points.a, 0.12);
  const topA = { x: a.x, y: a.y - height };
  const topB = { x: b.x, y: b.y - height };
  panel.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(topB.x, topB.y).lineTo(topA.x, topA.y).lineTo(a.x, a.y).fill({ color: palette.primary, alpha: 0.95 });
  drawVerticalPost(postA, points.a, height, palette.secondary);
  drawVerticalPost(postB, points.b, height, palette.secondary);
  cap.moveTo(topA.x, topA.y).lineTo(topB.x, topB.y).stroke({ width: 4, color: palette.secondary, alpha: 0.96 }).moveTo(points.a.x, points.a.y - height).lineTo(points.b.x, points.b.y - height).stroke({ width: 1, color: palette.accent, alpha: 0.65 });
  panel.stroke({ width: 1, color: palette.accent, alpha: 0.35 });
  node.addChild(panel, postA, postB, cap);
  return node;
}

function renderFenceLike(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const segment = getEdgeSegment(rotation);
  const palette = getPalette(partId);
  const rail = new Graphics();
  const height = partId === 'fence' ? 26 : 20;
  const a = interpolate(segment.a, segment.b, 0.12);
  const b = interpolate(segment.a, segment.b, 0.88);
  rail.moveTo(a.x, a.y - height * 0.72).lineTo(b.x, b.y - height * 0.72).stroke({ width: 4, color: palette.primary, alpha: 1 }).moveTo(a.x, a.y - height * 0.34).lineTo(b.x, b.y - height * 0.34).stroke({ width: 3, color: palette.secondary, alpha: 1 });
  for (const point of [a, b, interpolate(a, b, 0.5)]) node.addChild(new Graphics().rect(point.x - 3, point.y - height, 6, height).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.45 }));
  node.addChild(rail);
  return node;
}

function renderDoor(partId: BuildPartId, rotation: BuildRotation, open: boolean): Container {
  const node = new Container();
  const frame = renderWallSlab(partId === 'stone_door' ? 'stone_wall' : 'thin_wall', rotation, WALL_RENDER_HEIGHT);
  frame.alpha = 0.82;
  const segment = getEdgeSegment(rotation);
  const door = new Graphics();
  const a = interpolate(segment.a, segment.b, 0.25);
  const b = interpolate(segment.a, segment.b, 0.75);
  const palette = getPalette(partId);
  if (open) {
    const swing = rotateAround(b, a, rotation % 2 === 0 ? -0.75 : 0.75);
    door.moveTo(a.x, a.y).lineTo(swing.x, swing.y).lineTo(swing.x, swing.y - DOOR_RENDER_HEIGHT).lineTo(a.x, a.y - DOOR_RENDER_HEIGHT).lineTo(a.x, a.y).fill({ color: palette.primary, alpha: 0.82 }).stroke({ width: 1, color: palette.accent, alpha: 0.62 });
  } else {
    door.moveTo(a.x, a.y - 8).lineTo(b.x, b.y - 8).lineTo(b.x, b.y - DOOR_RENDER_HEIGHT).lineTo(a.x, a.y - DOOR_RENDER_HEIGHT).lineTo(a.x, a.y - 8).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.58 });
  }
  const knobPoint = interpolate(a, b, open ? 0.8 : 0.68);
  const knob = new Graphics().circle(knobPoint.x, knobPoint.y - DOOR_RENDER_HEIGHT * 0.48, 2).fill({ color: 0xffd166, alpha: 1 });
  node.addChild(frame, door, knob);
  return node;
}

function renderWindow(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = renderWallSlab(partId === 'wide_window' ? 'stone_wall' : 'thin_wall', rotation, WALL_RENDER_HEIGHT);
  const segment = getEdgeSegment(rotation);
  const pane = new Graphics();
  const a = interpolate(segment.a, segment.b, partId === 'wide_window' ? 0.2 : 0.3);
  const b = interpolate(segment.a, segment.b, partId === 'wide_window' ? 0.8 : 0.7);
  pane.moveTo(a.x, a.y - WALL_RENDER_HEIGHT * 0.34).lineTo(b.x, b.y - WALL_RENDER_HEIGHT * 0.34).lineTo(b.x, b.y - WALL_RENDER_HEIGHT * 0.72).lineTo(a.x, a.y - WALL_RENDER_HEIGHT * 0.72).lineTo(a.x, a.y - WALL_RENDER_HEIGHT * 0.34).fill({ color: 0x83d9ff, alpha: 0.78 }).stroke({ width: 1, color: 0xe9fbff, alpha: 0.84 });
  node.addChild(pane);
  return node;
}

function renderPillar(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const pos = getCornerPoint(rotation);
  const width = partId === 'short_post' ? 7 : partId === 'stone_pillar' ? 10 : 8;
  const height = partId === 'short_post' ? 22 : PILLAR_RENDER_HEIGHT;
  const palette = getPalette(partId);
  const pillar = new Graphics().rect(pos.x - width / 2, pos.y - height, width, height).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.58 });
  const cap = new Graphics().ellipse(pos.x, pos.y - height, width * 0.8, 3).fill({ color: palette.secondary, alpha: 1 });
  node.addChild(pillar, cap);
  return node;
}

function getPartLayerOffset(part: PlacedBuildPart): number {
  const definition = BUILD_PARTS[part.partId];
  switch (definition?.category) {
    case 'floor':
      return part.partId === 'wood_stairs' || part.partId === 'stone_stairs' ? 95 + part.rotation : 10;
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

function isPartOccludingFocus(part: PlacedBuildPart, focus: BuildingOcclusionFocus): boolean {
  const definition = BUILD_PARTS[part.partId];
  if (!definition) return false;
  const origin = gridToScreen(part.x, part.y, part.z);
  const focusY = focus.worldY + (part.z - (focus.z ?? 0)) * OCCLUSION_LAYER_PENALTY;
  switch (definition.category) {
    case 'wall':
    case 'door':
    case 'window':
      return isEdgeStructureOccludingFocus(origin, part.rotation, focus.worldX, focusY, WALL_RENDER_HEIGHT);
    case 'support':
      return isPillarOccludingFocus(origin, part.rotation, focus.worldX, focusY, PILLAR_RENDER_HEIGHT);
    case 'roof':
      return isRoofOccludingFocus(origin, focus.worldX, focusY);
    default:
      return false;
  }
}

function isEdgeStructureOccludingFocus(origin: Point, rotation: BuildRotation, focusX: number, focusY: number, height: number): boolean {
  const segment = getEdgeSegment(rotation);
  const a = { x: origin.x + segment.a.x, y: origin.y + segment.a.y };
  const b = { x: origin.x + segment.b.x, y: origin.y + segment.b.y };
  const baseMinY = Math.min(a.y, b.y);
  const baseMaxY = Math.max(a.y, b.y);
  if (focusY < baseMinY - height || focusY > baseMaxY + WALL_OCCLUSION_PADDING) return false;
  if (distancePointToVerticalSegmentBand(focusX, focusY, a, b, height) > WALL_OCCLUSION_PADDING) return false;
  return focusY <= baseMaxY + 2;
}

function isPillarOccludingFocus(origin: Point, rotation: BuildRotation, focusX: number, focusY: number, height: number): boolean {
  const local = getCornerPoint(rotation);
  const point = { x: origin.x + local.x, y: origin.y + local.y };
  if (focusY < point.y - height || focusY > point.y + PILLAR_OCCLUSION_RADIUS) return false;
  return distancePointToSegment(focusX, focusY, point, { x: point.x, y: point.y - height }) <= PILLAR_OCCLUSION_RADIUS;
}

function isRoofOccludingFocus(origin: Point, focusX: number, focusY: number): boolean {
  const halfW = ISO_TILE_WIDTH / 2 + ROOF_OCCLUSION_PADDING;
  const halfH = ISO_TILE_HEIGHT / 2 + ROOF_OCCLUSION_PADDING;
  if (focusY > origin.y + halfH) return false;
  return Math.abs(focusX - origin.x) / halfW + Math.abs(focusY - (origin.y - 8)) / halfH <= 1.2;
}

function distancePointToVerticalSegmentBand(px: number, py: number, a: Point, b: Point, height: number): number {
  return Math.min(
    distancePointToSegment(px, py, a, b),
    distancePointToSegment(px, py, { x: a.x, y: a.y - height }, { x: b.x, y: b.y - height }),
    distancePointToSegment(px, py, a, { x: a.x, y: a.y - height }),
    distancePointToSegment(px, py, b, { x: b.x, y: b.y - height }),
  );
}

function getPalette(partId: BuildPartId): RenderPalette {
  switch (partId) {
    case 'stone_floor_1x1':
    case 'stone_wall':
    case 'stone_pillar':
    case 'stone_door':
    case 'stone_stairs':
    case 'stone_round_floor':
    case 'stone_round_wall':
      return { primary: 0x7c8185, secondary: 0x5f666b, accent: 0xd7dde2 };
    case 'deck_floor_1x1':
      return { primary: 0xb07a43, secondary: 0x7b4f2d, accent: 0xf0c48f };
    case 'half_wall':
    case 'railing':
    case 'fence':
    case 'short_post':
    case 'wood_stairs':
    case 'wood_round_floor':
    case 'wood_round_wall':
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

function getQuarterDiskPoints(rotation: BuildRotation): Point[] {
  const center = getRoundPieceCenterCorner(rotation);
  return [center, ...getQuarterDiskArcPoints(rotation)];
}

function getQuarterDiskArcPoints(rotation: BuildRotation): Point[] {
  const definition = getRoundQuarterDefinition(rotation);
  const points: Point[] = [];
  for (let i = 0; i <= ROUND_SEGMENT_STEPS; i += 1) {
    const angle = definition.startAngle + (definition.endAngle - definition.startAngle) * (i / ROUND_SEGMENT_STEPS);
    points.push(localSquareToIso({ u: definition.center.u + Math.cos(angle), v: definition.center.v + Math.sin(angle) }));
  }
  return points;
}

function getRoundPieceCenterCorner(rotation: BuildRotation): Point {
  return localSquareToIso(getRoundQuarterDefinition(rotation).center);
}

function getRoundQuarterDefinition(rotation: BuildRotation): { center: LocalPoint; startAngle: number; endAngle: number } {
  switch (rotation) {
    case 0:
      return { center: { u: 1, v: 1 }, startAngle: Math.PI, endAngle: Math.PI * 1.5 };
    case 1:
      return { center: { u: 0, v: 1 }, startAngle: -Math.PI / 2, endAngle: 0 };
    case 2:
      return { center: { u: 0, v: 0 }, startAngle: 0, endAngle: Math.PI / 2 };
    case 3:
      return { center: { u: 1, v: 0 }, startAngle: Math.PI / 2, endAngle: Math.PI };
  }
}

function localSquareToIso(point: LocalPoint): Point {
  return { x: (point.u - point.v) * (ISO_TILE_WIDTH / 2), y: (point.u + point.v - 1) * (ISO_TILE_HEIGHT / 2) };
}

function getStairBasePolygon(rotation: BuildRotation): { lowA: Point; lowB: Point; highA: Point; highB: Point } {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const north = { x: 0, y: -halfH };
  const east = { x: halfW, y: 0 };
  const south = { x: 0, y: halfH };
  const west = { x: -halfW, y: 0 };
  switch (rotation) {
    case 0:
      return { lowA: south, lowB: east, highA: west, highB: north };
    case 1:
      return { lowA: west, lowB: south, highA: north, highB: east };
    case 2:
      return { lowA: north, lowB: west, highA: east, highB: south };
    case 3:
      return { lowA: east, lowB: north, highA: south, highB: west };
  }
}

function drawPolygon(graphics: Graphics, points: Point[], color: number, alpha: number): void {
  if (points.length === 0) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.lineTo(points[0].x, points[0].y).fill({ color, alpha });
}

function drawVerticalPost(g: Graphics, point: Point, height: number, color: number): void {
  g.roundRect(point.x - WALL_POST_WIDTH / 2, point.y - height, WALL_POST_WIDTH, height, 1.5).fill({ color, alpha: 1 });
}

function trimToward(from: Point, to: Point, ratio: number): Point {
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

function interpolate(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function interpolate3d(a: Point, b: Point, t: number, zLift: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - zLift };
}

function rotateAround(point: Point, pivot: Point, radians: number): Point {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

function distancePointToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(px, py, a.x, a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
  return distance(px, py, a.x + t * dx, a.y + t * dy);
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
