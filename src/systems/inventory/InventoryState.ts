import type { InventoryItemId, InventoryItemStack, InventorySnapshot } from "./InventoryTypes";

export type InventoryListener = (snapshot: InventorySnapshot) => void;

export class InventoryState {
  private snapshot: InventorySnapshot = {
    ownerId: "unknown",
    items: [],
    updatedAt: 0,
  };

  private readonly listeners = new Set<InventoryListener>();

  getSnapshot(): InventorySnapshot {
    return {
      ownerId: this.snapshot.ownerId,
      updatedAt: this.snapshot.updatedAt,
      items: this.snapshot.items.map((item) => ({ ...item })),
    };
  }

  getQuantity(itemId: InventoryItemId): number {
    return this.snapshot.items.find((item) => item.itemId === itemId)?.quantity ?? 0;
  }

  hasAll(costs: InventoryItemStack[]): boolean {
    return costs.every((cost) => this.getQuantity(cost.itemId) >= cost.quantity);
  }

  applySnapshot(snapshot: InventorySnapshot): void {
    this.snapshot = {
      ownerId: snapshot.ownerId,
      updatedAt: snapshot.updatedAt,
      items: snapshot.items
        .filter((item) => item.quantity > 0)
        .map((item) => ({ ...item }))
        .sort((a, b) => a.itemId.localeCompare(b.itemId)),
    };

    this.emit();
  }

  subscribe(listener: InventoryListener): () => void {
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
