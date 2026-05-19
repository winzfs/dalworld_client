import { DraggablePanel } from "../ui/DraggablePanel";
import { InventoryState } from "../inventory/InventoryState";
import { BUILD_PART_LIST } from "./BuildingParts";
import { BuildingModeState } from "./BuildingModeState";
import type { BuildPartDefinition, BuildPartId } from "./BuildingTypes";

export type BuildingPanelOptions = {
  buildingModeState: BuildingModeState;
  inventoryState: InventoryState;
  parent?: HTMLElement;
};

type BuildingPanelCategoryId =
  | "all"
  | "floor"
  | "stairs"
  | "wall"
  | "support"
  | "roof"
  | "door-window";

type BuildingPanelCategory = {
  id: BuildingPanelCategoryId;
  label: string;
  matches: (part: BuildPartDefinition) => boolean;
};

const STAIR_PART_IDS = new Set<BuildPartId>(["wood_stairs", "stone_stairs"]);
const DOOR_WINDOW_CATEGORIES = new Set<BuildPartDefinition["category"]>(["door", "window"]);

const BUILDING_PANEL_CATEGORIES: BuildingPanelCategory[] = [
  { id: "all", label: "전체", matches: () => true },
  {
    id: "floor",
    label: "바닥",
    matches: (part) => part.category === "floor" && !STAIR_PART_IDS.has(part.id),
  },
  {
    id: "stairs",
    label: "계단",
    matches: (part) => STAIR_PART_IDS.has(part.id),
  },
  {
    id: "wall",
    label: "벽",
    matches: (part) => part.category === "wall",
  },
  {
    id: "support",
    label: "기둥",
    matches: (part) => part.category === "support",
  },
  {
    id: "roof",
    label: "지붕",
    matches: (part) => part.category === "roof",
  },
  {
    id: "door-window",
    label: "문/창문",
    matches: (part) => DOOR_WINDOW_CATEGORIES.has(part.category),
  },
];

export class BuildingPanel {
  readonly panel: DraggablePanel;

  private readonly buildingModeState: BuildingModeState;
  private readonly inventoryState: InventoryState;
  private readonly categoryBar: HTMLDivElement;
  private readonly listScroller: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private selectedCategoryId: BuildingPanelCategoryId = "all";
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

    this.categoryBar = document.createElement("div");
    this.categoryBar.style.display = "flex";
    this.categoryBar.style.gap = "6px";
    this.categoryBar.style.marginBottom = "10px";
    this.categoryBar.style.overflowX = "auto";
    this.categoryBar.style.paddingBottom = "3px";
    this.categoryBar.style.scrollbarWidth = "thin";
    this.categoryBar.style.touchAction = "pan-x";

    this.listScroller = document.createElement("div");
    this.listScroller.style.maxHeight = "390px";
    this.listScroller.style.overflowY = "auto";
    this.listScroller.style.paddingRight = "4px";
    this.listScroller.style.scrollbarWidth = "thin";
    this.listScroller.style.touchAction = "pan-y";
    this.listScroller.style.overscrollBehavior = "contain";

    this.list = document.createElement("div");
    this.list.style.display = "grid";
    this.list.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    this.list.style.gap = "8px";

    this.listScroller.append(this.list);
    this.panel.body.append(hint, this.categoryBar, this.listScroller);

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
    const selectedCategory = this.getSelectedCategory();
    const visibleParts = BUILD_PART_LIST.filter((part) => selectedCategory.matches(part));

    this.renderCategoryBar();
    this.list.replaceChildren();

    for (const part of visibleParts) {
      this.list.appendChild(this.createPartButton(part, mode.selectedPartId === part.id && mode.enabled));
    }

    if (visibleParts.length === 0) {
      this.list.appendChild(this.createEmptyMessage());
    }
  }

  private renderCategoryBar(): void {
    this.categoryBar.replaceChildren();

    for (const category of BUILDING_PANEL_CATEGORIES) {
      const button = document.createElement("button");
      const selected = category.id === this.selectedCategoryId;
      const count = BUILD_PART_LIST.filter((part) => category.matches(part)).length;

      button.type = "button";
      button.textContent = `${category.label} ${count}`;
      button.style.flex = "0 0 auto";
      button.style.padding = "6px 9px";
      button.style.borderRadius = "999px";
      button.style.border = selected ? "1px solid rgba(84, 220, 120, 0.95)" : "1px solid rgba(255, 255, 255, 0.14)";
      button.style.background = selected ? "rgba(84, 220, 120, 0.2)" : "rgba(255, 255, 255, 0.08)";
      button.style.color = selected ? "#f5fff7" : "rgba(245, 247, 251, 0.76)";
      button.style.fontSize = "12px";
      button.style.fontWeight = selected ? "800" : "700";
      button.style.cursor = "pointer";
      button.style.whiteSpace = "nowrap";

      button.addEventListener("click", () => {
        this.selectedCategoryId = category.id;
        this.listScroller.scrollTop = 0;
        this.render();
      });

      this.categoryBar.appendChild(button);
    }
  }

  private getSelectedCategory(): BuildingPanelCategory {
    return BUILDING_PANEL_CATEGORIES.find((category) => category.id === this.selectedCategoryId)
      ?? BUILDING_PANEL_CATEGORIES[0];
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
    text.style.minWidth = "0";

    const name = document.createElement("div");
    name.textContent = part.label;
    name.style.fontWeight = "700";
    name.style.fontSize = "13px";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    name.style.whiteSpace = "nowrap";

    const cost = document.createElement("div");
    cost.textContent = part.placementCost.map((item) => `${item.itemId} ${item.quantity}`).join(" · ");
    cost.style.marginTop = "3px";
    cost.style.fontSize = "11px";
    cost.style.color = canAfford ? "rgba(245, 247, 251, 0.68)" : "rgba(255, 120, 120, 0.76)";
    cost.style.overflow = "hidden";
    cost.style.textOverflow = "ellipsis";
    cost.style.whiteSpace = "nowrap";

    text.append(name, cost);
    button.append(icon, text);

    button.addEventListener("click", () => {
      this.buildingModeState.toggle(part.id);
    });

    return button;
  }

  private createEmptyMessage(): HTMLDivElement {
    const message = document.createElement("div");
    message.textContent = "이 카테고리에 표시할 부품이 없습니다.";
    message.style.gridColumn = "1 / -1";
    message.style.padding = "16px 10px";
    message.style.borderRadius = "12px";
    message.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    message.style.background = "rgba(255, 255, 255, 0.06)";
    message.style.color = "rgba(245, 247, 251, 0.62)";
    message.style.fontSize = "12px";
    message.style.textAlign = "center";
    return message;
  }
}
