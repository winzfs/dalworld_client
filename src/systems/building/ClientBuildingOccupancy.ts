import { BUILD_PARTS } from './BuildingParts';
import { gridToScreen, ISO_LAYER_HEIGHT, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
import type {
  BuildCategory,
  BuildCorner,
  BuildEdge,
  BuildPartDefinition,
  BuildRotation,
  BuildSlotKind,
  BuildingSnapshot,
  PlacedBuildPart,
} from './BuildingTypes';
import { rotationToCorner, rotationToEdge } from './BuildingTypes';

type CellSlots = {
  tile?: string;
  edges: Partial<Record<BuildEdge, string>>;
  corners: Partial<Record<BuildCorner, string>>;
};

export type ClientPlacementCheck =
  | { ok: true }
  | { ok: false; reason: string };

const STACKABLE_EDGE_CATEGORIES: BuildCategory[] = ['wall', 'door', 'window'];
const UPPER_TILE_SUPPORT_CATEGORIES: BuildCategory[] = ['floor', 'wall', 'door', 'window', 'support'];
const DEMOLITION_PICK_RADIUS = 34;

export class ClientBuildingOccupancy {
  private readonly cells = new Map<string, CellSlots>();
  private readonly parts = new Map<string, PlacedBuildPart>();

  applySnapshot(snapshot: BuildingSnapshot): void {
    this.clear();
    for (const part of snapshot.parts) this.addOrUpdate(part);
  }

  addOrUpdate(part: PlacedBuildPart): void {
    this.remove(part.entityId);
    this.parts.set(part.entityId, part);
    const definition = BUILD_PARTS[part.partId];
    if (!definition) return;
    const cell = this.getOrCreateCell(part.x, part.y, part.z);
    if (definition.slotKind === 'tile') cell.tile = part.entityId;
    else if (definition.slotKind === 'edge') cell.edges[rotationToEdge(part.rotation)] = part.entityId;
    else cell.corners[rotationToCorner(part.rotation)] = part.entityId;
  }

  getById(entityId: string): PlacedBuildPart | null {
    return this.parts.get(entityId) ?? null;
  }

  updateDoor(entityId: string, open: boolean): void {
    const part = this.parts.get(entityId);
    if (!part) return;
    const definition = BUILD_PARTS[part.partId];
    if (definition?.category !== 'door') return;
    this.parts.set(entityId, { ...part, state: { ...part.state, open } });
  }

  remove(entityId: string): void {
    this.parts.delete(entityId);
    for (const [key, cell] of this.cells.entries()) {
      if (cell.tile === entityId) delete cell.tile;
      for (const edge of Object.keys(cell.edges) as BuildEdge[]) {
        if (cell.edges[edge] === entityId) delete cell.edges[edge];
      }
      for (const corner of Object.keys(cell.corners) as BuildCorner[]) {
        if (cell.corners[corner] === entityId) delete cell.corners[corner];
      }
      if (!cell.tile && Object.keys(cell.edges).length === 0 && Object.keys(cell.corners).length === 0) this.cells.delete(key);
    }
  }

  canPlace(definition: BuildPartDefinition, x: number, y: number, z: number, rotation: BuildRotation): ClientPlacementCheck {
    return this.canPlaceIgnoring(definition, x, y, z, rotation, null);
  }

  canPlaceIgnoring(
    definition: BuildPartDefinition,
    x: number,
    y: number,
    z: number,
    rotation: BuildRotation,
    ignoredEntityId: string | null,
  ): ClientPlacementCheck {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return { ok: false, reason: '좌표 오류' };
    if (x < 0 || y < 0 || z < 0) return { ok: false, reason: '맵 밖' };

    const cell = this.cells.get(this.toKey(x, y, z));
    const occupied = this.getOccupiedSlotEntityId(cell, definition.slotKind, rotation);
    if (occupied && occupied !== ignoredEntityId) {
      if (definition.slotKind === 'tile') return { ok: false, reason: '타일 슬롯 점유됨' };
      if (definition.slotKind === 'edge') return { ok: false, reason: '엣지 슬롯 점유됨' };
      return { ok: false, reason: '코너 슬롯 점유됨' };
    }

    if (definition.allowedOn === 'ground') {
      if (z === 0) return { ok: true };
      if (definition.category === 'floor') return this.canPlaceUpperTile(x, y, z, ignoredEntityId);
      return { ok: false, reason: '지면 전용' };
    }

    if (!definition.requiresSupport) return { ok: true };

    const supportCell = z === 0 ? cell : this.cells.get(this.toKey(x, y, z - 1));
    if (!supportCell) return { ok: false, reason: '지지대 없음' };

    const supportParts = this.getPartsFromCell(supportCell)
      .filter((part) => part.entityId !== ignoredEntityId);

    if (z > 0 && definition.slotKind === 'edge' && STACKABLE_EDGE_CATEGORIES.includes(definition.category)) {
      const sameEdgeSupport = this.getEdgePartFromCell(supportCell, rotation);
      if (sameEdgeSupport && sameEdgeSupport.entityId !== ignoredEntityId) {
        const supportDefinition = BUILD_PARTS[sameEdgeSupport.partId];
        if (supportDefinition && STACKABLE_EDGE_CATEGORIES.includes(supportDefinition.category)) return { ok: true };
      }
    }

    if (definition.allowedOn === 'any') return supportParts.length > 0 ? { ok: true } : { ok: false, reason: '지지대 없음' };
    return supportParts.some((part) => definition.allowedOn.includes(part.partId))
      ? { ok: true }
      : { ok: false, reason: '부적합한 지지대' };
  }

  findAtSlot(x: number, y: number, z: number, slotKind: BuildSlotKind, rotation: BuildRotation): PlacedBuildPart | null {
    const cell = this.cells.get(this.toKey(x, y, z));
    if (!cell) return null;
    const entityId = this.getOccupiedSlotEntityId(cell, slotKind, rotation);
    return entityId ? this.parts.get(entityId) ?? null : null;
  }

  findTopAtCell(x: number, y: number, z: number, preferredRotation: BuildRotation): PlacedBuildPart | null {
    return this.findBestAtCell(x, y, z, preferredRotation, 1);
  }

  findBestAtCell(x: number, y: number, z: number, preferredRotation: BuildRotation, layerRadius = 2): PlacedBuildPart | null {
    const candidates: PlacedBuildPart[] = [];

    for (let dz = layerRadius; dz >= -layerRadius; dz -= 1) {
      const nextZ = z + dz;
      if (nextZ < 0) continue;
      const cell = this.cells.get(this.toKey(x, y, nextZ));
      if (!cell) continue;
      candidates.push(...this.getOrderedPartsFromCell(cell, preferredRotation));
    }

    return candidates
      .sort((a, b) => {
        const byLayer = b.z - a.z;
        if (byLayer !== 0) return byLayer;
        return getInteractionPriority(b) - getInteractionPriority(a);
      })[0] ?? null;
  }

  findNearestAtWorld(worldX: number, worldY: number, currentZ: number, preferredRotation: BuildRotation): PlacedBuildPart | null {
    let best: { part: PlacedBuildPart; score: number } | null = null;

    for (const part of this.parts.values()) {
      const score = getPickScore(part, worldX, worldY, currentZ, preferredRotation);
      if (score > DEMOLITION_PICK_RADIUS) continue;
      if (!best || score < best.score || (score === best.score && getInteractionPriority(part) > getInteractionPriority(best.part))) {
        best = { part, score };
      }
    }

    return best?.part ?? null;
  }

  findDoorAtCell(x: number, y: number, z: number, preferredRotation: BuildRotation): PlacedBuildPart | null {
    const cell = this.cells.get(this.toKey(x, y, z));
    if (!cell) return null;
    const preferred = cell.edges[rotationToEdge(preferredRotation)];
    const preferredPart = preferred ? this.parts.get(preferred) ?? null : null;
    if (preferredPart && BUILD_PARTS[preferredPart.partId]?.category === 'door') return preferredPart;
    return Object.values(cell.edges)
      .map((id) => id ? this.parts.get(id) : null)
      .find((part): part is PlacedBuildPart => Boolean(part && BUILD_PARTS[part.partId]?.category === 'door')) ?? null;
  }

  clear(): void {
    this.cells.clear();
    this.parts.clear();
  }

  private canPlaceUpperTile(x: number, y: number, z: number, ignoredEntityId: string | null): ClientPlacementCheck {
    if (z <= 0) return { ok: true };
    const supportCell = this.cells.get(this.toKey(x, y, z - 1));
    if (!supportCell) return { ok: false, reason: '2층 바닥을 받칠 벽/기둥이 없습니다.' };

    const supported = this.getPartsFromCell(supportCell)
      .filter((part) => part.entityId !== ignoredEntityId)
      .some((part) => {
        const definition = BUILD_PARTS[part.partId];
        return Boolean(definition && UPPER_TILE_SUPPORT_CATEGORIES.includes(definition.category));
      });

    return supported ? { ok: true } : { ok: false, reason: '2층 바닥을 받칠 벽/기둥이 없습니다.' };
  }

  private getOccupiedSlotEntityId(cell: CellSlots | undefined, slotKind: BuildSlotKind, rotation: BuildRotation): string | undefined {
    if (!cell) return undefined;
    if (slotKind === 'tile') return cell.tile;
    if (slotKind === 'edge') return cell.edges[rotationToEdge(rotation)];
    return cell.corners[rotationToCorner(rotation)];
  }

  private getOrCreateCell(x: number, y: number, z: number): CellSlots {
    const key = this.toKey(x, y, z);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { edges: {}, corners: {} };
      this.cells.set(key, cell);
    }
    return cell;
  }

  private getEdgePartFromCell(cell: CellSlots, rotation: BuildRotation): PlacedBuildPart | null {
    const entityId = cell.edges[rotationToEdge(rotation)];
    return entityId ? this.parts.get(entityId) ?? null : null;
  }

  private getPartsFromCell(cell: CellSlots): PlacedBuildPart[] {
    return [cell.tile, ...Object.values(cell.edges), ...Object.values(cell.corners)]
      .filter((entityId): entityId is string => typeof entityId === 'string')
      .map((entityId) => this.parts.get(entityId))
      .filter((part): part is PlacedBuildPart => Boolean(part));
  }

  private getOrderedPartsFromCell(cell: CellSlots, preferredRotation: BuildRotation): PlacedBuildPart[] {
    const preferredEdge = cell.edges[rotationToEdge(preferredRotation)];
    const preferredCorner = cell.corners[rotationToCorner(preferredRotation)];
    const ids = [
      preferredEdge,
      preferredCorner,
      ...Object.values(cell.edges),
      ...Object.values(cell.corners),
      cell.tile,
    ];

    const seen = new Set<string>();
    const ordered: PlacedBuildPart[] = [];

    for (const entityId of ids) {
      if (typeof entityId !== 'string' || seen.has(entityId)) continue;
      seen.add(entityId);
      const part = this.parts.get(entityId);
      if (part) ordered.push(part);
    }

    return ordered;
  }

  private toKey(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }
}

