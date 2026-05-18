import type { EditorPlacementGameplay, EditorTilesetAsset } from './types';

const FANTASY_ART_ROOT = '/assets/tilesets/fantasy/art/';
const ROCKS_SEGMENT = '/rocks/';
const TREE_BUSHES_SEGMENTS = [
  '/tree and bushes/',
  '/trees and bushes/',
];

export function inferSpriteGameplay(asset: EditorTilesetAsset): EditorPlacementGameplay | undefined {
  if (asset.gameplayDefaults) {
    return cloneGameplay(asset.gameplayDefaults);
  }

  const url = normalizePath(asset.url);
  const filename = getFilename(url);

  if (isFantasyRock(url)) {
    return {
      kind: 'resource',
      resourceType: 'stone',
      blocksMovement: true,
      maxHp: 100,
      respawnMs: 35_000,
    };
  }

  if (isFantasyTree(url, filename)) {
    return {
      kind: 'resource',
      resourceType: 'tree',
      blocksMovement: true,
      maxHp: 75,
      respawnMs: 25_000,
    };
  }

  return undefined;
}

function isFantasyRock(url: string): boolean {
  return url.includes(FANTASY_ART_ROOT) && url.includes(ROCKS_SEGMENT);
}

function isFantasyTree(url: string, filename: string): boolean {
  return (
    url.includes(FANTASY_ART_ROOT) &&
    TREE_BUSHES_SEGMENTS.some((segment) => url.includes(segment)) &&
    filename.includes('tree')
  );
}

function normalizePath(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/');
}

function getFilename(url: string): string {
  return url.split('/').pop() ?? '';
}

function cloneGameplay(gameplay: EditorPlacementGameplay): EditorPlacementGameplay {
  return { ...gameplay };
}
