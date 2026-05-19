import { BUILD_PARTS } from './BuildingParts';
import { BuildingEditController, type BuildingEditCommand, type BuildingEditValidation } from './BuildingEditController';
import type { BuildingDragState, BuildingEditDraft, BuildingGridPoint } from './BuildingEditTypes';
import type { ClientBuildingOccupancy } from './ClientBuildingOccupancy';
import type { BuildPartId, BuildRotation, PlacedBuildPart } from './BuildingTypes';

export type BuildingEditCoordinatorOptions = {
  occupancy: ClientBuildingOccupancy;
  createRequestId: () => string;
};

export type BuildingEditDragStartInput = {
  pointerId: number;
  startGrid: BuildingGridPoint;
};

/**
 * Small state coordinator around BuildingEditController.
 *
 * GameApp owns rendering, networking and pointer conversion. This class owns only
 * the edit draft and drag state, so it can be tested/replaced without Pixi.js.
 */
export class BuildingEditCoordinator {
  private readonly controller: BuildingEditController;
  private dragState: BuildingDragState | null = null;

  constructor(options: BuildingEditCoordinatorOptions) {
    this.controller = new BuildingEditController({
      occupancy: options.occupancy,
      createRequestId: options.createRequestId,
    });
  }

  getDraft(): BuildingEditDraft | null {
    return this.controller.getDraft();
  }

  getDragState(): BuildingDragState | null {
    return this.dragState;
  }

  hasDraft(): boolean {
    return this.controller.getDraft() !== null;
  }

  isDragging(): boolean {
    return this.dragState !== null;
  }

  beginNew(partId: BuildPartId, point: BuildingGridPoint, rotation: BuildRotation): BuildingEditDraft {
    return this.controller.beginNew(partId, point, rotation);
  }

  beginExisting(part: PlacedBuildPart): BuildingEditDraft {
    return this.controller.beginExisting(part);
  }

  moveTo(point: BuildingGridPoint): BuildingEditDraft | null {
    return this.controller.moveTo(point);
  }

  moveDragged(currentGrid: BuildingGridPoint): BuildingEditDraft | null {
    if (!this.dragState) return null;
    const dx = currentGrid.x - this.dragState.startGrid.x;
    const dy = currentGrid.y - this.dragState.startGrid.y;

    return this.controller.moveTo({
      x: this.dragState.originDraft.x + dx,
      y: this.dragState.originDraft.y + dy,
      z: currentGrid.z,
    });
  }

  setLayer(z: number): BuildingEditDraft | null {
    return this.controller.setLayer(z);
  }

  rotate(): BuildingEditDraft | null {
    return this.controller.rotate();
  }

  validate(draft: BuildingEditDraft | null = this.controller.getDraft()): BuildingEditValidation {
    return this.controller.validate(draft);
  }

  canConfirm(): boolean {
    return this.controller.validate().ok;
  }

  createConfirmCommand(): BuildingEditCommand | null {
    return this.controller.createConfirmCommand();
  }

  startDrag(input: BuildingEditDragStartInput): BuildingDragState | null {
    const draft = this.controller.getDraft();
    if (!draft) return null;

    this.dragState = {
      pointerId: input.pointerId,
      z: draft.z,
      startGrid: input.startGrid,
      originDraft: { ...draft },
    };
    return this.dragState;
  }

  stopDrag(pointerId: number): boolean {
    if (this.dragState?.pointerId !== pointerId) return false;
    this.dragState = null;
    return true;
  }

  clear(): void {
    this.dragState = null;
    this.controller.clear();
  }

  canPreviewPlacement(partId: BuildPartId, point: BuildingGridPoint, rotation: BuildRotation): boolean {
    const definition = BUILD_PARTS[partId];
    if (!definition) return false;
    return this.controller.validate({
      source: 'new',
      partId,
      x: point.x,
      y: point.y,
      z: point.z,
      rotation,
    }).ok;
  }
}
