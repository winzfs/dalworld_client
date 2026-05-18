import { SCALE_MODES, Texture, type Texture as PixiTexture } from 'pixi.js';
import type { EditorSourceRect } from './types';

const TRANSPARENT_BLACK_THRESHOLD = 10;

export function createTransparentBlackTexture(
  url: string,
  sourceRect: EditorSourceRect | undefined,
): Promise<PixiTexture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      const sx = sourceRect?.x ?? 0;
      const sy = sourceRect?.y ?? 0;
      const sw = sourceRect?.width ?? image.naturalWidth;
      const sh = sourceRect?.height ?? image.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(sw));
      canvas.height = Math.max(1, Math.floor(sh));

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('2D canvas context is not available.'));
        return;
      }

      context.imageSmoothingEnabled = false;
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 0;
        const green = data[index + 1] ?? 0;
        const blue = data[index + 2] ?? 0;

        if (
          red <= TRANSPARENT_BLACK_THRESHOLD &&
          green <= TRANSPARENT_BLACK_THRESHOLD &&
          blue <= TRANSPARENT_BLACK_THRESHOLD
        ) {
          data[index + 3] = 0;
        }
      }

      context.putImageData(imageData, 0, 0);

      const texture = Texture.from(canvas);
      texture.source.scaleMode = SCALE_MODES.NEAREST;
      resolve(texture);
    };

    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}
