import { Container, Graphics } from 'pixi.js';
import { BUILD_PARTS } from './BuildingParts';
import { getIsoZIndex, gridToScreen, ISO_LAYER_HEIGHT, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
import type { BuildPartId, BuildRotation, BuildingSnapshot, PlacedBuildPart } from './BuildingTypes';

type Point = { x: number; y: number };
type Edge = { a: Point; b: Point };
type LocalPoint = { u: number; v: number };
type Palette = { primary: number; secondary: number; accent: number; shadow: number; highlight: number };
type CornerStairLayout = {
  firstLow: Edge;
  firstHigh: Edge;
  secondLow: Edge;
  secondHigh: Edge;
  platform: Point[];
  turn: Point;
};

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
const STRAIGHT_STAIR_RISE = ISO_LAYER_HEIGHT * 0.74;
const CORNER_STAIR_RISE = ISO_LAYER_HEIGHT * 0.74;

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
      case 'floor': node.addChild(renderFloor(part.partId, part.rotation)); return;
      case 'wall': node.addChild(renderWallVariant(part.partId, part.rotation)); return;
      case 'roof': node.addChild(renderRoof(part.partId, part.rotation)); return;
      case 'support': node.addChild(renderSupport(part.partId, part.rotation)); return;
      case 'door': node.addChild(renderDoor(part.partId, part.rotation, Boolean(part.state?.open))); return;
      case 'window': node.addChild(renderWindow(part.partId, part.rotation)); return;
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
    if (!part || BUILD_PARTS[part.partId]?.category !== 'door') return;
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
  if (partId === 'wood_corner_stairs' || partId === 'stone_corner_stairs') return renderCornerStairs(partId, rotation);
  if (partId === 'wood_stair_landing' || partId === 'stone_stair_landing') return renderStairLanding(partId, rotation);
  if (partId === 'wood_round_floor' || partId === 'stone_round_floor') return renderRoundFloor(partId, rotation);
  if (partId === 'wood_half_floor' || partId === 'stone_half_floor') return renderHalfFloor(partId, rotation);

  const node = new Container();
  const palette = getPalette(partId);
  const polygon = getDiamondPoints();
  const thickness = isStoneLike(partId) ? FLOOR_THICKNESS_STONE : FLOOR_THICKNESS_WOOD;
  const side = new Graphics();
  const top = new Graphics();
  const detail = new Graphics();

  drawPolygon(side, polygon.map((p) => ({ x: p.x, y: p.y + thickness })), palette.secondary, 1);
  drawPolygon(top, polygon, palette.primary, 1);
  top.stroke({ width: 1, color: palette.accent, alpha: 0.55 });
  if (isStoneLike(partId)) drawStoneFloorDetail(detail, polygon, palette);
  else drawWoodFloorDetail(detail, polygon, palette, partId === 'deck_floor_1x1');
  node.addChild(side, top, detail);
  return node;
}

function renderStairLanding(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = renderFloorBase(partId, isStoneLike(partId) ? FLOOR_THICKNESS_STONE + 3 : FLOOR_THICKNESS_WOOD + 3);
  const palette = getPalette(partId);
  const accent = new Graphics();
  const edge = getEdgeSegment(rotation);
  const inner = getDiamondPoints().map((p) => ({ x: p.x * 0.72, y: p.y * 0.72 }));

  drawPolygon(accent, inner, palette.highlight, 0.08);
  accent.stroke({ width: 1, color: palette.highlight, alpha: 0.34 });
  accent.moveTo(edge.a.x * 0.82, edge.a.y * 0.82).lineTo(edge.b.x * 0.82, edge.b.y * 0.82).stroke({ width: 3, color: palette.secondary, alpha: 0.72 });
  for (let i = 1; i < 4; i += 1) {
    const p = interpolate(edge.a, edge.b, i / 4);
    accent.circle(p.x * 0.78, p.y * 0.78, 1.4).fill({ color: palette.highlight, alpha: 0.44 });
  }
  node.addChild(accent);
  return node;
}

function renderFloorBase(partId: BuildPartId, thickness: number): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const polygon = getDiamondPoints();
  const side = new Graphics();
  const top = new Graphics();
  const detail = new Graphics();

  drawPolygon(side, polygon.map((p) => ({ x: p.x, y: p.y + thickness })), palette.secondary, 1);
  drawPolygon(top, polygon, palette.primary, 1);
  top.stroke({ width: 1, color: palette.accent, alpha: 0.58 });
  if (isStoneLike(partId)) drawStoneFloorDetail(detail, polygon, palette);
  else drawWoodFloorDetail(detail, polygon, palette, true);
  node.addChild(side, top, detail);
  return node;
}

function renderHalfFloor(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const polygon = getHalfDiamondPoints(rotation);
  const thickness = partId === 'stone_half_floor' ? FLOOR_THICKNESS_STONE : FLOOR_THICKNESS_WOOD;
  const side = new Graphics();
  const top = new Graphics();
  const detail = new Graphics();

  drawPolygon(side, polygon.map((p) => ({ x: p.x, y: p.y + thickness })), palette.secondary, 0.96);
  drawPolygon(top, polygon, palette.primary, 1);
  top.stroke({ width: 1, color: palette.accent, alpha: 0.65 });
  drawHalfFloorDetail(detail, polygon, rotation, palette, isStoneLike(partId));
  node.addChild(side, top, detail);
  return node;
}

