import type { Container } from "pixi.js";
import { BuildingGridOverlay } from "../building/BuildingGridOverlay";
import { BuildingModeState } from "../building/BuildingModeState";
import { BuildingPanel } from "../building/BuildingPanel";
import { InventoryPanel } from "../inventory/InventoryPanel";
import { InventoryState } from "../inventory/InventoryState";
import { GameMenuDock } from "./GameMenuDock";

export type GameHudOptions = {
  worldContainer: Container;
  parent?: HTMLElement;
  gridWidth?: number;
  gridHeight?: number;
};

export class GameHud {
  readonly inventoryState = new InventoryState();
  readonly buildingModeState = new BuildingModeState();
  readonly inventoryPanel: InventoryPanel;
  readonly buildingPanel: BuildingPanel;
  readonly buildingGridOverlay: BuildingGridOverlay;
  readonly dock: GameMenuDock;

  constructor(options: GameHudOptions) {
    this.inventoryPanel = new InventoryPanel({
      inventoryState: this.inventoryState,
      parent: options.parent,
    });

    this.buildingPanel = new BuildingPanel({
      buildingModeState: this.buildingModeState,
      inventoryState: this.inventoryState,
      parent: options.parent,
    });

    this.dock = new GameMenuDock({
      parent: options.parent,
      onToggleInventory: () => this.inventoryPanel.toggle(),
      onToggleBuilding: () => this.buildingPanel.toggle(),
    });

    this.buildingGridOverlay = new BuildingGridOverlay({
      buildingModeState: this.buildingModeState,
      width: options.gridWidth ?? 24,
      height: options.gridHeight ?? 24,
    });

    options.worldContainer.addChild(this.buildingGridOverlay.container);
  }

  destroy(): void {
    this.dock.destroy();
    this.inventoryPanel.destroy();
    this.buildingPanel.destroy();
    this.buildingGridOverlay.destroy();
  }
}
