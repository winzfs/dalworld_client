import { BUILD_PARTS } from './BuildingParts';
import type {
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

    if (definition.allowedOn === 'ground') return z === 0 ? { ok: true } : { ok: false, reason: '지면 전용' };
    if (!definition.requiresSupport) return { ok: true };

    const supportCell = z === 0 ? cell : this.cells.get(this.toKey(x, y, z - 1));
    if (!supportCell) return { ok: false, reason: '지지대 없음' };

    const supportParts = this.getPartsFromCell(supportCell)
      .filter((part) => part.entityId !== ignoredEntityId);

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
    const cell = this.cells.get(this.toKey(x, y, z));
    if (!cell) return null;
    const preferredEdge = cell.edges[rotationToEdge(preferredRotation)];
    if (preferredEdge) return this.parts.get(preferredEdge) ?? null;
    const preferredCorner = cell.corners[rotationToCorner(preferredRotation)];
    if (preferredCorner) return this.parts.get(preferredCorner) ?? null;
    const edgePart = Object.values(cell.edges).map((id) => id ? this.parts.get(id) : null).find((part): part is PlacedBuildPart => Boolean(part));
    if (edgePart) return edgePart;
    const cornerPart = Object.values(cell.corners).map((id) => id ? this.parts.get(id) : null).find((part): part is PlacedBuildPart => Boolean(part));
    if (cornerPart) return cornerPart;
    return cell.tile ? this.parts.get(cell.tile) ?? null : null;
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

  private getPartsFromCell(cell: CellSlots): PlacedBuildPart[] {
    return [cell.tile, ...Object.values(cell.edges), ...Object.values(cell.corners)]
      .filter((entityId): entityId is string => typeof entityId === 'string')
      .map((entityId) => this.parts.get(entityId))
      .filter((part): part is PlacedBuildPart => Boolean(part));
  }

  private toKey(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }
}