function renderRoundFloor(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const polygon = getQuarterDiskPoints(rotation);
  const thickness = partId === 'stone_round_floor' ? FLOOR_THICKNESS_STONE : FLOOR_THICKNESS_WOOD;
  const side = new Graphics();
  const top = new Graphics();
  const detail = new Graphics();
  const center = getRoundPieceCenterCorner(rotation);
  const arc = getQuarterDiskArcPoints(rotation);

  drawPolygon(side, polygon.map((p) => ({ x: p.x, y: p.y + thickness })), palette.secondary, 0.9);
  drawPolygon(top, polygon, palette.primary, 1);
  top.stroke({ width: 1, color: palette.accent, alpha: 0.65 });
  detail.moveTo(center.x, center.y).lineTo(arc[0].x, arc[0].y).stroke({ width: 1, color: palette.accent, alpha: 0.28 });
  detail.moveTo(center.x, center.y).lineTo(arc[arc.length - 1].x, arc[arc.length - 1].y).stroke({ width: 1, color: palette.accent, alpha: 0.28 });
  for (let i = 2; i < arc.length - 2; i += 4) detail.circle(arc[i].x, arc[i].y, 1.2).fill({ color: palette.highlight, alpha: 0.3 });
  node.addChild(side, top, detail);
  return node;
}

function renderStairs(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const steps = 6;
  const lowEdge = getStairLowEdge(rotation);
  const highEdge = getStairHighEdge(rotation);
  const rise = STRAIGHT_STAIR_RISE;

  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const frontA = interpolate3d(lowEdge.a, highEdge.a, t0, rise * t0);
    const frontB = interpolate3d(lowEdge.b, highEdge.b, t0, rise * t0);
    const backA = interpolate3d(lowEdge.a, highEdge.a, t1, rise * t1);
    const backB = interpolate3d(lowEdge.b, highEdge.b, t1, rise * t1);
    drawStep(node, palette, frontA, frontB, backA, backB, i, steps, isStoneLike(partId));
  }

  const railShadow = new Graphics();
  railShadow.moveTo(highEdge.a.x, highEdge.a.y - rise).lineTo(highEdge.b.x, highEdge.b.y - rise).stroke({ width: 2, color: palette.highlight, alpha: 0.42 });
  node.addChild(railShadow);
  return node;
}

function renderCornerStairs(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const stone = isStoneLike(partId);
  const layout = getCornerStairLayout(rotation);
  const halfRise = CORNER_STAIR_RISE * 0.52;

  drawStairRun(node, palette, layout.firstLow, layout.firstHigh, 0, halfRise, 0, stone);
  drawCornerLanding(node, palette, layout.platform, halfRise, stone);
  drawStairRun(node, palette, layout.secondLow, layout.secondHigh, halfRise, CORNER_STAIR_RISE, 3, stone);

  const join = new Graphics();
  const turn = { x: layout.turn.x, y: layout.turn.y - halfRise };
  const exitMid = midpoint(
    { x: layout.secondHigh.a.x, y: layout.secondHigh.a.y - CORNER_STAIR_RISE },
    { x: layout.secondHigh.b.x, y: layout.secondHigh.b.y - CORNER_STAIR_RISE },
  );
  join.moveTo(turn.x, turn.y).lineTo(exitMid.x, exitMid.y).stroke({ width: 2, color: palette.highlight, alpha: 0.28 });
  node.addChild(join);
  return node;
}

function drawStairRun(node: Container, palette: Palette, low: Edge, high: Edge, z0: number, z1: number, indexOffset: number, stone: boolean): void {
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const h0 = z0 + (z1 - z0) * t0;
    const h1 = z0 + (z1 - z0) * t1;
    drawStep(
      node,
      palette,
      interpolate3d(low.a, high.a, t0, h0),
      interpolate3d(low.b, high.b, t0, h0),
      interpolate3d(low.a, high.a, t1, h1),
      interpolate3d(low.b, high.b, t1, h1),
      indexOffset + i,
      6,
      stone,
    );
  }
}

function drawCornerLanding(node: Container, palette: Palette, points: Point[], z: number, stone: boolean): void {
  const top = new Graphics();
  const skirt = new Graphics();
  const lifted = points.map((point) => ({ x: point.x, y: point.y - z }));

  for (let i = 0; i < lifted.length; i += 1) {
    const a = lifted[i];
    const b = lifted[(i + 1) % lifted.length];
    skirt.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(b.x, b.y + 5).lineTo(a.x, a.y + 5).lineTo(a.x, a.y).fill({ color: palette.secondary, alpha: 0.42 });
  }

  drawPolygon(top, lifted, palette.primary, 1);
  top.stroke({ width: 1, color: palette.accent, alpha: 0.55 });
  for (let i = 0; i < lifted.length; i += 1) {
    const a = midpoint(lifted[i], lifted[(i + 1) % lifted.length]);
    const b = midpoint(lifted[(i + 2) % lifted.length], lifted[(i + 3) % lifted.length]);
    top.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: stone ? palette.shadow : palette.highlight, alpha: 0.18 });
  }

  node.addChild(skirt, top);
}

