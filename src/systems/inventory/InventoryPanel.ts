import { DraggablePanel } from "../ui/DraggablePanel";
import { INVENTORY_ITEM_LABELS, type InventoryItemId, type InventorySnapshot } from "./InventoryTypes";
import { InventoryState } from "./InventoryState";

export type InventoryPanelOptions = {
  inventoryState: InventoryState;
  parent?: HTMLElement;
  columns?: number;
  rows?: number;
};

export class InventoryPanel {
  readonly panel: DraggablePanel;

  private readonly grid: HTMLDivElement;
  private readonly columns: number;
  private readonly rows: number;
  private unsubscribe: (() => void) | null = null;

  constructor(options: InventoryPanelOptions) {
    this.columns = options.columns ?? 5;
    this.rows = options.rows ?? 4;

    this.panel = new DraggablePanel({
      id: "inventory-panel",
      title: "🎒 가방",
      x: 24,
      y: 96,
      width: 340,
      parent: options.parent,
      initiallyVisible: false,
    });

    this.grid = document.createElement("div");
    this.grid.style.display = "grid";
    this.grid.style.gridTemplateColumns = `repeat(${this.columns}, 1fr)`;
    this.grid.style.gap = "8px";

    this.panel.body.appendChild(this.grid);
    this.unsubscribe = options.inventoryState.subscribe((snapshot) => this.render(snapshot));
  }

  toggle(): void {
    this.panel.toggle();
  }

  show(): void {
    this.panel.show();
  }

  hide(): void {
    this.panel.hide();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.panel.destroy();
  }

  private render(snapshot: InventorySnapshot): void {
    this.grid.replaceChildren();

    const slotCount = this.columns * this.rows;
    const items = snapshot.items.slice(0, slotCount);

    for (let index = 0; index < slotCount; index += 1) {
      const stack = items[index];
      this.grid.appendChild(this.createSlot(stack?.itemId, stack?.quantity ?? 0));
    }
  }

  private createSlot(itemId: InventoryItemId | undefined, quantity: number): HTMLDivElement {
    const slot = document.createElement("div");
    slot.style.position = "relative";
    slot.style.aspectRatio = "1 / 1";
    slot.style.borderRadius = "10px";
    slot.style.border = "1px solid rgba(255, 255, 255, 0.16)";
    slot.style.background = itemId ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.22)";
    slot.style.display = "flex";
    slot.style.alignItems = "center";
    slot.style.justifyContent = "center";
    slot.style.overflow = "hidden";

    if (!itemId) {
      return slot;
    }

    const icon = document.createElement("div");
    icon.textContent = this.getItemIcon(itemId);
    icon.title = INVENTORY_ITEM_LABELS[itemId];
    icon.style.fontSize = "24px";

    const amount = document.createElement("div");
    amount.textContent = String(quantity);
    amount.style.position = "absolute";
    amount.style.right = "6px";
    amount.style.bottom = "4px";
    amount.style.padding = "1px 5px";
    amount.style.borderRadius = "8px";
    amount.style.background = "rgba(0, 0, 0, 0.62)";
    amount.style.fontSize = "12px";
    amount.style.fontWeight = "700";

    slot.append(icon, amount);
    return slot;
  }

  private getItemIcon(itemId: InventoryItemId): string {
    switch (itemId) {
      case "wood":
        return "🪵";
      case "stone":
        return "🪨";
      case "fiber":
        return "🌿";
      case "floor_kit":
        return "▱";
      case "wall_kit":
        return "╱";
      case "roof_kit":
        return "⌂";
      default:
        return "?";
    }
  }
}
