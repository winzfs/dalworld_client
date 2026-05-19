import type { BuildPartDefinition, BuildPartId } from "./BuildingTypes";

export const BUILD_PARTS: Record<BuildPartId, BuildPartDefinition> = {
  floor_1x1: {
    id: "floor_1x1",
    label: "바닥",
    category: "floor",
    slotKind: "tile",
    icon: "▱",
    spriteKey: "build_floor_1x1",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: false,
    requiresSupport: false,
    allowedOn: "ground",
    placementCost: [{ itemId: "wood", quantity: 1 }],
  },

  thin_wall: {
    id: "thin_wall",
    label: "얇은 벽",
    category: "wall",
    slotKind: "edge",
    icon: "▌",
    spriteKey: "build_thin_wall",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  roof_1x1: {
    id: "roof_1x1",
    label: "지붕",
    category: "roof",
    slotKind: "tile",
    icon: "⌂",
    spriteKey: "build_roof_1x1",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["thin_wall", "pillar", "door", "window"],
    placementCost: [
      { itemId: "wood", quantity: 2 },
      { itemId: "stone", quantity: 1 },
    ],
  },

  pillar: {
    id: "pillar",
    label: "기둥",
    category: "support",
    slotKind: "corner",
    icon: "▮",
    spriteKey: "build_pillar",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1", "pillar"],
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  door: {
    id: "door",
    label: "문",
    category: "door",
    slotKind: "edge",
    icon: "▯",
    spriteKey: "build_door",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    placementCost: [{ itemId: "wood", quantity: 2 }],
  },

  window: {
    id: "window",
    label: "창문",
    category: "window",
    slotKind: "edge",
    icon: "▣",
    spriteKey: "build_window",
    size: { w: 1, d: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true,
    requiresSupport: true,
    allowedOn: ["floor_1x1"],
    placementCost: [
      { itemId: "wood", quantity: 1 },
      { itemId: "stone", quantity: 1 },
    ],
  },
};

export const BUILD_PART_LIST = Object.values(BUILD_PARTS);

export function getBuildPartDefinition(partId: BuildPartId): BuildPartDefinition {
  return BUILD_PARTS[partId];
}