function drawStep(node: Container, palette: Palette, frontA: Point, frontB: Point, backA: Point, backB: Point, index: number, total: number, stone: boolean): void {
  const tread = new Graphics();
  const riser = new Graphics();
  const side = new Graphics();

  tread.moveTo(frontA.x, frontA.y).lineTo(frontB.x, frontB.y).lineTo(backB.x, backB.y).lineTo(backA.x, backA.y).lineTo(frontA.x, frontA.y).fill({ color: shadeStep(palette.primary, index), alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.48 });
  if (index > 0) {
    riser.moveTo(frontA.x, frontA.y + 5).lineTo(frontB.x, frontB.y + 5).lineTo(frontB.x, frontB.y).lineTo(frontA.x, frontA.y).lineTo(frontA.x, frontA.y + 5).fill({ color: palette.secondary, alpha: 0.88 }).stroke({ width: 1, color: palette.shadow, alpha: 0.22 });
  }
  side.moveTo(frontB.x, frontB.y).lineTo(backB.x, backB.y).lineTo(backB.x, backB.y + 3).lineTo(frontB.x, frontB.y + 3).lineTo(frontB.x, frontB.y).fill({ color: palette.shadow, alpha: 0.38 });

  if (stone) {
    const mid = interpolate(frontA, frontB, 0.5);
    tread.moveTo(mid.x, mid.y).lineTo(mid.x, mid.y + 5).stroke({ width: 1, color: palette.shadow, alpha: 0.34 });
  } else {
    const grainA = interpolate(frontA, frontB, 0.25);
    const grainB = interpolate(backA, backB, 0.25);
    const grainC = interpolate(frontA, frontB, 0.7);
    const grainD = interpolate(backA, backB, 0.7);
    tread.moveTo(grainA.x, grainA.y).lineTo(grainB.x, grainB.y).stroke({ width: 1, color: palette.shadow, alpha: 0.22 });
    tread.moveTo(grainC.x, grainC.y).lineTo(grainD.x, grainD.y).stroke({ width: 1, color: palette.highlight, alpha: 0.18 });
  }
  if (index === total - 1) tread.stroke({ width: 1, color: palette.highlight, alpha: 0.24 });
  node.addChild(riser, side, tread);
}

function renderWallVariant(partId: BuildPartId, rotation: BuildRotation): Container {
  if (partId === 'wood_round_wall' || partId === 'stone_round_wall') return renderRoundWall(partId, rotation);
  if (partId === 'wood_wall_corner' || partId === 'stone_wall_corner') return renderCornerWall(partId, rotation);
  if (partId === 'wood_wall_end' || partId === 'stone_wall_end') return renderWallEnd(partId, rotation);
  if (partId === 'wood_gable_wall' || partId === 'stone_gable_wall') return renderGableWall(partId, rotation);
  if (partId === 'railing' || partId === 'fence') return renderFenceLike(partId, rotation);
  return renderWallSlab(partId, rotation, partId === 'half_wall' ? WALL_RENDER_HEIGHT * 0.62 : WALL_RENDER_HEIGHT);
}

function renderCornerWall(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const corner = getCornerPoint(rotation);
  const segA = getEdgeSegment(rotation);
  const segB = getEdgeSegment(((rotation + 1) % 4) as BuildRotation);
  node.addChild(renderWallFace(trimToward(corner, segA.a, 0.9), corner, WALL_RENDER_HEIGHT, palette, isStoneLike(partId)));
  node.addChild(renderWallFace(corner, trimToward(corner, segB.b, 0.9), WALL_RENDER_HEIGHT, palette, isStoneLike(partId)));
  const post = new Graphics();
  drawVerticalPost(post, corner, WALL_RENDER_HEIGHT + 3, palette.secondary);
  post.ellipse(corner.x, corner.y - WALL_RENDER_HEIGHT - 3, 6, 3).fill({ color: palette.highlight, alpha: 0.75 });
  node.addChild(post);
  return node;
}

function renderWallEnd(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = renderWallSlab(partId, rotation, WALL_RENDER_HEIGHT);
  const palette = getPalette(partId);
  const end = getEdgeSegment(rotation).b;
  const cap = new Graphics();
  cap.roundRect(end.x - 5, end.y - WALL_RENDER_HEIGHT - 3, 10, WALL_RENDER_HEIGHT + 6, 2).fill({ color: palette.secondary, alpha: 1 }).stroke({ width: 1, color: palette.highlight, alpha: 0.48 });
  cap.ellipse(end.x, end.y - WALL_RENDER_HEIGHT - 3, 6, 3).fill({ color: palette.highlight, alpha: 0.65 });
  node.addChild(cap);
  return node;
}

function renderGableWall(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const segment = getEdgeSegment(rotation);
  const a = trimToward(segment.a, segment.b, 0.08);
  const b = trimToward(segment.b, segment.a, 0.08);
  const mid = interpolate(a, b, 0.5);
  const shoulder = WALL_RENDER_HEIGHT * 0.72;
  const peak = WALL_RENDER_HEIGHT * 1.34;
  const wall = new Graphics();
  const detail = new Graphics();

  wall.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(b.x, b.y - shoulder).lineTo(mid.x, mid.y - peak).lineTo(a.x, a.y - shoulder).lineTo(a.x, a.y).fill({ color: palette.primary, alpha: 0.97 }).stroke({ width: 1, color: palette.accent, alpha: 0.44 });
  if (isStoneLike(partId)) drawStoneBlockLines(detail, a, b, shoulder, palette);
  else drawTimberGableTrim(detail, a, b, mid, shoulder, peak, palette);
  node.addChild(wall, detail);
  return node;
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
    const a = base[i], b = base[i + 1], ta = top[i], tb = top[i + 1];
    wall.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(tb.x, tb.y).lineTo(ta.x, ta.y).lineTo(a.x, a.y).fill({ color: i % 2 === 0 ? palette.primary : palette.secondary, alpha: 0.96 }).stroke({ width: 1, color: palette.accent, alpha: 0.22 });
  }
  for (let i = 0; i < top.length - 1; i += 1) cap.moveTo(top[i].x, top[i].y).lineTo(top[i + 1].x, top[i + 1].y);
  cap.stroke({ width: 4, color: palette.secondary, alpha: 0.96 });
  drawVerticalPost(posts, base[0], WALL_RENDER_HEIGHT, palette.secondary);
  drawVerticalPost(posts, base[base.length - 1], WALL_RENDER_HEIGHT, palette.secondary);
  node.addChild(wall, posts, cap);
  return node;
}

