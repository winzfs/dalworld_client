const CLASSIC_AUTO_OPEN_TIMEOUT_MS = 8000;
const CLASSIC_AUTO_OPEN_RETRY_MS = 150;

export function installEditorClassicAutoOpen(options: {
  status?: (message: string) => void;
} = {}): void {
  const status = options.status ?? ((message: string) => console.log('[EditorClassicAutoOpen]', message));
  const startedAt = Date.now();
  let finished = false;
  let retryTimer: number | null = null;

  const finish = (message: string): void => {
    if (finished) return;
    finished = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    observer.disconnect();
    status(message);
  };

  const scheduleRetry = (): void => {
    if (finished) return;
    if (Date.now() - startedAt > CLASSIC_AUTO_OPEN_TIMEOUT_MS) {
      finish('기존 Map Editor 패널 자동 열기 시간 초과. Safe Boot 패널을 유지합니다.');
      return;
    }
    retryTimer = window.setTimeout(tryOpen, CLASSIC_AUTO_OPEN_RETRY_MS);
  };

  const tryOpen = (): void => {
    if (finished) return;

    const classicPanel = document.querySelector<HTMLElement>('.staged-classic-editor-panel');
    if (classicPanel) {
      removeMinimalEditorPanel();
      finish('기존 Map Editor 패널 표시 완료.');
      return;
    }

    const button = findClassicOpenButton();
    if (!button) {
      scheduleRetry();
      return;
    }

    status('기존 Map Editor 패널 자동 열기 실행 중...');
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    button.click();

    window.setTimeout(() => {
      const opened = document.querySelector<HTMLElement>('.staged-classic-editor-panel');
      if (opened) {
        removeMinimalEditorPanel();
        finish('기존 Map Editor 패널 자동 열기 완료.');
        return;
      }
      scheduleRetry();
    }, 0);
  };

  const observer = new MutationObserver(() => tryOpen());
  observer.observe(document.body, { childList: true, subtree: true });
  tryOpen();
}

function findClassicOpenButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  return buttons.find((button) => {
    const text = button.textContent?.trim() ?? '';
    return text === '기존 UI 패널 열기' || (text.includes('기존') && text.includes('UI'));
  }) ?? null;
}

function removeMinimalEditorPanel(): void {
  document.querySelectorAll<HTMLElement>('.minimal-editor-panel').forEach((panel) => panel.remove());
}
