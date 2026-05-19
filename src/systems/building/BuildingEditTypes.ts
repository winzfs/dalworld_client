import type { BuildPartId, BuildRotation } from './BuildingTypes';

export type BuildingEditDraft = {
  source: 'new' | 'existing';
  entityId?: string;
  partId: BuildPartId;
  x: number;
  y: number;
  z: number;
  rotation: BuildRotation;
};

export type BuildingGridPoint = {
  x: number;
  y: number;
  z: number;
};

export type BuildingDragState = {
  pointerId: number;
  z: number;
  startGrid: BuildingGridPoint;
  originDraft: BuildingEditDraft;
};
