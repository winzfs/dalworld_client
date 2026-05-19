import { Container, Graphics } from 'pixi.js';
import type { PlayerSnapshot } from '../../protocol/messages';
import type { TimeOfDayState } from './TimeOfDayTypes';

export type TimeOfDayLightingRendererOptions = {
  darknessAlpha?: number;
  softLightRadius?: number;
  safeLightRadius?: number;
};

const DEFAULT_OPTIONS: Required<TimeOfDayLightingRendererOptions> = {
  darknessAlpha: 0.58,
  softLightRadius: 176,
  safeLightRadius: 72,
};

/**
 * Screen-space night overlay.
 *
 * The world simulation owns the actual time-of-day state. This renderer only
 * visualizes the latest server-authoritative state, so gameplay logic stays out
 * of the client.
 */
export class TimeOfDayLightingRenderer {
  readonly container = new Container();

  private readonly darkness = new Graphics();
  private readonly options: Required<TimeOfDayLightingRendererOptions>;
  private mode: TimeOfDayState['mode'] = 'day';
  private lastDrawKey = '';

  constructor(options: TimeOfDayLightingRendererOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.container.eventMode = 'none';
    this.container.visible = false;
    this.container.addChild(this.darkness);
  }

  setState(state: TimeOfDayState): void {
    if (this.mode === state.mode) return;

    this.mode = state.mode;
    this.container.visible = state.mode === 'night';
    this.lastDrawKey = '';

    if (state.mode === 'day') {
      this.darkness.clear();
    }
  }

  update(params: {
    player: PlayerSnapshot | null;
    worldToScreen: (point: { x: number; y: number }) => { x: number; y: number };
    screenWidth: number;
    screenHeight: number;
  }): void {
    if (this.mode !== 'night') return;

    const center = params.player
      ? params.worldToScreen({ x: params.player.x, y: params.player.y })
      : { x: params.screenWidth / 2, y: params.screenHeight / 2 };

    const drawKey = [
      params.screenWidth,
      params.screenHeight,
      Math.round(center.x),
      Math.round(center.y),
    ].join(':');

    if (drawKey === this.lastDrawKey) return;
    this.lastDrawKey = drawKey;

    this.draw({
      screenWidth: params.screenWidth,
      screenHeight: params.screenHeight,
      lightX: center.x,
      lightY: center.y,
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private draw(params: {
    screenWidth: number;
    screenHeight: number;
    lightX: number;
    lightY: number;
  }): void {
    const { screenWidth, screenHeight, lightX, lightY } = params;
    const { darknessAlpha, softLightRadius, safeLightRadius } = this.options;

    const left = Math.max(0, lightX - softLightRadius);
    const right = Math.min(screenWidth, lightX + softLightRadius);
    const top = Math.max(0, lightY - softLightRadius);
    const bottom = Math.min(screenHeight, lightY + softLightRadius);

    this.darkness.clear();

    this.darkness.rect(0, 0, screenWidth, top).fill({ color: 0x020617, alpha: darknessAlpha });
    this.darkness.rect(0, bottom, screenWidth, screenHeight - bottom).fill({ color: 0x020617, alpha: darknessAlpha });
    this.darkness.rect(0, top, left, bottom - top).fill({ color: 0x020617, alpha: darknessAlpha });
    this.darkness.rect(right, top, screenWidth - right, bottom - top).fill({ color: 0x020617, alpha: darknessAlpha });

    this.darkness.circle(lightX, lightY, softLightRadius).stroke({
      color: 0x020617,
      width: Math.max(1, softLightRadius - safeLightRadius),
      alpha: 0.20,
    });

    this.darkness.circle(lightX, lightY, safeLightRadius).stroke({
      color: 0xfff1b8,
      width: 2,
      alpha: 0.12,
    });
  }
}