function renderRoof(partId: BuildPartId, rotation: BuildRotation): Container {
  if (partId === 'wood_roof_slope' || partId === 'stone_roof_slope' || partId === 'thatch_roof_slope') return renderSlopedRoof(partId, rotation);
  if (partId === 'wood_roof_corner' || partId === 'stone_roof_corner' || partId === 'thatch_roof_corner') return renderRoofCorner(partId, rotation);
  if (partId === 'wood_roof_ridge' || partId === 'stone_roof_ridge' || partId === 'thatch_roof_ridge') return renderRoofRidge(partId, rotation);
  if (partId === 'wood_eave' || partId === 'stone_eave' || partId === 'thatch_eave') return renderEave(partId, rotation);

  const node = new Container();
  const roof = new Graphics();
  const ridge = new Graphics();
  const halfW = ISO_TILE_WIDTH / 2 + 6;
  const halfH = ISO_TILE_HEIGHT / 2 + 3;
  const lift = partId === 'flat_roof_1x1' ? 4 : 12;
  const palette = getPalette(partId);
  roof.moveTo(0, -halfH - lift).lineTo(halfW, -lift).lineTo(0, halfH - lift).lineTo(-halfW, -lift).lineTo(0, -halfH - lift).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.52 });
  if (partId !== 'flat_roof_1x1') ridge.moveTo(0, -halfH - lift).lineTo(0, halfH - lift).stroke({ width: 2, color: palette.secondary, alpha: 0.7 });
  if (partId === 'thatch_roof_1x1') drawThatchStrokes(ridge, getDiamondPoints().map((p) => ({ x: p.x, y: p.y - lift })), palette);
  node.addChild(roof, ridge);
  return node;
}

function renderSlopedRoof(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const high = getEdgeSegment(rotation);
  const low = getEdgeSegment(((rotation + 2) % 4) as BuildRotation);
  const lift = ISO_LAYER_HEIGHT * 0.9;
  const overhang = 1.08;
  const highA = { x: high.a.x, y: high.a.y - lift };
  const highB = { x: high.b.x, y: high.b.y - lift };
  const lowA = { x: low.b.x * overhang, y: low.b.y + 5 };
  const lowB = { x: low.a.x * overhang, y: low.a.y + 5 };
  const underside = new Graphics();
  const face = new Graphics();
  const detail = new Graphics();

  underside.moveTo(lowA.x, lowA.y).lineTo(lowB.x, lowB.y).lineTo(lowB.x, lowB.y + 7).lineTo(lowA.x, lowA.y + 7).lineTo(lowA.x, lowA.y).fill({ color: palette.shadow, alpha: 0.82 });
  face.moveTo(highA.x, highA.y).lineTo(highB.x, highB.y).lineTo(lowB.x, lowB.y).lineTo(lowA.x, lowA.y).lineTo(highA.x, highA.y).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.56 });
  detail.moveTo(highA.x, highA.y).lineTo(highB.x, highB.y).stroke({ width: 3, color: palette.secondary, alpha: 0.9 });
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    const a = interpolate(highA, lowA, t);
    const b = interpolate(highB, lowB, t);
    detail.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: palette.shadow, alpha: 0.25 });
  }
  if (partId === 'thatch_roof_slope') drawThatchStrokes(detail, [highA, highB, lowB, lowA], palette);
  node.addChild(underside, face, detail);
  return node;
}

