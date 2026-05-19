import type { BuildPartId, BuildRotation } from "./BuildingTypes";

export type BuildingToolMode = "place" | "remove";

export type BuildingModeSnapshot = {
  enabled: boolean;
  toolMode: BuildingToolMode;
  selectedPartId: BuildPartId | null;
  rotation: BuildRotation;
  currentZ: number;
};

export type BuildingModeListener = (snapshot: BuildingModeSnapshot) => void;

export class BuildingModeState {
  private snapshot: BuildingModeSnapshot = {
    enabled: false,
    toolMode: "place",
    selectedPartId: null,
    rotation: 0,
    currentZ: 0,
  };

  private readonly listeners = new Set<BuildingModeListener>();

  getSnapshot(): BuildingModeSnapshot {
    return { ...this.snapshot };
  }

  enter(selectedPartId: BuildPartId): void {
    this.snapshot = {
      ...this.snapshot,
      enabled: true,
      toolMode: "place",
      selectedPartId,
    };
    this.emit();
  }

  enterRemoveMode(): void {
    this.snapshot = {
      ...this.snapshot,
      enabled: true,
      toolMode: "remove",
      selectedPartId: null,
    };
    this.emit();
  }

  exit(): void {
    this.snapshot = {
      ...this.snapshot,
      enabled: false,
      toolMode: "place",
      selectedPartId: null,
    };
    this.emit();
  }

  toggle(selectedPartId: BuildPartId): void {
    const isSamePart = this.snapshot.enabled &&
      this.snapshot.toolMode === "place" &&
      this.snapshot.selectedPartId === selectedPartId;

    if (isSamePart) {
      this.exit();
      return;
    }

    this.enter(selectedPartId);
  }

  rotateNext(): void {
    this.setRotation(((this.snapshot.rotation + 1) % 4) as BuildRotation);
  }

  setRotation(rotation: BuildRotation): void {
    this.snapshot = {
      ...this.snapshot,
      rotation,
    };
    this.emit();
  }

  setCurrentZ(z: number): void {
    this.snapshot = {
      ...this.snapshot,
      currentZ: Math.max(0, Math.floor(z)),
    };
    this.emit();
  }

  subscribe(listener: BuildingModeListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
