import { Container, Graphics } from 'pixi.js';
import { BUILD_PARTS } from './BuildingParts';
import { getIsoZIndex, gridToScreen, ISO_TILE_HEIGHT, ISO_TILE_WIDTH } from './IsoBuildingMath';
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
  private readonly outline = new Graphics();
  private visiblePartId: string | null = null;

  constructor() {
    this.container.zIndex = 90;
    this.container.sortableChildren = true;
    this.container.addChild(this.partRenderer.container, this.outline);
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
    this.partRenderer.container.alpha = preview.canPlace ? 0.58 : 0.28;
    this.partRenderer.container.visible = true;
    this.container.zIndex = getIsoZIndex(preview.x, preview.y, preview.z, 900);

    this.drawPlacementOutline(preview);
  }

  hide(): void {
    this.visiblePartId = null;
    this.outline.clear();
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

  private drawPlacementOutline(preview: BuildingGhostPreview): void {
    const definition = BUILD_PARTS[preview.partId];
    const center = gridToScreen(preview.x, preview.y, preview.z);
    const color = preview.canPlace ? 0x66ff88 : 0xff4f5f;
    const halfW = ISO_TILE_WIDTH / 2;
    const halfH = ISO_TILE_HEIGHT / 2;

    this.outline.clear();

    if (definition.slotKind === 'tile') {
      this.outline
        .moveTo(center.x, center.y - halfH)
        .lineTo(center.x + halfW, center.y)
        .lineTo(center.x, center.y + halfH)
        .lineTo(center.x - halfW, center.y)
        .lineTo(center.x, center.y - halfH)
        .stroke({ width: 3, color, alpha: 0.9 });
      return;
    }

    if (definition.slotKind === 'edge') {
      const segment = getEdgeSegment(center.x, center.y, preview.rotation);
      this.outline
        .moveTo(segment.a.x, segment.a.y)
        .lineTo(segment.b.x, segment.b.y)
        .stroke({ width: 5, color, alpha: 0.95 });
      return;
    }

    const corner = getCornerPoint(center.x, center.y, preview.rotation);
    this.outline
      .circle(corner.x, corner.y, 7)
      .stroke({ width: 3, color, alpha: 0.95 })
      .circle(corner.x, corner.y, 3)
      .fill({ color, alpha: 0.8 });
  }
}

function getEdgeSegment(cx: number, cy: number, rotation: BuildRotation): { a: Point; b: Point } {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;
  const north = { x: cx, y: cy - halfH };
  const east = { x: cx + halfW, y: cy };
  const south = { x: cx, y: cy + halfH };
  const west = { x: cx - halfW, y: cy };

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

function getCornerPoint(cx: number, cy: number, rotation: BuildRotation): Point {
  const halfW = ISO_TILE_WIDTH / 2;
  const halfH = ISO_TILE_HEIGHT / 2;

  switch (rotation) {
    case 0:
      return { x: cx - halfW, y: cy };
    case 1:
      return { x: cx, y: cy - halfH };
    case 2:
      return { x: cx + halfW, y: cy };
    case 3:
      return { x: cx, y: cy + halfH };
  }
}

type Point = {
  x: number;
  y: number;
};
