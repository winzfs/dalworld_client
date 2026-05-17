import type { InputController } from '../game/InputController';

const JOYSTICK_RADIUS = 64;
const KNOB_RADIUS = 28;

/**
 * Touch-only virtual joystick + gather + fullscreen buttons.
 * Hidden on devices without touch support.
 */
export class MobileControls {
  private readonly root: HTMLDivElement;
  private readonly joystickEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;
  private readonly gatherBtn: HTMLButtonElement;
  private readonly fullscreenBtn: HTMLButtonElement;

  private activePointerId: number | null = null;
  private originX = 0;
  private originY = 0;

  constructor(private readonly input: InputController) {
    this.root = document.createElement('div');
    this.root.id = 'dalworld-mobile';

    this.joystickEl = document.createElement('div');
    this.joystickEl.className = 'joystick';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joystick-knob';
    this.joystickEl.appendChild(this.knobEl);

    this.gatherBtn = document.createElement('button');
    this.gatherBtn.type = 'button';
    this.gatherBtn.className = 'action-btn gather-btn';
    this.gatherBtn.textContent = 'E';
    this.gatherBtn.setAttribute('aria-label', 'gather');

    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.type = 'button';
    this.fullscreenBtn.className = 'action-btn fullscreen-btn';
    this.fullscreenBtn.textContent = '⛶';
    this.fullscreenBtn.setAttribute('aria-label', 'fullscreen');

    this.root.append(this.joystickEl, this.gatherBtn, this.fullscreenBtn);
    document.body.appendChild(this.root);

    this.attach();
    if (!this.isTouchDevice()) {
      this.root.classList.add('desktop-hidden');
    }
  }

  private isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  private attach(): void {
    this.joystickEl.addEventListener('pointerdown', this.handleStart);
    this.joystickEl.addEventListener('pointermove', this.handleMove);
    this.joystickEl.addEventListener('pointerup', this.handleEnd);
    this.joystickEl.addEventListener('pointercancel', this.handleEnd);
    this.joystickEl.addEventListener('pointerleave', this.handleEnd);

    this.gatherBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.triggerGather();
    });

    this.fullscreenBtn.addEventListener('click', () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        void document.exitFullscreen?.();
      } else {
        void document.documentElement.requestFullscreen?.();
      }
    });
  }

  private readonly handleStart = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    const rect = this.joystickEl.getBoundingClientRect();
    this.originX = rect.left + rect.width / 2;
    this.originY = rect.top + rect.height / 2;
    this.joystickEl.setPointerCapture(event.pointerId);
    this.updateKnob(event.clientX, event.clientY);
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.updateKnob(event.clientX, event.clientY);
  };

  private readonly handleEnd = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.knobEl.style.transform = 'translate(-50%, -50%)';
    this.input.clearJoystick();
    try {
      this.joystickEl.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  private updateKnob(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(JOYSTICK_RADIUS, distance);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * clamped;
    const knobY = Math.sin(angle) * clamped;

    this.knobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

    if (distance < 1) {
      this.input.clearJoystick();
      return;
    }
    this.input.setJoystick(Math.cos(angle), Math.sin(angle));
  }
}

export const MOBILE_CONSTANTS = { JOYSTICK_RADIUS, KNOB_RADIUS };