function renderRoofCorner(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const corner = getCornerPoint(rotation);
  const left = getCornerPoint(((rotation + 1) % 4) as BuildRotation);
  const right = getCornerPoint(((rotation + 3) % 4) as BuildRotation);
  const center = { x: 0, y: -ISO_LAYER_HEIGHT * 0.48 };
  const lift = ISO_LAYER_HEIGHT * 0.82;
  const skirt = new Graphics();
  const faceA = new Graphics();
  const faceB = new Graphics();
  const detail = new Graphics();

  const peak = { x: center.x, y: center.y - lift * 0.32 };
  const c = { x: corner.x * 1.08, y: corner.y + 4 };
  const l = { x: left.x * 1.06, y: left.y + 2 };
  const r = { x: right.x * 1.06, y: right.y + 2 };

  skirt.moveTo(l.x, l.y).lineTo(c.x, c.y).lineTo(r.x, r.y).lineTo(r.x, r.y + 7).lineTo(c.x, c.y + 9).lineTo(l.x, l.y + 7).lineTo(l.x, l.y).fill({ color: palette.shadow, alpha: 0.72 });
  faceA.moveTo(peak.x, peak.y).lineTo(l.x, l.y).lineTo(c.x, c.y).lineTo(peak.x, peak.y).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.54 });
  faceB.moveTo(peak.x, peak.y).lineTo(c.x, c.y).lineTo(r.x, r.y).lineTo(peak.x, peak.y).fill({ color: palette.secondary, alpha: 0.96 }).stroke({ width: 1, color: palette.accent, alpha: 0.42 });
  detail.moveTo(peak.x, peak.y).lineTo(c.x, c.y).stroke({ width: 3, color: palette.highlight, alpha: 0.42 });
  for (let i = 1; i < 4; i += 1) {
    detail.moveTo(interpolate(peak, l, i / 4).x, interpolate(peak, l, i / 4).y).lineTo(interpolate(peak, c, i / 4).x, interpolate(peak, c, i / 4).y).stroke({ width: 1, color: palette.shadow, alpha: 0.22 });
    detail.moveTo(interpolate(peak, c, i / 4).x, interpolate(peak, c, i / 4).y).lineTo(interpolate(peak, r, i / 4).x, interpolate(peak, r, i / 4).y).stroke({ width: 1, color: palette.shadow, alpha: 0.2 });
  }
  if (partId === 'thatch_roof_corner') drawThatchStrokes(detail, [peak, l, c, r], palette);
  node.addChild(skirt, faceA, faceB, detail);
  return node;
}

function renderRoofRidge(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const segment = getEdgeSegment(rotation);
  const lift = ISO_LAYER_HEIGHT * 0.86;
  const a = { x: segment.a.x * 0.88, y: segment.a.y - lift };
  const b = { x: segment.b.x * 0.88, y: segment.b.y - lift };
  const cap = new Graphics();
  const detail = new Graphics();

  cap.moveTo(a.x, a.y - 3).lineTo(b.x, b.y - 3).lineTo(b.x + 4, b.y + 3).lineTo(a.x + 4, a.y + 3).lineTo(a.x, a.y - 3).fill({ color: palette.secondary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.62 });
  detail.moveTo(a.x, a.y - 4).lineTo(b.x, b.y - 4).stroke({ width: 2, color: palette.highlight, alpha: 0.42 });
  for (let i = 1; i < 5; i += 1) {
    const p = interpolate(a, b, i / 5);
    detail.moveTo(p.x, p.y - 4).lineTo(p.x + 3, p.y + 3).stroke({ width: 1, color: palette.shadow, alpha: 0.34 });
  }
  if (partId === 'thatch_roof_ridge') {
    for (let i = -3; i <= 3; i += 1) {
      const p = interpolate(a, b, (i + 4) / 8);
      detail.moveTo(p.x, p.y - 6).lineTo(p.x + i, p.y + 5).stroke({ width: 1, color: palette.highlight, alpha: 0.28 });
    }
  }
  node.addChild(cap, detail);
  return node;
}

function renderEave(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const segment = getEdgeSegment(rotation);
  const a = { x: segment.a.x * 1.12, y: segment.a.y + 2 };
  const b = { x: segment.b.x * 1.12, y: segment.b.y + 2 };
  const down = 9;
  const trim = new Graphics();
  const detail = new Graphics();
  trim.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(b.x, b.y + down).lineTo(a.x, a.y + down).lineTo(a.x, a.y).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.55 });
  detail.moveTo(a.x, a.y + down).lineTo(b.x, b.y + down).stroke({ width: 2, color: palette.shadow, alpha: 0.45 });
  for (let i = 1; i < 4; i += 1) {
    const p = interpolate(a, b, i / 4);
    detail.moveTo(p.x, p.y).lineTo(p.x, p.y + down).stroke({ width: 1, color: palette.highlight, alpha: 0.35 });
  }
  node.addChild(trim, detail);
  return node;
}

function renderSupport(partId: BuildPartId, rotation: BuildRotation): Container {
  if (partId === 'wood_beam_horizontal' || partId === 'stone_beam_horizontal') return renderHorizontalBeam(partId, rotation);
  if (partId === 'wood_diagonal_support' || partId === 'stone_diagonal_support') return renderDiagonalSupport(partId, rotation);
  return renderPillar(partId, rotation);
}

function renderHorizontalBeam(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const segment = getEdgeSegment(rotation);
  const a = trimToward(segment.a, segment.b, 0.08);
  const b = trimToward(segment.b, segment.a, 0.08);
  const yLift = WALL_RENDER_HEIGHT + 4;
  const body = new Graphics();
  const top = new Graphics();
  const detail = new Graphics();
  const depth = 8;

  body.moveTo(a.x, a.y - yLift).lineTo(b.x, b.y - yLift).lineTo(b.x, b.y - yLift + depth).lineTo(a.x, a.y - yLift + depth).lineTo(a.x, a.y - yLift).fill({ color: palette.primary, alpha: 1 }).stroke({ width: 1, color: palette.accent, alpha: 0.54 });
  top.moveTo(a.x + 3, a.y - yLift - 5).lineTo(b.x + 3, b.y - yLift - 5).lineTo(b.x, b.y - yLift).lineTo(a.x, a.y - yLift).lineTo(a.x + 3, a.y - yLift - 5).fill({ color: palette.highlight, alpha: 0.38 });
  for (let i = 1; i < 5; i += 1) {
    const p = interpolate(a, b, i / 5);
    detail.moveTo(p.x, p.y - yLift - 2).lineTo(p.x, p.y - yLift + depth).stroke({ width: 1, color: palette.shadow, alpha: 0.26 });
  }
  if (!isStoneLike(partId)) detail.moveTo(a.x + 4, a.y - yLift + 2).lineTo(b.x - 4, b.y - yLift + 4).stroke({ width: 1, color: palette.highlight, alpha: 0.18 });
  node.addChild(body, top, detail);
  return node;
}

