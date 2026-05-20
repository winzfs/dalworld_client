import { GameWindows } from './GameWindows';
import { normalizeInventoryStacks, type InventorySource } from '../systems/inventory/InventoryViewModel';

type PatchedGameWindows = GameWindows & {
  lastInventory?: InventorySource;
  activeCraftingTier?: string;
  activeCraftingCategory?: string;
  root?: HTMLDivElement;
  renderCraftingAvailability?: () => void;
  toggleWindow?: (id: string) => void;
};

const CRAFTING_SIGNATURES = new WeakMap<object, string>();

export function installGameWindowsPerformancePatch(): void {
  const proto = GameWindows.prototype as unknown as PatchedGameWindows;
  const originalRenderCraftingAvailability = proto.renderCraftingAvailability;
  const originalToggleWindow = proto.toggleWindow;

  if (!originalRenderCraftingAvailability || originalRenderCraftingAvailability.name === 'patchedRenderCraftingAvailability') return;

  proto.renderCraftingAvailability = function patchedRenderCraftingAvailability(this: PatchedGameWindows): void {
    const craftingWindow = this.root?.querySelector<HTMLElement>('[data-window="crafting"]');
    if (!craftingWindow || craftingWindow.hidden) return;

    const signature = createCraftingSignature(this);
    if (CRAFTING_SIGNATURES.get(this) === signature) return;
    CRAFTING_SIGNATURES.set(this, signature);
    originalRenderCraftingAvailability.call(this);
  };

  if (originalToggleWindow) {
    proto.toggleWindow = function patchedToggleWindow(this: PatchedGameWindows, id: string): void {
      originalToggleWindow.call(this, id);
      if (id !== 'crafting') return;

      const craftingWindow = this.root?.querySelector<HTMLElement>('[data-window="crafting"]');
      if (!craftingWindow || craftingWindow.hidden) return;

      CRAFTING_SIGNATURES.delete(this);
      originalRenderCraftingAvailability.call(this);
    };
  }
}

function createCraftingSignature(windows: PatchedGameWindows): string {
  const inventory = windows.lastInventory ?? null;
  const stackSignature = normalizeInventoryStacks(inventory)
    .map((stack) => `${stack.itemId}:${stack.quantity}`)
    .sort()
    .join('|');

  return [
    windows.activeCraftingTier ?? 'all',
    windows.activeCraftingCategory ?? 'all',
    stackSignature,
  ].join('::');
}
