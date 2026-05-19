import { Container } from 'pixi.js';
import { BUILD_PARTS } from './BuildingParts';
import { getIsoZIndex } from './IsoBuildingMath';
import { BuildingPlacementRenderer } from './BuildingPlacementRenderer';
import type { BuildPartId, BuildRotation, PlacedBuildPart } from './BuildingTypes';

export type BuildingGhostPreview = {
  partId: BuildPartId;
  x: number;
  y: number;
  z: number;
  rotation: BuildRotation;
  canPlace: boolean;
};

export class BuildingGhostPreviewRenderer {
  readonly container = new Container();

  private readonly partRenderer = new BuildingPlacementRenderer();
  private visiblePartId: string | null = null;

  constructor() {
    this.container.zIndex = 90;
    this.container.sortableChildren = true;
    this.container.addChild(this.partRenderer.container);
    this.hide();
  }

  show(preview: BuildingGhostPreview): void {
    const definition = BUILD_PARTS[preview.partId];
    if (!definition) {
      this.hide();
      return;
    }

    const ghostPart: PlacedBuildPart = {
      entityId: 'ghost-preview',
      ownerId: 'client-preview',
      partId: preview.partId,
      x: preview.x,
      y: preview.y,
      z: preview.z,
      rotation: preview.rotation,
      state: preview.partId === 'door' ? { open: false } : undefined,
      createdAt: 0,
    };

    this.visiblePartId = preview.partId;
    this.partRenderer.addOrUpdate(ghostPart);
    this.partRenderer.container.alpha = preview.canPlace ? 0.62 : 0.36;
    this.partRenderer.container.visible = true;
    this.container.zIndex = getIsoZIndex(preview.x, preview.y, preview.z, 900);
  }

  hide(): void {
    this.visiblePartId = null;
    this.partRenderer.clear();
    this.partRenderer.container.visible = false;
  }

  getVisiblePartId(): string | null {
    return this.visiblePartId;
  }

  destroy(): void {
    this.partRenderer.clear();
    this.container.destroy({ children: true });
  }
}
