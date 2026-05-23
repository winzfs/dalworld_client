export {};

declare global {
  interface Object {
    /** Compatibility for MapEditorBootMinimal.WorldCellTransition until the inline type is safely updated. */
    targetY: number;
  }
}
