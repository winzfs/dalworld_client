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

    for (const part of snapshot.parts) {
      this.addOrUpdate(part);
    }
  }

  addOrUpdate(part: PlacedBuildPart): void {
    this.remove(part.entityId);
    this.parts.set(part.entityId, part);

    const definition = BUILD_PARTS[part.partId];
    if (!definition) {
      return;
    }

    const cell = this.getOrCreateCell(part.x, part.y, part.z);

    if (definition.slotKind === 'tile') {
      cell.tile = part.entityId;
      return;
    }

    if (definition.slotKind === 'edge') {
      cell.edges[rotationToEdge(part.rotation)] = part.entityId;
      return;
    }

    cell.corners[rotationToCorner(part.rotation)] = part.entityId;
  }

  updateDoor(entityId: string, open: boolean): void {
    const part = this.parts.get(entityId);
    if (!part || part.partId !== 'door') {
      return;
    }

    this.parts.set(entityId, {
      ...part,
      state: {
        ...part.state,
        open,
      },
    });
  }

  remove(entityId: string): void {
    this.parts.delete(entityId);

    for (const [key, cell] of this.cells.entries()) {
      if (cell.tile === entityId) {
        delete cell.tile;
      }

      for (const edge of Object.keys(cell.edges) as BuildEdge[]) {
        if (cell.edges[edge] === entityId) {
          delete cell.edges[edge];
        }
      }

      for (const corner of Object.keys(cell.corners) as BuildCorner[]) {
        if (cell.corners[corner] === entityId) {
          delete cell.corners[corner];
        }
      }

      if (!cell.tile && Object.keys(cell.edges).length === 0 && Object.keys(cell.corners).length === 0) {
        this.cells.delete(key);
      }
    }
  }

  canPlace(definition: BuildPartDefinition, x: number, y: number, z: number, rotation: BuildRotation): ClientPlacementCheck {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return { ok: false, reason: '좌표 오류' };
    }

    if (x < 0 || y < 0 || z < 0) {
      return { ok: false, reason: '맵 밖' };
    }

    const cell = this.cells.get(this.toKey(x, y, z));

    if (definition.slotKind === 'tile' && cell?.tile) {
      return { ok: false, reason: '타일 슬롯 점유됨' };
    }

    if (definition.slotKind === 'edge' && cell?.edges[rotationToEdge(rotation)]) {
      return { ok: false, reason: '엣지 슬롯 점유됨' };
    }

    if (definition.slotKind === 'corner' && cell?.corners[rotationToCorner(rotation)]) {
      return { ok: false, reason: '코너 슬롯 점유됨' };
    }

    if (definition.allowedOn === 'ground') {
      return z === 0 ? { ok: true } : { ok: false, reason: '지면 전용' };
    }

    if (!definition.requiresSupport) {
      return { ok: true };
    }

    const supportCell = z === 0 ? cell : this.cells.get(this.toKey(x, y, z - 1));
    if (!supportCell) {
      return { ok: false, reason: '지지대 없음' };
    }

    const supportParts = this.getPartsFromCell(supportCell);

    if (definition.allowedOn === 'any') {
      return supportParts.length > 0 ? { ok: true } : { ok: false, reason: '지지대 없음' };
    }

    return supportParts.some((part) => definition.allowedOn.includes(part.partId))
      ? { ok: true }
      : { ok: false, reason: '부적합한 지지대' };
  }

  findAtSlot(
    x: number,
    y: number,
    z: number,
    slotKind: BuildSlotKind,
    rotation: BuildRotation,
  ): PlacedBuildPart | null {
    const cell = this.cells.get(this.toKey(x, y, z));
    if (!cell) return null;

    if (slotKind === 'tile') {
      return cell.tile ? this.parts.get(cell.tile) ?? null : null;
    }

    if (slotKind === 'edge') {
      const entityId = cell.edges[rotationToEdge(rotation)];
      return entityId ? this.parts.get(entityId) ?? null : null;
    }

    const entityId = cell.corners[rotationToCorner(rotation)];
    return entityId ? this.parts.get(entityId) ?? null : null;
  }

  findTopAtCell(x: number, y: number, z: number, preferredRotation: BuildRotation): PlacedBuildPart | null {
    const cell = this.cells.get(this.toKey(x, y, z));
    if (!cell) return null;

    const preferredEdge = cell.edges[rotationToEdge(preferredRotation)];
    if (preferredEdge) return this.parts.get(preferredEdge) ?? null;

    const preferredCorner = cell.corners[rotationToCorner(preferredRotation)];
    if (preferredCorner) return this.parts.get(preferredCorner) ?? null;

    const edgePart = Object.values(cell.edges)
      .map((entityId) => entityId ? this.parts.get(entityId) : null)
      .find((part): part is PlacedBuildPart => Boolean(part));
    if (edgePart) return edgePart;

    const cornerPart = Object.values(cell.corners)
      .map((entityId) => entityId ? this.parts.get(entityId) : null)
      .find((part): part is PlacedBuildPart => Boolean(part));
    if (cornerPart) return cornerPart;

    return cell.tile ? this.parts.get(cell.tile) ?? null : null;
  }

  findDoorAtCell(x: number, y: number, z: number, preferredRotation: BuildRotation): PlacedBuildPart | null {
    const cell = this.cells.get(this.toKey(x, y, z));
    if (!cell) return null;

    const preferred = cell.edges[rotationToEdge(preferredRotation)];
    const preferredPart = preferred ? this.parts.get(preferred) ?? null : null;
    if (preferredPart?.partId === 'door') return preferredPart;

    return Object.values(cell.edges)
      .map((entityId) => entityId ? this.parts.get(entityId) : null)
      .find((part): part is PlacedBuildPart => part?.partId === 'door') ?? null;
  }

  clear(): void {
    this.cells.clear();
    this.parts.clear();
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
    return [
      cell.tile,
      ...Object.values(cell.edges),
      ...Object.values(cell.corners),
    ]
      .filter((entityId): entityId is string => typeof entityId === 'string')
      .map((entityId) => this.parts.get(entityId))
      .filter((part): part is PlacedBuildPart => Boolean(part));
  }

  private toKey(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }
}
