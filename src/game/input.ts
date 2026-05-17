export type MovementKeys = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export class KeyboardInput {
  readonly keys: MovementKeys = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private readonly downHandler = (event: KeyboardEvent) => this.setKey(event.code, true);
  private readonly upHandler = (event: KeyboardEvent) => this.setKey(event.code, false);

  attach(): void {
    window.addEventListener('keydown', this.downHandler);
    window.addEventListener('keyup', this.upHandler);
  }

  detach(): void {
    window.removeEventListener('keydown', this.downHandler);
    window.removeEventListener('keyup', this.upHandler);
  }

  private setKey(code: string, pressed: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.up = pressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.down = pressed;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = pressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = pressed;
        break;
    }
  }
}
