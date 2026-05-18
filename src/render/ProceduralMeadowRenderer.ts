import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

const TILESET_URL = '/assets/tilesets/fantasy/Art/Ground Tileset/Tileset_Ground.png';
const TILE_SIZE = 16;
const TILESET_COLUMNS = 12;
const RENDER_SCALE = 4;

const GRASS_TILES = [14, 20, 95, 96, 97, 98, 99, 100, 101, 108, 109, 110, 111, 112, 113];
const DARK_GRASS_TILES = [0, 1, 2, 3, 4, 5, 12, 13, 15, 16, 17];
const DIRT_TILES = [6, 7, 8, 9, 10, 11, 18, 19, 21, 22, 23];

export type ProceduralMeadowOptions = {
  worldWidth: number;
  worldHeight: number;
  seed?: number;
};

export class ProceduralMeadowRenderer {
  readonly layer = new Container();

  private readonly textures = new Map<number, Texture>();
  private readonly seed: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private ready = false;

  constructor(parent: Container, options: ProceduralMeadowOptions) {
    this.worldWidth = options.worldWidth;
    this.worldHeight = options.worldHeight;
    this.seed = options.seed ?? 20260518;
    this.layer.label = 'procedural-meadow';
    parent.addChild(this.layer);
  }

  async load(): Promise<void> {
    if (this.ready) return;

    const image = await loadImage(TILESET_URL);
    const sheet = Texture.from(image);
    sheet.source.scaleMode = 'nearest';

    const cols = Math.ceil(this.worldWidth / (TILE_SIZE * RENDER_SCALE));
    const rows = Math.ceil(this.worldHeight / (TILE_SIZE * RENDER_SCALE));

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const tileId = this.pickTile(x, y);
        const sprite = new Sprite(this.getTileTexture(sheet, tileId));
        sprite.x = x * TILE_SIZE * RENDER_SCALE;
        sprite.y = y * TILE_SIZE * RENDER_SCALE;
        sprite.scale.set(RENDER_SCALE);
        this.layer.addChild(sprite);
      }
    }

    this.ready = true;
  }

  private pickTile(x: number, y: number): number {
    const patch = noise2d(x * 0.08, y * 0.08, this.seed);
    const detail = noise2d(x * 0.43 + 19.7, y * 0.43 - 3.1, this.seed + 77);
    const speckle = rand2d(x, y, this.seed + 1337);

    if (patch > 0.72 && detail > 0.46) {
      return pickWeighted(DIRT_TILES, x, y, this.seed + 3);
    }

    if (patch < 0.22 || speckle > 0.93) {
      return pickWeighted(DARK_GRASS_TILES, x, y, this.seed + 5);
    }

    return pickWeighted(GRASS_TILES, x, y, this.seed + 7);
  }

  private getTileTexture(sheet: Texture, tileId: number): Texture {
    const cached = this.textures.get(tileId);
    if (cached) return cached;

    const col = tileId % TILESET_COLUMNS;
    const row = Math.floor(tileId / TILESET_COLUMNS);
    const texture = new Texture({
      source: sheet.source,
      frame: new Rectangle(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE),
    });

    this.textures.set(tileId, texture);
    return texture;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load meadow tileset: ${src}`));
    image.src = src;
  });
}

function pickWeighted(values: number[], x: number, y: number, seed: number): number {
  const value = rand2d(x, y, seed);
  return values[Math.floor(value * values.length) % values.length];
}

function noise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;

  const a = rand2d(x0, y0, seed);
  const b = rand2d(x0 + 1, y0, seed);
  const c = rand2d(x0, y0 + 1, seed);
  const d = rand2d(x0 + 1, y0 + 1, seed);

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function rand2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
