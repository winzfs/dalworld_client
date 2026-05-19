export type DraggablePanelOptions = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  parent?: HTMLElement;
  initiallyVisible?: boolean;
};

export class DraggablePanel {
  readonly root: HTMLDivElement;
  readonly body: HTMLDivElement;

  private readonly header: HTMLDivElement;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(options: DraggablePanelOptions) {
    this.root = document.createElement("div");
    this.root.id = options.id;
    this.root.style.position = "fixed";
    this.root.style.left = `${options.x}px`;
    this.root.style.top = `${options.y}px`;
    this.root.style.width = `${options.width}px`;
    this.root.style.zIndex = "1000";
    this.root.style.background = "rgba(20, 24, 32, 0.92)";
    this.root.style.border = "1px solid rgba(255, 255, 255, 0.18)";
    this.root.style.borderRadius = "12px";
    this.root.style.color = "#f5f7fb";
    this.root.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    this.root.style.boxShadow = "0 12px 32px rgba(0, 0, 0, 0.35)";
    this.root.style.userSelect = "none";
    this.root.style.display = options.initiallyVisible === false ? "none" : "block";

    this.header = document.createElement("div");
    this.header.textContent = options.title;
    this.header.style.cursor = "grab";
    this.header.style.padding = "10px 12px";
    this.header.style.fontWeight = "700";
    this.header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.12)";
    this.header.style.background = "rgba(255, 255, 255, 0.06)";
    this.header.style.borderRadius = "12px 12px 0 0";

    this.body = document.createElement("div");
    this.body.style.padding = "12px";

    this.root.append(this.header, this.body);
    (options.parent ?? document.body).appendChild(this.root);

    this.header.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  show(): void {
    this.root.style.display = "block";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  toggle(): void {
    if (this.root.style.display === "none") {
      this.show();
    } else {
      this.hide();
    }
  }

  destroy(): void {
    this.header.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.root.remove();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.isDragging = true;
    this.header.setPointerCapture?.(event.pointerId);
    this.header.style.cursor = "grabbing";

    const rect = this.root.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.isDragging) {
      return;
    }

    const nextX = Math.max(0, Math.min(window.innerWidth - this.root.offsetWidth, event.clientX - this.dragOffsetX));
    const nextY = Math.max(0, Math.min(window.innerHeight - this.root.offsetHeight, event.clientY - this.dragOffsetY));

    this.root.style.left = `${nextX}px`;
    this.root.style.top = `${nextY}px`;
  };

  private readonly handlePointerUp = (): void => {
    this.isDragging = false;
    this.header.style.cursor = "grab";
  };
}
