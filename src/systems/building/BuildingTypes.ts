import type { InventoryItemStack } from "../inventory/InventoryTypes";

export type BuildPartId =
  | "floor_1x1"
  | "stone_floor_1x1"
  | "deck_floor_1x1"
  | "wood_half_floor"
  | "stone_half_floor"
  | "wood_stairs"
  | "stone_stairs"
  | "wood_round_floor"
  | "stone_round_floor"
  | "thin_wall"
  | "stone_wall"
  | "half_wall"
  | "railing"
  | "fence"
  | "wood_wall_corner"
  | "stone_wall_corner"
  | "wood_wall_end"
  | "stone_wall_end"
  | "wood_gable_wall"
  | "stone_gable_wall"
  | "wood_round_wall"
  | "stone_round_wall"
  | "roof_1x1"
  | "flat_roof_1x1"
  | "thatch_roof_1x1"
  | "wood_roof_slope"
  | "stone_roof_slope"
  | "thatch_roof_slope"
  | "wood_eave"
  | "stone_eave"
  | "thatch_eave"
  | "pillar"
  | "stone_pillar"
  | "short_post"
  | "door"
  | "stone_door"
  | "window"
  | "wide_window";

export type BuildCategory =
  | "floor"
  | "wall"
  | "support"
  | "roof"
  | "door"
  | "window";

export type BuildSlotKind = "tile" | "edge" | "corner";
export type BuildEdge = "north" | "east" | "south" | "west";
export type BuildCorner = "nw" | "ne" | "se" | "sw";
export type BuildRotation = 0 | 1 | 2 | 3;

const BUILD_EDGES: readonly BuildEdge[] = ["north", "east", "south", "west"];
const BUILD_CORNERS: readonly BuildCorner[] = ["nw", "ne", "se", "sw"];

export type BuildPartDefinition = {
  id: BuildPartId;
  label: string;
  category: BuildCategory;
  slotKind: BuildSlotKind;
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
  placementCost: InventoryItemStack[];
};

export type BuildPartState = {
  open?: boolean;
};

export type PlacedBuildPart = {
  entityId: string;
  ownerId: string;
  partId: BuildPartId;
  x: number;
  y: number;
  z: number;
  rotation: BuildRotation;
  state?: BuildPartState;
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

export type BuildUpdateRequest = {
  type: "BUILD_UPDATE_REQUEST";
  requestId: string;
  entityId: string;
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

export type BuildDoorToggleRequest = {
  type: "BUILD_DOOR_TOGGLE_REQUEST";
  requestId: string;
  entityId: string;
};

export type BuildingClientMessage = BuildPlaceRequest | BuildUpdateRequest | BuildRemoveRequest | BuildDoorToggleRequest;

export type BuildPlacedEvent = {
  type: "BUILD_PLACED";
  part: PlacedBuildPart;
};

export type BuildUpdatedEvent = {
  type: "BUILD_UPDATED";
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

export type BuildDoorUpdatedEvent = {
  type: "BUILD_DOOR_UPDATED";
  entityId: string;
  open: boolean;
};

export type InventorySnapshotEvent = {
  type: "INVENTORY_SNAPSHOT";
  ownerId: string;
  items: InventoryItemStack[];
  updatedAt: number;
};

export type BuildingServerEvent =
  | BuildPlacedEvent
  | BuildUpdatedEvent
  | BuildRemovedEvent
  | BuildRejectedEvent
  | BuildSnapshotEvent
  | BuildDoorUpdatedEvent
  | InventorySnapshotEvent;

export function rotationToEdge(rotation: BuildRotation): BuildEdge {
  return BUILD_EDGES[rotation];
}

export function rotationToCorner(rotation: BuildRotation): BuildCorner {
  return BUILD_CORNERS[rotation];
}
