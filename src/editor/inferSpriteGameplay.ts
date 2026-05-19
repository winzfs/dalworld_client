import type { EditorPlacementGameplay, EditorTilesetAsset } from './types';

export function inferSpriteGameplay(asset: EditorTilesetAsset): EditorPlacementGameplay | undefined {
  if (asset.gameplayDefaults) {
    return cloneGameplay(asset.gameplayDefaults);
  }

  const filename = getFilename(asset.url);

  if (isRockFilename(filename)) {
    return createStoneGameplay();
  }

  if (isTreeFilename(filename)) {
    return createTreeGameplay();
  }

  return undefined;
}

function isRockFilename(filename: string): boolean {
  return filename.toLowerCase().startsWith('rock');
}

function isTreeFilename(filename: string): boolean {
  return filename.toLowerCase().startsWith('tree');
}

function createStoneGameplay(): EditorPlacementGameplay {
  return {
    kind: 'resource',
    resourceType: 'stone',
    blocksMovement: true,
    maxHp: 100,
    respawnMs: 35_000,
  };
}

function createTreeGameplay(): EditorPlacementGameplay {
  return {
    kind: 'resource',
    resourceType: 'tree',
    blocksMovement: true,
    maxHp: 75,
    respawnMs: 25_000,
  };
}

function getFilename(url: string): string {
  return url.split('/').pop() ?? '';
}

function cloneGameplay(gameplay: EditorPlacementGameplay): EditorPlacementGameplay {
  return { ...gameplay };
}
