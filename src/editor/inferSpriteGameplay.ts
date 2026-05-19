import type { EditorPlacementGameplay, EditorTilesetAsset } from './types';

const FANTASY_ART_ROOT = '/assets/tilesets/fantasy/art/';
const ROCK_KEYWORDS = ['rock', 'rocks', 'stone', 'boulder'];
const TREE_KEYWORDS = ['tree', 'trees', 'wood'];
const NON_TREE_FILENAME_KEYWORDS = ['bush', 'grass', 'flower', 'plant', 'shrub'];

export function inferSpriteGameplay(asset: EditorTilesetAsset): EditorPlacementGameplay | undefined {
  if (asset.gameplayDefaults) {
    return cloneGameplay(asset.gameplayDefaults);
  }

  const url = normalizePath(asset.url);
  const filename = getFilename(url);
  const name = normalizeText(asset.name);
  const searchable = `${url} ${name}`;

  if (isFantasyRock(searchable)) {
    return {
      kind: 'resource',
      resourceType: 'stone',
      blocksMovement: true,
      maxHp: 100,
      respawnMs: 35_000,
    };
  }

  if (isFantasyTree(searchable, filename)) {
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

function isFantasyRock(searchable: string): boolean {
  return searchable.includes(FANTASY_ART_ROOT) && hasKeyword(searchable, ROCK_KEYWORDS);
}

function isFantasyTree(searchable: string, filename: string): boolean {
  if (!searchable.includes(FANTASY_ART_ROOT)) return false;
  if (!hasKeyword(searchable, TREE_KEYWORDS)) return false;

  // Prevent obvious non-tree props in tree/bush collections from becoming harvestable trees.
  return !hasKeyword(filename, NON_TREE_FILENAME_KEYWORDS);
}

function hasKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function normalizePath(value: string): string {
  return normalizeText(value).replace(/\\/g, '/');
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ');
}

function getFilename(url: string): string {
  return url.split('/').pop() ?? '';
}

function cloneGameplay(gameplay: EditorPlacementGameplay): EditorPlacementGameplay {
  return { ...gameplay };
}
