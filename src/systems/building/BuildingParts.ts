import type { BuildPartDefinition, BuildPartId } from "./BuildingTypes";

export const BUILD_PARTS: Record<BuildPartId, BuildPartDefinition> = {
  floor_1x1: {
    id: "floor_1x1",
    label: "바닥",
    category: "floor",
    icon: "▱",
    spriteKey: "build_floor_1x1",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: false,
    requiresSupport: false,
    allowedOn: "ground",
    allowStackSameCell: false,
    placementCost: [{ itemId: "wood", quantity: 1 }],
  },

  wall_ne: {
    id: "wall_ne",
    label: "벽 NE",
    category: "wall",
    icon: "╱",
    spriteKey: "build_wall_ne",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    allowStackSameCell: false,
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  wall_nw: {
    id: "wall_nw",
    label: "벽 NW",
    category: "wall",
    icon: "╲",
    spriteKey: "build_wall_nw",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    allowStackSameCell: false,
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  corner: {
    id: "corner",
    label: "코너",
    category: "wall",
    icon: "┓",
    spriteKey: "build_corner",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    allowStackSameCell: false,
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  column: {
    id: "column",
    label: "기둥",
    category: "support",
    icon: "▮",
    spriteKey: "build_column",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1", "column"],
    allowStackSameCell: false,
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  stair: {
    id: "stair",
    label: "계단",
    category: "stair",
    icon: "▰",
    spriteKey: "build_stair",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: false,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    allowStackSameCell: false,
    placementCost: [
      { itemId: "wood", quantity: 2 },
      { itemId: "stone", quantity: 1 },
    ],
  },

  roof: {
    id: "roof",
    label: "지붕",
    category: "roof",
    icon: "⌂",
    spriteKey: "build_roof",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["wall_ne", "wall_nw", "corner", "column"],
    allowStackSameCell: false,
    placementCost: [
      { itemId: "wood", quantity: 2 },
      { itemId: "fiber", quantity: 1 },
    ],
  },

  door: {
    id: "door",
    label: "문",
    category: "door",
    icon: "▯",
    spriteKey: "build_door",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: false,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    allowStackSameCell: false,
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },
};

export const BUILD_PART_LIST = Object.values(BUILD_PARTS);

export function getBuildPartDefinition(partId: BuildPartId): BuildPartDefinition {
  return BUILD_PARTS[partId];
}
