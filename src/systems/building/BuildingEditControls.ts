export type BuildingEditControlsHandlers = {
  onMoveStart: (event: PointerEvent) => void;
  onToggleGrid: () => void;
  onRotate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * DOM overlay controls shown near the active building preview.
 *
 * This class intentionally avoids Pixi.js dependencies. GameApp owns positioning
 * and building logic, while this class owns only button DOM and pointer events.
 */
export class BuildingEditControls {
  readonly move: HTMLButtonElement;

  private readonly root: HTMLDivElement;
  private readonly grid: HTMLButtonElement;
  private readonly rotate: HTMLButtonElement;
  private readonly confirm: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private mounted = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'building-edit-controls';
    this.root.hidden = true;
    this.root.style.position = 'fixed';
    this.root.style.left = '0px';
    this.root.style.top = '0px';
    this.root.style.zIndex = '80';
    this.root.style.display = 'flex';
    this.root.style.gap = '6px';
    this.root.style.pointerEvents = 'auto';
    this.root.style.userSelect = 'none';
    this.root.style.touchAction = 'none';

    this.move = this.createButton('↕', '이동');
    this.grid = this.createButton('▦', '그리드 켜기/끄기');
    this.rotate = this.createButton('⟳', '회전');
    this.confirm = this.createButton('✓', '확정');
    this.cancel = this.createButton('×', '취소');

    this.confirm.classList.add('is-confirm');
    this.cancel.classList.add('is-cancel');

    this.root.append(this.move, this.grid, this.rotate, this.confirm, this.cancel);
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.root);
    this.mounted = true;
  }

  bind(handlers: BuildingEditControlsHandlers): void {
    this.move.addEventListener('pointerdown', handlers.onMoveStart);
    this.grid.addEventListener('click', handlers.onToggleGrid);
    this.rotate.addEventListener('click', handlers.onRotate);
    this.confirm.addEventListener('click', handlers.onConfirm);
    this.cancel.addEventListener('click', handlers.onCancel);
  }

  showAt(x: number, y: number): void {
    this.root.hidden = false;
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(y)}px`;
  }

  hide(): void {
    this.root.hidden = true;
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.root.contains(target);
  }

  setValid(valid: boolean): void {
    this.confirm.disabled = !valid;
    this.confirm.classList.toggle('is-disabled', !valid);
    this.confirm.title = valid ? '건설 확정' : '배치할 수 없는 위치입니다.';
  }

  setGridVisible(visible: boolean): void {
    this.grid.classList.toggle('is-active', visible);
    this.grid.title = visible ? '그리드 끄기' : '그리드 켜기';
  }

  private createButton(label: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'building-edit-control-button';
    button.textContent = label;
    button.title = title;
    button.style.width = '30px';
    button.style.height = '30px';
    button.style.border = '1px solid rgba(255,255,255,.26)';
    button.style.borderRadius = '999px';
    button.style.background = 'rgba(10,16,22,.88)';
    button.style.color = '#fff';
    button.style.boxShadow = '0 4px 14px rgba(0,0,0,.32)';
    button.style.fontWeight = '700';
    button.style.cursor = 'pointer';
    button.style.touchAction = 'none';
    return button;
  }
}
