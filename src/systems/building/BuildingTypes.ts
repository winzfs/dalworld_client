import type { InventoryItemStack } from "../inventory/InventoryTypes";

export type BuildPartId =
  | "floor_1x1"
  | "wall_ne"
  | "wall_nw"
  | "corner"
  | "column"
  | "stair"
  | "roof"
  | "door";

export type BuildCategory =
  | "floor"
  | "wall"
  | "support"
  | "stair"
  | "roof"
  | "door"
  | "decor";

export type BuildRotation = 0 | 1 | 2 | 3;

export type BuildPartDefinition = {
  id: BuildPartId;
  label: string;
  category: BuildCategory;
  icon: string;
  spriteKey: string;
  size: {
    w: number;
    d: number;
    h: number;
  };
  anchor: {
    x: number;
    y: number;
  };
  blocksMovement: boolean;
  requiresSupport: boolean;
  allowedOn: "any" | "ground" | BuildPartId[];
  allowStackSameCell: boolean;
  placementCost: InventoryItemStack[];
};

export type PlacedBuildPart = {
  entityId: string;
  ownerId: string;
  partId: BuildPartId;
  x: number;
  y: number;
  z: number;
  rotation: BuildRotation;
  createdAt: number;
};

export type BuildingSnapshot = {
  parts: PlacedBuildPart[];
  updatedAt: number;
};

export type BuildPlaceRequest = {
  type: "BUILD_PLACE_REQUEST";
  requestId: string;
  partId: BuildPartId;
  x: number;
  y: number;
  z: number;
  rotation: BuildRotation;
};

export type BuildRemoveRequest = {
  type: "BUILD_REMOVE_REQUEST";
  requestId: string;
  entityId: string;
};

export type BuildingClientMessage = BuildPlaceRequest | BuildRemoveRequest;

export type BuildPlacedEvent = {
  type: "BUILD_PLACED";
  part: PlacedBuildPart;
};

export type BuildRemovedEvent = {
  type: "BUILD_REMOVED";
  entityId: string;
};

export type BuildRejectedEvent = {
  type: "BUILD_REJECTED";
  requestId: string;
  reason: string;
};

export type BuildSnapshotEvent = {
  type: "BUILD_SNAPSHOT";
  snapshot: BuildingSnapshot;
};

export type InventorySnapshotEvent = {
  type: "INVENTORY_SNAPSHOT";
  ownerId: string;
  items: InventoryItemStack[];
  updatedAt: number;
};

export type BuildingServerEvent =
  | BuildPlacedEvent
  | BuildRemovedEvent
  | BuildRejectedEvent
  | BuildSnapshotEvent
  | InventorySnapshotEvent;
