import './style.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { EditorApp } from './editor/EditorApp';
import { installItemEditorFeature } from './editor/ItemEditorFeature';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';
import { EditorBootProbe } from './utils/editorBootProbe';

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function bootEditor(): Promise<void> {
  bootOverlay.setMessage('Map editor ready. Tap the button to start rendering.');

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  await waitForEditorStartGesture();

  // Remove the full-screen boot overlay BEFORE starting Pixi. On certain
  // mobile GPU drivers, having an opaque fixed overlay (z-index 99999)
  // covering the viewport during WebGL renderer setup blocks the main
  // thread indefinitely - the timeout in EditorApp can't fire because the
  // event loop is frozen. The game's bootGame() removes the overlay before
  // GameApp.start for the same reason and runs fine on the same device.
  bootOverlay.remove();

  // Use a small corner status banner for the rest of boot so we still
  // surface progress without re-introducing a full-screen overlay over
  // the canvas.
  const probe = new EditorBootProbe();
  probe.log('Starting map editor...');

  const editor = new EditorApp();
  await editor.start(mount, (message) => probe.log(message));

  try {
    installItemEditorFeature(document.body);
  } catch (error) {
    console.warn('[Editor] Optional item editor feature failed to install.', error);
  }
}

function waitForEditorStartGesture(): Promise<void> {
  return new Promise((resolve) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '맵 에디터 시작';
    button.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:50%',
      'z-index:2147483647',
      'transform:translate(-50%,-50%)',
      'padding:16px 22px',
      'border:1px solid rgba(85,214,190,.75)',
      'border-radius:14px',
      'background:#14252b',
      'color:#eafff9',
      'font:700 16px system-ui,sans-serif',
      'box-shadow:0 12px 30px rgba(0,0,0,.35)',
      'touch-action:manipulation',
    ].join(';');

    const hint = document.createElement('div');
    hint.textContent = '모바일 브라우저의 WebGL 초기화를 안정화하기 위해 직접 시작합니다.';
    hint.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:calc(50% + 58px)',
      'z-index:2147483647',
      'transform:translateX(-50%)',
      'max-width:min(420px,calc(100vw - 32px))',
      'color:#b9c8cc',
      'font:13px/1.45 system-ui,sans-serif',
      'text-align:center',
      'pointer-events:none',
    ].join(';');

    button.addEventListener('click', () => {
      button.remove();
      hint.remove();
      resolve();
    }, { once: true });

    document.body.appendChild(button);
    document.body.appendChild(hint);
  });
}

bootEditor().catch((error: unknown) => {
  bootOverlay.showError(error);
});