function renderDiagonalSupport(partId: BuildPartId, rotation: BuildRotation): Container {
  const node = new Container();
  const palette = getPalette(partId);
  const segment = getEdgeSegment(rotation);
  const a = trimToward(segment.a, segment.b, 0.18);
  const b = trimToward(segment.b, segment.a, 0.18);
  const bottom = rotation % 2 === 0 ? a : b;
  const top = rotation % 2 === 0 ? b : a;
  const brace = new Graphics();
  const shadow = new Graphics();
  const width = isStoneLike(partId) ? 8 : 6;

  shadow.moveTo(bottom.x + 2, bottom.y - 4).lineTo(top.x + 2, top.y - WALL_RENDER_HEIGHT + 5).stroke({ width: width + 3, color: palette.shadow, alpha: 0.28 });
  brace.moveTo(bottom.x, bottom.y - 6).lineTo(top.x, top.y - WALL_RENDER_HEIGHT + 6).stroke({ width, color: palette.primary, alpha: 1 });
  brace.moveTo(bottom.x, bottom.y - 6).lineTo(top.x, top.y - WALL_RENDER_HEIGHT + 6).stroke({ width: 1, color: palette.highlight, alpha: 0.5 });
  if (isStoneLike(partId)) {
    for (let i = 1; i < 4; i += 1) {
      const p = interpolate({ x: bottom.x, y: bottom.y - 6 }, { x: top.x, y: top.y - WALL_RENDER_HEIGHT + 6 }, i / 4);
      brace.circle(p.x, p.y, 1.4).fill({ color: palette.shadow, alpha: 0.45 });
    }
  }
  node.addChild(shadow, brace);
  return node;
}

function renderWallSlab(partId: BuildPartId, rotation: BuildRotation, height: number): Container {
  const segment = getEdgeSegment(rotation);
  const palette = getPalette(partId);
  const a = trimToward(segment.a, segment.b, 0.12);
  const b = trimToward(segment.b, segment.a, 0.12);
  const node = new Container();
  node.addChild(renderWallFace(a, b, height, palette, isStoneLike(partId)));
  const postA = new Graphics();
  const postB = new Graphics();
  const cap = new Graphics();
  drawVerticalPost(postA, segment.a, height, palette.secondary);
  drawVerticalPost(postB, segment.b, height, palette.secondary);
  cap.moveTo(a.x, a.y - height).lineTo(b.x, b.y - height).stroke({ width: 4, color: palette.secondary, alpha: 0.96 });
  node.addChild(postA, postB, cap);
  return node;
}

