function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

(globalThis as typeof globalThis & {
  setScaleX?: (element: HTMLDivElement, value: number) => void;
}).setScaleX = (element: HTMLDivElement, value: number): void => {
  element.style.transformOrigin = 'left center';
  element.style.transform = `scaleX(${clamp01(value)})`;
};

export {};
