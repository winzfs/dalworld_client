import { DraggablePanel } from "../ui/DraggablePanel";
import { InventoryState } from "../inventory/InventoryState";
import { BUILD_PART_LIST } from "./BuildingParts";
import { BuildingModeState } from "./BuildingModeState";
import type { BuildPartDefinition } from "./BuildingTypes";

export type BuildingPanelOptions = {
  buildingModeState: BuildingModeState;
  inventoryState: InventoryState;
  parent?: HTMLElement;
};

export class BuildingPanel {
  readonly panel: DraggablePanel;

  private readonly buildingModeState: BuildingModeState;
  private readonly inventoryState: InventoryState;
  private readonly list: HTMLDivElement;
  private unsubscribeBuilding: (() => void) | null = null;
  private unsubscribeInventory: (() => void) | null = null;

  constructor(options: BuildingPanelOptions) {
    this.buildingModeState = options.buildingModeState;
    this.inventoryState = options.inventoryState;

    this.panel = new DraggablePanel({
      id: "building-panel",
      title: "🏗️ 건설",
      x: 384,
      y: 96,
      width: 360,
      parent: options.parent,
      initiallyVisible: false,
    });

    const hint = document.createElement("div");
    hint.textContent = "부품을 선택하면 isometric 건설모드로 진입합니다.";
    hint.style.marginBottom = "10px";
    hint.style.fontSize = "12px";
    hint.style.color = "rgba(245, 247, 251, 0.72)";

    this.list = document.createElement("div");
    this.list.style.display = "grid";
    this.list.style.gridTemplateColumns = "repeat(2, 1fr)";
    this.list.style.gap = "8px";

    this.panel.body.append(hint, this.list);

    this.unsubscribeBuilding = this.buildingModeState.subscribe(() => this.render());
    this.unsubscribeInventory = this.inventoryState.subscribe(() => this.render());
    this.render();
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
    this.unsubscribeBuilding?.();
    this.unsubscribeInventory?.();
    this.panel.destroy();
  }

  private render(): void {
    const mode = this.buildingModeState.getSnapshot();
    this.list.replaceChildren();

    for (const part of BUILD_PART_LIST) {
      this.list.appendChild(this.createPartButton(part, mode.selectedPartId === part.id && mode.enabled));
    }
  }

  private createPartButton(part: BuildPartDefinition, selected: boolean): HTMLButtonElement {
    const canAfford = this.inventoryState.hasAll(part.placementCost);
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = !canAfford;
    button.style.display = "grid";
    button.style.gridTemplateColumns = "38px 1fr";
    button.style.gap = "8px";
    button.style.alignItems = "center";
    button.style.minHeight = "58px";
    button.style.padding = "8px";
    button.style.borderRadius = "12px";
    button.style.border = selected ? "1px solid rgba(84, 220, 120, 0.95)" : "1px solid rgba(255, 255, 255, 0.16)";
    button.style.background = selected ? "rgba(84, 220, 120, 0.18)" : "rgba(255, 255, 255, 0.08)";
    button.style.color = canAfford ? "#f5f7fb" : "rgba(245, 247, 251, 0.38)";
    button.style.cursor = canAfford ? "pointer" : "not-allowed";
    button.style.textAlign = "left";

    const icon = document.createElement("div");
    icon.textContent = part.icon;
    icon.style.fontSize = "24px";
    icon.style.textAlign = "center";

    const text = document.createElement("div");

    const name = document.createElement("div");
    name.textContent = part.label;
    name.style.fontWeight = "700";
    name.style.fontSize = "13px";

    const cost = document.createElement("div");
    cost.textContent = part.placementCost.map((item) => `${item.itemId} ${item.quantity}`).join(" · ");
    cost.style.marginTop = "3px";
    cost.style.fontSize = "11px";
    cost.style.color = canAfford ? "rgba(245, 247, 251, 0.68)" : "rgba(255, 120, 120, 0.76)";

    text.append(name, cost);
    button.append(icon, text);

    button.addEventListener("click", () => {
      this.buildingModeState.toggle(part.id);
    });

    return button;
  }
}