function getPickScore(part: PlacedBuildPart, worldX: number, worldY: number, currentZ: number, preferredRotation: BuildRotation): number {
  const definition = BUILD_PARTS[part.partId];
  const origin = gridToScreen(part.x, part.y, part.z);
  const layerPenalty = Math.abs(part.z - currentZ) * 10;
  const rotationBonus = part.rotation === preferredRotation ? -4 : 0;
  const priorityBonus = -getInteractionPriority(part) * 0.08;

  if (!definition) return Number.POSITIVE_INFINITY;

  if (definition.slotKind === 'edge') {
    const segment = getEdgeSegment(origin, part.rotation);
    return distancePointToSegment(worldX, worldY, segment.a, segment.b) + layerPenalty + rotationBonus + priorityBonus;
  }

  if (definition.slotKind === 'corner') {
    const point = getCornerPoint(origin, part.rotation);
    return distance(worldX, worldY, point.x, point.y) + layerPenalty + rotationBonus + priorityBonus;
  }

  return distance(worldX, worldY, origin.x, origin.y) * 0.7 + layerPenalty + priorityBonus;
}

function getInteractionPriority(part: PlacedBuildPart): number {
  const definition = BUILD_PARTS[part.partId];
  switch (definition?.category) {
    case 'roof':
      return 60;
    case 'door':
      return 55;
    case 'window':
      return 50;
    case 'wall':
      return 45;
    case 'support':
      return 35;
    case 'floor':
      return 10;
    default:
      return 0;
  }
}

type Point = { x: number; y: number };

function getEdgeSegment(origin: Point, rotation: BuildRotation): { a: Point; b: Point } {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const north = { x: origin.x, y: origin.y - halfH };
  const east = { x: origin.x + halfW, y: origin.y };
  const south = { x: origin.x, y: origin.y + halfH };
  const west = { x: origin.x - halfW, y: origin.y };

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

function getCornerPoint(origin: Point, rotation: BuildRotation): Point {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;

  switch (rotation) {
    case 0:
      return { x: origin.x - halfW, y: origin.y };
    case 1:
      return { x: origin.x, y: origin.y - halfH };
    case 2:
      return { x: origin.x + halfW, y: origin.y };
    case 3:
      return { x: origin.x, y: origin.y + halfH };
  }
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
