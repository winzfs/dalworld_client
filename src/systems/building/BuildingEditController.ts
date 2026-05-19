import { BUILD_PARTS } from './BuildingParts';
import type { ClientBuildingOccupancy } from './ClientBuildingOccupancy';
import type { BuildingEditDraft, BuildingGridPoint } from './BuildingEditTypes';
import type { BuildPartId, BuildPlaceRequest, BuildRotation, BuildUpdateRequest, PlacedBuildPart } from './BuildingTypes';

export type BuildingEditCommand = BuildPlaceRequest | BuildUpdateRequest;

export type BuildingEditValidation = {
  ok: boolean;
  reason?: string;
};

export type BuildingEditControllerOptions = {
  occupancy: ClientBuildingOccupancy;
  createRequestId: () => string;
};

export class BuildingEditController {
  private readonly occupancy: ClientBuildingOccupancy;
  private readonly createRequestId: () => string;
  private draft: BuildingEditDraft | null = null;

  constructor(options: BuildingEditControllerOptions) {
    this.occupancy = options.occupancy;
    this.createRequestId = options.createRequestId;
  }

  getDraft(): BuildingEditDraft | null {
    return this.draft;
  }

  beginNew(partId: BuildPartId, point: BuildingGridPoint, rotation: BuildRotation): BuildingEditDraft {
    return this.setDraft({
      source: 'new',
      partId,
      x: point.x,
      y: point.y,
      z: point.z,
      rotation,
    });
  }

  beginExisting(part: PlacedBuildPart): BuildingEditDraft {
    return this.setDraft({
      source: 'existing',
      entityId: part.entityId,
      partId: part.partId,
      x: part.x,
      y: part.y,
      z: part.z,
      rotation: part.rotation,
    });
  }

  moveTo(point: BuildingGridPoint): BuildingEditDraft | null {
    if (!this.draft) return null;
    return this.setDraft({ ...this.draft, x: point.x, y: point.y, z: point.z });
  }

  moveBy(dx: number, dy: number, z: number): BuildingEditDraft | null {
    if (!this.draft) return null;
    return this.setDraft({ ...this.draft, x: this.draft.x + dx, y: this.draft.y + dy, z });
  }

  setLayer(z: number): BuildingEditDraft | null {
    if (!this.draft) return null;
    return this.setDraft({ ...this.draft, z: Math.max(0, Math.floor(z)) });
  }

  rotate(): BuildingEditDraft | null {
    if (!this.draft) return null;
    return this.setDraft({ ...this.draft, rotation: ((this.draft.rotation + 1) % 4) as BuildRotation });
  }

  validate(draft: BuildingEditDraft | null = this.draft): BuildingEditValidation {
    if (!draft) return { ok: false, reason: '편집 중인 건설 부품이 없습니다.' };

    const definition = BUILD_PARTS[draft.partId];
    if (!definition) return { ok: false, reason: '부품 정의 없음' };

    const check = this.occupancy.canPlaceIgnoring(
      definition,
      draft.x,
      draft.y,
      draft.z,
      draft.rotation,
      draft.entityId ?? null,
    );

    return check.ok ? { ok: true } : { ok: false, reason: check.reason };
  }

  createConfirmCommand(): BuildingEditCommand | null {
    const draft = this.draft;
    if (!draft || !this.validate(draft).ok) return null;

    if (draft.source === 'existing' && draft.entityId) {
      return {
        type: 'BUILD_UPDATE_REQUEST',
        requestId: this.createRequestId(),
        entityId: draft.entityId,
        x: draft.x,
        y: draft.y,
        z: draft.z,
        rotation: draft.rotation,
      };
    }

    return {
      type: 'BUILD_PLACE_REQUEST',
      requestId: this.createRequestId(),
      partId: draft.partId,
      x: draft.x,
      y: draft.y,
      z: draft.z,
      rotation: draft.rotation,
    };
  }

  clear(): void {
    this.draft = null;
  }

  private setDraft(draft: BuildingEditDraft): BuildingEditDraft {
    this.draft = draft;
    return draft;
  }
}