function renderWallFace(a: Point, b: Point, height: number, palette: Palette, stone: boolean): Container {
  const node = new Container();
  const panel = new Graphics();
  const detail = new Graphics();
  const topA = { x: a.x, y: a.y - height };
  const topB = { x: b.x, y: b.y - height };
  panel.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(topB.x, topB.y).lineTo(topA.x, topA.y).lineTo(a.x, a.y).fill({ color: palette.primary, alpha: 0.96 }).stroke({ width: 1, color: palette.accent, alpha: 0.35 });
  if (stone) drawStoneBlockLines(detail, a, b, height, palette);
  else drawWoodWallDetail(detail, a, b, height, palette);
  node.addChild(panel, detail);
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
  rail.moveTo(a.x, a.y - height * 0.72).lineTo(b.x, b.y - height * 0.72).stroke({ width: 4, color: palette.primary, alpha: 1 });
  rail.moveTo(a.x, a.y - height * 0.34).lineTo(b.x, b.y - height * 0.34).stroke({ width: 3, color: palette.secondary, alpha: 1 });
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
    case 'floor': return part.partId.includes('stairs') ? 95 + part.rotation : 10;
    case 'support': return part.partId.includes('beam') || part.partId.includes('diagonal') ? 260 + part.rotation : 180 + part.rotation;
    case 'wall':
    case 'door':
    case 'window': return 220 + part.rotation;
    case 'roof': return 320 + part.rotation;
    default: return 100;
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
    case 'window': return isEdgeStructureOccludingFocus(origin, part.rotation, focus.worldX, focusY, WALL_RENDER_HEIGHT);
    case 'support': return isPillarOccludingFocus(origin, part.rotation, focus.worldX, focusY, PILLAR_RENDER_HEIGHT);
    case 'roof': return isRoofOccludingFocus(origin, focus.worldX, focusY);
    default: return false;
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

function getPalette(partId: BuildPartId): Palette {
  switch (partId) {
    case 'stone_floor_1x1':
    case 'stone_wall':
    case 'stone_pillar':
    case 'stone_door':
    case 'stone_stairs':
    case 'stone_corner_stairs':
    case 'stone_stair_landing':
    case 'stone_round_floor':
    case 'stone_round_wall':
    case 'stone_half_floor':
    case 'stone_wall_corner':
    case 'stone_wall_end':
    case 'stone_gable_wall':
    case 'stone_roof_slope':
    case 'stone_roof_corner':
    case 'stone_roof_ridge':
    case 'stone_eave':
    case 'stone_beam_horizontal':
    case 'stone_diagonal_support':
      return { primary: 0x7c8185, secondary: 0x5f666b, accent: 0xd7dde2, shadow: 0x41484d, highlight: 0xe9eef2 };
    case 'roof_1x1':
      return { primary: 0xb84e43, secondary: 0x7f2d2a, accent: 0xffc1a8, shadow: 0x5f211f, highlight: 0xffd3bf };
    case 'wood_roof_slope':
    case 'wood_roof_corner':
    case 'wood_roof_ridge':
      return { primary: 0xa65245, secondary: 0x74332d, accent: 0xf0a58f, shadow: 0x51231f, highlight: 0xffc5ad };
    case 'thatch_roof_1x1':
    case 'thatch_roof_slope':
    case 'thatch_roof_corner':
    case 'thatch_roof_ridge':
    case 'thatch_eave':
      return { primary: 0xcaa85b, secondary: 0x8d6d32, accent: 0xffe4a3, shadow: 0x6d5024, highlight: 0xffefb9 };
    case 'flat_roof_1x1':
      return { primary: 0x6f7d5d, secondary: 0x4c5a42, accent: 0xbfcda3, shadow: 0x313d2c, highlight: 0xd7e4bd };
    default:
      return { primary: 0x9b6a3d, secondary: 0x684326, accent: 0xe7bc85, shadow: 0x3f2718, highlight: 0xf4d09b };
  }
}

function isStoneLike(partId: BuildPartId): boolean {
  return partId.startsWith('stone_');
}

function getDiamondPoints(): Point[] {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  return [{ x: 0, y: -halfH }, { x: halfW, y: 0 }, { x: 0, y: halfH }, { x: -halfW, y: 0 }];
}

function getHalfDiamondPoints(rotation: BuildRotation): Point[] {
  const [n, e, s, w] = getDiamondPoints();
  switch (rotation) {
    case 0: return [w, n, e, { x: 0, y: 0 }];
    case 1: return [n, e, s, { x: 0, y: 0 }];
    case 2: return [e, s, w, { x: 0, y: 0 }];
    case 3: return [s, w, n, { x: 0, y: 0 }];
  }
}

function getEdgeSegment(rotation: BuildRotation): Edge {
  const [n, e, s, w] = getDiamondPoints();
  switch (rotation) {
    case 0: return { a: w, b: n };
    case 1: return { a: n, b: e };
    case 2: return { a: e, b: s };
    case 3: return { a: s, b: w };
  }
}

function getCornerPoint(rotation: BuildRotation): Point {
  const [n, e, s, w] = getDiamondPoints();
  switch (rotation) {
    case 0: return w;
    case 1: return n;
    case 2: return e;
    case 3: return s;
  }
}

function getStairLowEdge(rotation: BuildRotation): Edge {
  const [n, e, s, w] = getDiamondPoints();
  switch (rotation) {
    case 0: return { a: s, b: e };
    case 1: return { a: w, b: s };
    case 2: return { a: n, b: w };
    case 3: return { a: e, b: n };
  }
}

function getStairHighEdge(rotation: BuildRotation): Edge {
  const [n, e, s, w] = getDiamondPoints();
  switch (rotation) {
    case 0: return { a: w, b: n };
    case 1: return { a: n, b: e };
    case 2: return { a: e, b: s };
    case 3: return { a: s, b: w };
  }
}

function getCornerStairLayout(rotation: BuildRotation): CornerStairLayout {
  const [n, e, s, w] = getDiamondPoints();
  const c = { x: 0, y: 0 };
  const nw = interpolate(n, w, 0.5);
  const ne = interpolate(n, e, 0.5);
  const se = interpolate(s, e, 0.5);
  const sw = interpolate(s, w, 0.5);

  switch (rotation) {
    case 0:
      return {
        firstLow: { a: s, b: sw },
        firstHigh: { a: c, b: w },
        secondLow: { a: c, b: w },
        secondHigh: { a: ne, b: n },
        platform: [w, nw, c, sw],
        turn: w,
      };
    case 1:
      return {
        firstLow: { a: w, b: nw },
        firstHigh: { a: c, b: n },
        secondLow: { a: c, b: n },
        secondHigh: { a: se, b: e },
        platform: [n, ne, c, nw],
        turn: n,
      };
    case 2:
      return {
        firstLow: { a: n, b: ne },
        firstHigh: { a: c, b: e },
        secondLow: { a: c, b: e },
        secondHigh: { a: sw, b: s },
        platform: [e, se, c, ne],
        turn: e,
      };
    case 3:
      return {
        firstLow: { a: e, b: se },
        firstHigh: { a: c, b: s },
        secondLow: { a: c, b: s },
        secondHigh: { a: nw, b: w },
        platform: [s, sw, c, se],
        turn: s,
      };
  }
}

function getQuarterDiskPoints(rotation: BuildRotation): Point[] {
  return [getRoundPieceCenterCorner(rotation), ...getQuarterDiskArcPoints(rotation)];
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
    case 0: return { center: { u: 1, v: 1 }, startAngle: Math.PI, endAngle: Math.PI * 1.5 };
    case 1: return { center: { u: 0, v: 1 }, startAngle: -Math.PI / 2, endAngle: 0 };
    case 2: return { center: { u: 0, v: 0 }, startAngle: 0, endAngle: Math.PI / 2 };
    case 3: return { center: { u: 1, v: 0 }, startAngle: Math.PI / 2, endAngle: Math.PI };
  }
}

