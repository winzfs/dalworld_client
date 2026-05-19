export type GameMenuDockOptions = {
  parent?: HTMLElement;
  onToggleInventory(): void;
  onToggleBuilding(): void;
};

export class GameMenuDock {
  readonly root: HTMLDivElement;

  constructor(options: GameMenuDockOptions) {
    this.root = document.createElement("div");
    this.root.id = "game-menu-dock";
    this.root.style.position = "fixed";
    this.root.style.right = "18px";
    this.root.style.bottom = "18px";
    this.root.style.zIndex = "1100";
    this.root.style.display = "flex";
    this.root.style.gap = "10px";
    this.root.style.padding = "10px";
    this.root.style.borderRadius = "16px";
    this.root.style.background = "rgba(12, 16, 24, 0.74)";
    this.root.style.backdropFilter = "blur(8px)";
    this.root.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.35)";

    this.root.append(
      this.createButton("🎒", "가방", options.onToggleInventory),
      this.createButton("🏗️", "건설", options.onToggleBuilding),
    );

    (options.parent ?? document.body).appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private createButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.textContent = icon;
    button.style.width = "48px";
    button.style.height = "48px";
    button.style.border = "1px solid rgba(255, 255, 255, 0.18)";
    button.style.borderRadius = "14px";
    button.style.background = "rgba(255, 255, 255, 0.1)";
    button.style.color = "#fff";
    button.style.fontSize = "24px";
    button.style.cursor = "pointer";
    button.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.14)";
    button.addEventListener("click", onClick);

    button.addEventListener("pointerenter", () => {
      button.style.background = "rgba(255, 255, 255, 0.18)";
    });

    button.addEventListener("pointerleave", () => {
      button.style.background = "rgba(255, 255, 255, 0.1)";
    });

    return button;
  }
}
