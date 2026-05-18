import { WorldMapGrid } from './WorldMapGrid';

export type WorldMapPanelOptions = {
  grid: WorldMapGrid;
  onSelectCell: (gridX: number, gridY: number) => void;
  onDeleteCurrentCell: () => void;
};

const VIEW_RADIUS = 2;

export class WorldMapPanel {
  readonly element: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private readonly gridEl: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private openState = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(private readonly options: WorldMapPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'world-map-panel';
    this.element.style.right = '20px';
    this.element.style.top = '220px';
    this.element.hidden = true;

    this.header = document.createElement('div');
    this.header.className = 'world-map-header';

    const title = document.createElement('strong');
    title.textContent = 'World Map';

    const close = document.createElement('button');
    close.className = 'world-map-close';
    close.textContent = '×';
    close.onclick = () => this.close();

    this.header.append(title, close);

    this.controls = document.createElement('div');
    this.controls.className = 'world-map-controls';

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'world-map-grid';

    this.element.append(this.header, this.controls, this.gridEl);
    this.attachDragHandlers();
    this.options.grid.subscribe(() => this.render());
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  open(): void {
    this.openState = true;
    this.element.hidden = false;
    this.render();
  }

  close(): void {
    this.openState = false;
    this.element.hidden = true;
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  private render(): void {
    this.renderControls();
    this.renderGrid();
  }

  private renderControls(): void {
    const current = this.options.grid.current;
    this.controls.innerHTML = '';

    const info = document.createElement('div');
    info.className = 'world-map-info';
    info.textContent = `현재: ${current.gridX}, ${current.gridY}`;

    const row = document.createElement('div');
    row.className = 'world-map-create-row';

    row.append(
      this.createNeighborButton('←', -1, 0),
      this.createNeighborButton('↑', 0, -1),
      this.createNeighborButton('↓', 0, 1),
      this.createNeighborButton('→', 1, 0),
    );

    const deleteButton = document.createElement('button');
    deleteButton.className = 'world-map-delete-current';
    deleteButton.textContent = '현재맵 삭제';
    deleteButton.onclick = () => this.options.onDeleteCurrentCell();

    this.controls.append(info, row, deleteButton);
  }

  private renderGrid(): void {
    const current = this.options.grid.current;
    this.gridEl.innerHTML = '';
    this.gridEl.style.gridTemplateColumns = `repeat(${VIEW_RADIUS * 2 + 1}, 44px)`;

    for (let y = current.gridY - VIEW_RADIUS; y <= current.gridY + VIEW_RADIUS; y += 1) {
      for (let x = current.gridX - VIEW_RADIUS; x <= current.gridX + VIEW_RADIUS; x += 1) {
        this.gridEl.appendChild(this.createCellButton(x, y));
      }
    }
  }

  private createCellButton(gridX: number, gridY: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'world-map-cell';

    const current = this.options.grid.current;
    const exists = this.options.grid.hasCell(gridX, gridY);
    const isCurrent = current.gridX === gridX && current.gridY === gridY;

    if (exists) button.classList.add('exists');
    if (isCurrent) button.classList.add('is-current');

    button.textContent = exists ? `${gridX},${gridY}` : '+';
    button.title = exists ? `이동: ${gridX},${gridY}` : `생성: ${gridX},${gridY}`;
    button.onclick = () => this.options.onSelectCell(gridX, gridY);

    return button;
  }

  private createNeighborButton(label: string, dx: number, dy: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'world-map-action';
    button.textContent = label;
    button.onclick = () => {
      const current = this.options.grid.current;
      this.options.onSelectCell(current.gridX + dx, current.gridY + dy);
    };
    return button;
  }

  private attachDragHandlers(): void {
    this.header.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      const rect = this.element.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      this.header.setPointerCapture(event.pointerId);
    });

    this.header.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.element.style.left = `${event.clientX - this.dragOffsetX}px`;
      this.element.style.right = 'auto';
      this.element.style.top = `${event.clientY - this.dragOffsetY}px`;
    });

    const stopDragging = () => {
      this.dragging = false;
    };

    this.header.addEventListener('pointerup', stopDragging);
    this.header.addEventListener('pointercancel', stopDragging);
  }
}
