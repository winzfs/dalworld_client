export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;
export const ISO_LAYER_HEIGHT = 32;

export type IsoScreenPoint = {
  x: number;
  y: number;
};

export function gridToScreen(x: number, y: number, z: number): IsoScreenPoint {
  return {
    x: (x - y) * (ISO_TILE_WIDTH / 2),
    y: (x + y) * (ISO_TILE_HEIGHT / 2) - z * ISO_LAYER_HEIGHT,
  };
}

export function screenToGridApprox(screenX: number, screenY: number, z = 0): { x: number; y: number; z: number } {
  const adjustedY = screenY + z * ISO_LAYER_HEIGHT;

  return {
    x: Math.floor(adjustedY / ISO_TILE_HEIGHT + screenX / ISO_TILE_WIDTH),
    y: Math.floor(adjustedY / ISO_TILE_HEIGHT - screenX / ISO_TILE_WIDTH),
    z,
  };
}

export function getIsoZIndex(x: number, y: number, z: number, offset = 0): number {
  return (x + y) * 10000 + z * 1000 + offset;
}

/**
 * Depth value for regular world entities that use world pixel coordinates.
 *
 * Building parts are sorted by isometric grid coordinates. Characters and
 * monsters still move in world-pixel coordinates, so this helper maps their
 * foot position to the same broad depth range without requiring grid ownership.
 */
export function getWorldEntityZIndex(worldY: number, offset = 0): number {
  return Math.round(worldY * 100) + offset;
}
