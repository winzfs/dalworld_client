const CLASSIC_AUTO_OPEN_TIMEOUT_MS = 3000;

export function installEditorClassicAutoOpen(options: {
  status?: (message: string) => void;
} = {}): void {
  const status = options.status ?? ((message: string) => console.log('[EditorClassicAutoOpen]', message));
  const startedAt = Date.now();

  const tryOpen = (): boolean => {
    const classicPanel = document.querySelector<HTMLElement>('.staged-classic-editor-panel');
    if (classicPanel) {
      removeMinimalEditorPanel();
      status('기존 Map Editor 패널 표시 완료.');
      return true;
    }

    const button = findButtonByText('기존 UI 패널 열기');
    if (!button) return false;

    button.click();
    window.setTimeout(() => {
      removeMinimalEditorPanel();
      status('기존 Map Editor 패널 자동 열기 완료.');
    }, 0);
    return true;
  };

  if (tryOpen()) return;

  const observer = new MutationObserver(() => {
    if (tryOpen()) observer.disconnect();
    if (Date.now() - startedAt > CLASSIC_AUTO_OPEN_TIMEOUT_MS) {
      observer.disconnect();
      status('기존 Map Editor 패널 자동 열기 시간 초과. Safe Boot 패널을 유지합니다.');
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.setTimeout(() => {
    if (tryOpen()) {
      observer.disconnect();
      return;
    }
    observer.disconnect();
    status('기존 Map Editor 패널 자동 열기 버튼을 찾지 못했습니다.');
  }, CLASSIC_AUTO_OPEN_TIMEOUT_MS);
}

function findButtonByText(text: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim() === text) ?? null;
}

function removeMinimalEditorPanel(): void {
  document.querySelectorAll<HTMLElement>('.minimal-editor-panel').forEach((panel) => panel.remove());
}
