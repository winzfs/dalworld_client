import { Rectangle, Texture } from 'pixi.js';

export async function loadSpriteStrip(
  src: string,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
): Promise<Texture[]> {
  const image = await loadImage(src);
  const sheet = Texture.from(image);
  sheet.source.scaleMode = 'nearest';

  return Array.from({ length: frameCount }, (_, index) => {
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(index * frameWidth, 0, frameWidth, frameHeight),
    });
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load sprite strip: ${src}`));
    image.src = src;
  });
}