function localSquareToIso(point: LocalPoint): Point {
  return { x: (point.u - point.v) * (ISO_TILE_WIDTH / 2), y: (point.u + point.v - 1) * (ISO_TILE_HEIGHT / 2) };
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

function drawWoodFloorDetail(g: Graphics, polygon: Point[], palette: Palette, deck: boolean): void {
  const [n, e, s, w] = polygon;
  const count = deck ? 5 : 4;
  for (let i = 1; i < count; i += 1) {
    const a = interpolate(w, n, i / count);
    const b = interpolate(s, e, i / count);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: palette.shadow, alpha: 0.22 });
  }
  g.moveTo(-18, -4).lineTo(18, 4).stroke({ width: 1, color: palette.highlight, alpha: 0.16 });
}

function drawStoneFloorDetail(g: Graphics, polygon: Point[], palette: Palette): void {
  const [n, e, s, w] = polygon;
  const a1 = interpolate(w, n, 0.5);
  const b1 = interpolate(s, e, 0.5);
  const a2 = interpolate(n, e, 0.5);
  const b2 = interpolate(w, s, 0.5);
  g.moveTo(a1.x, a1.y).lineTo(b1.x, b1.y).stroke({ width: 1, color: palette.shadow, alpha: 0.28 });
  g.moveTo(a2.x, a2.y).lineTo(b2.x, b2.y).stroke({ width: 1, color: palette.highlight, alpha: 0.22 });
}

function drawHalfFloorDetail(g: Graphics, polygon: Point[], rotation: BuildRotation, palette: Palette, stone: boolean): void {
  for (let i = 1; i < polygon.length - 1; i += 1) {
    const a = interpolate(polygon[0], polygon[i], 0.55);
    const b = interpolate(polygon[polygon.length - 1], polygon[i], 0.55);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: stone ? palette.shadow : palette.highlight, alpha: 0.22 });
  }
  const c = getCornerPoint(rotation);
  g.circle(c.x * 0.35, c.y * 0.35, 1.4).fill({ color: palette.highlight, alpha: 0.34 });
}

function drawWoodWallDetail(g: Graphics, a: Point, b: Point, height: number, palette: Palette): void {
  for (let i = 1; i < 4; i += 1) {
    const p = interpolate(a, b, i / 4);
    g.moveTo(p.x, p.y).lineTo(p.x, p.y - height).stroke({ width: 1, color: palette.shadow, alpha: 0.22 });
  }
  g.moveTo(a.x, a.y - height * 0.55).lineTo(b.x, b.y - height * 0.55).stroke({ width: 1, color: palette.highlight, alpha: 0.18 });
}

function drawStoneBlockLines(g: Graphics, a: Point, b: Point, height: number, palette: Palette): void {
  for (let row = 1; row < 4; row += 1) {
    const y = height * (row / 4);
    g.moveTo(a.x, a.y - y).lineTo(b.x, b.y - y).stroke({ width: 1, color: palette.shadow, alpha: 0.28 });
  }
  for (let i = 1; i < 4; i += 1) {
    const p = interpolate(a, b, i / 4);
    g.moveTo(p.x, p.y - height * 0.25).lineTo(p.x, p.y - height * 0.48).stroke({ width: 1, color: palette.highlight, alpha: 0.18 });
    g.moveTo(p.x, p.y - height * 0.62).lineTo(p.x, p.y - height * 0.86).stroke({ width: 1, color: palette.shadow, alpha: 0.2 });
  }
}

function drawTimberGableTrim(g: Graphics, a: Point, b: Point, mid: Point, shoulder: number, peak: number, palette: Palette): void {
  g.moveTo(a.x, a.y - shoulder).lineTo(mid.x, mid.y - peak).lineTo(b.x, b.y - shoulder).stroke({ width: 3, color: palette.secondary, alpha: 0.95 });
  g.moveTo(mid.x, mid.y - peak).lineTo(mid.x, mid.y - 4).stroke({ width: 3, color: palette.shadow, alpha: 0.6 });
  g.moveTo(a.x, a.y - shoulder * 0.52).lineTo(b.x, b.y - shoulder * 0.52).stroke({ width: 2, color: palette.secondary, alpha: 0.75 });
}

function drawThatchStrokes(g: Graphics, polygon: Point[], palette: Palette): void {
  const top = polygon[0];
  const bottom = polygon[2] ?? polygon[polygon.length - 1];
  for (let i = -4; i <= 4; i += 1) {
    const x = i * 7;
    g.moveTo(top.x + x * 0.25, top.y + 3).lineTo(bottom.x + x, bottom.y - 5).stroke({ width: 1, color: i % 2 === 0 ? palette.shadow : palette.highlight, alpha: 0.22 });
  }
}

function shadeStep(color: number, index: number): number {
  const factor = 1 - index * 0.025;
  const r = Math.max(0, Math.min(255, ((color >> 16) & 255) * factor));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 255) * factor));
  const b = Math.max(0, Math.min(255, (color & 255) * factor));
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function midpoint(a: Point, b: Point): Point {
  return interpolate(a, b, 0.5);
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
  const dx = point.x - pivot.x, dy = point.y - pivot.y;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}
function distancePointToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(px, py, a.x, a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
  return distance(px, py, a.x + t * dx, a.y + t * dy);
}
function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
