import type { Facing, MovementKeys } from '../protocol/messages';

export type InputState = {
  keys: MovementKeys;
  facing: Facing;
  /** transient: true exactly once per gather press */
  gatherPressed: boolean;
  /** transient: true exactly once per attack press */
  attackPressed: boolean;
};

/**
 * Keyboard + touch joystick + gather/attack buttons.
 * Owns transient action edges; consumers must call consume*() per frame.
 */
export class InputController {
  readonly state: InputState = {
    keys: { up: false, down: false, left: false, right: false },
    facing: 'down',
    gatherPressed: false,
    attackPressed: false,
  };

  private joystickKeys: MovementKeys = { up: false, down: false, left: false, right: false };
  private keyboardKeys: MovementKeys = { up: false, down: false, left: false, right: false };

  private readonly downHandler = (event: KeyboardEvent) => this.setKey(event.code, true);
  private readonly upHandler = (event: KeyboardEvent) => this.setKey(event.code, false);

  attach(): void {
    window.addEventListener('keydown', this.downHandler);
    window.addEventListener('keyup', this.upHandler);
    window.addEventListener('blur', this.resetKeyboard);
  }

  detach(): void {
    window.removeEventListener('keydown', this.downHandler);
    window.removeEventListener('keyup', this.upHandler);
    window.removeEventListener('blur', this.resetKeyboard);
  }

  /** Touch joystick reports a normalized vector (-1..1). */
  setJoystick(dx: number, dy: number): void {
    const threshold = 0.3;
    this.joystickKeys = {
      up: dy < -threshold,
      down: dy > threshold,
      left: dx < -threshold,
      right: dx > threshold,
    };
    this.merge();
  }

  clearJoystick(): void {
    this.joystickKeys = { up: false, down: false, left: false, right: false };
    this.merge();
  }

  triggerGather(): void {
    this.state.gatherPressed = true;
  }

  consumeGather(): boolean {
    if (!this.state.gatherPressed) return false;
    this.state.gatherPressed = false;
    return true;
  }

  triggerAttack(): void {
    this.state.attackPressed = true;
  }

  consumeAttack(): boolean {
    if (!this.state.attackPressed) return false;
    this.state.attackPressed = false;
    return true;
  }

  private readonly resetKeyboard = (): void => {
    this.keyboardKeys = { up: false, down: false, left: false, right: false };
    this.merge();
  };

  private setKey(code: string, pressed: boolean): void {
    let dirty = false;
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        if (this.keyboardKeys.up !== pressed) { this.keyboardKeys.up = pressed; dirty = true; }
        break;
      case 'KeyS':
      case 'ArrowDown':
        if (this.keyboardKeys.down !== pressed) { this.keyboardKeys.down = pressed; dirty = true; }
        break;
      case 'KeyA':
      case 'ArrowLeft':
        if (this.keyboardKeys.left !== pressed) { this.keyboardKeys.left = pressed; dirty = true; }
        break;
      case 'KeyD':
      case 'ArrowRight':
        if (this.keyboardKeys.right !== pressed) { this.keyboardKeys.right = pressed; dirty = true; }
        break;
      case 'KeyE':
      case 'Space':
        if (pressed) this.triggerGather();
        break;
      case 'KeyF':
      case 'KeyJ':
        if (pressed) this.triggerAttack();
        break;
    }
    if (dirty) this.merge();
  }

  private merge(): void {
    this.state.keys = {
      up: this.keyboardKeys.up || this.joystickKeys.up,
      down: this.keyboardKeys.down || this.joystickKeys.down,
      left: this.keyboardKeys.left || this.joystickKeys.left,
      right: this.keyboardKeys.right || this.joystickKeys.right,
    };
    this.state.facing = computeFacing(this.state.keys, this.state.facing);
  }
}

function computeFacing(keys: MovementKeys, current: Facing): Facing {
  let dx = 0;
  let dy = 0;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
