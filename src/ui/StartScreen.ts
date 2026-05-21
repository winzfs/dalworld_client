import type { GameConnectionProfile } from '../net/network';

const TEST_ACCOUNT_ID = 'test_account';
const TEST_ACCOUNT_LABEL = '테스트계정';
const DEFAULT_CHARACTER_NAME = '테스트 생존자';
const CHARACTER_NAME_STORAGE_KEY = 'dalworld:test-character-name';

export type StartScreenResult = Required<GameConnectionProfile>;

export async function showStartScreen(parent: HTMLElement): Promise<StartScreenResult> {
  const overlay = document.createElement('div');
  overlay.className = 'start-screen';
  overlay.innerHTML = `
    <div class="start-screen__panel" data-step="title">
      <div class="start-screen__eyebrow">DALWORLD</div>
      <h1>잃어버린 캠프</h1>
      <p class="start-screen__copy">무너진 세계에서 거점을 복구하고, 몬스터 동료들과 함께 첫 번째 신호탑을 찾아가세요.</p>
      <button class="start-screen__primary" type="button" data-action="start">게임 시작</button>
    </div>

    <div class="start-screen__panel" data-step="account" hidden>
      <div class="start-screen__eyebrow">계정 선택</div>
      <h2>접속할 계정</h2>
      <button class="start-screen__account" type="button" data-action="select-test-account">
        <span class="start-screen__account-icon">🧪</span>
        <span>
          <strong>${TEST_ACCOUNT_LABEL}</strong>
          <small>개발/테스트용 고정 계정으로 바로 접속합니다.</small>
        </span>
      </button>
      <button class="start-screen__ghost" type="button" data-action="back-title">뒤로</button>
    </div>

    <div class="start-screen__panel" data-step="character" hidden>
      <div class="start-screen__eyebrow">캐릭터 생성</div>
      <h2>생존자 이름</h2>
      <p class="start-screen__copy">현재는 테스트 단계라 캐릭터 외형 선택 없이 이름만 정합니다. 이름은 서버가 최종 정규화합니다.</p>
      <label class="start-screen__field">
        <span>캐릭터 이름</span>
        <input type="text" maxlength="16" data-character-name />
      </label>
      <button class="start-screen__primary" type="button" data-action="enter-world">월드 접속</button>
      <button class="start-screen__ghost" type="button" data-action="back-account">뒤로</button>
    </div>
  `;

  const initialName = loadCharacterName();
  const input = overlay.querySelector<HTMLInputElement>('[data-character-name]');
  if (input) input.value = initialName;

  parent.appendChild(overlay);

  return await new Promise((resolve) => {
    const showStep = (step: 'title' | 'account' | 'character') => {
      overlay.querySelectorAll<HTMLElement>('[data-step]').forEach((panel) => {
        panel.hidden = panel.dataset.step !== step;
      });
      if (step === 'character') input?.focus();
    };

    overlay.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-action]')
        : null;
      if (!target) return;

      switch (target.dataset.action) {
        case 'start':
          showStep('account');
          return;
        case 'select-test-account':
          showStep('character');
          return;
        case 'back-title':
          showStep('title');
          return;
        case 'back-account':
          showStep('account');
          return;
        case 'enter-world': {
          const characterName = normalizeCharacterName(input?.value ?? DEFAULT_CHARACTER_NAME);
          saveCharacterName(characterName);
          overlay.remove();
          resolve({ accountId: TEST_ACCOUNT_ID, characterName });
          return;
        }
      }
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const activePanel = overlay.querySelector<HTMLElement>('[data-step]:not([hidden])');
      if (activePanel?.dataset.step !== 'character') return;
      event.preventDefault();
      const characterName = normalizeCharacterName(input?.value ?? DEFAULT_CHARACTER_NAME);
      saveCharacterName(characterName);
      overlay.remove();
      resolve({ accountId: TEST_ACCOUNT_ID, characterName });
    });
  });
}

function normalizeCharacterName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, 16) : DEFAULT_CHARACTER_NAME;
}

function loadCharacterName(): string {
  try {
    return normalizeCharacterName(window.localStorage.getItem(CHARACTER_NAME_STORAGE_KEY) ?? DEFAULT_CHARACTER_NAME);
  } catch {
    return DEFAULT_CHARACTER_NAME;
  }
}

function saveCharacterName(name: string): void {
  try {
    window.localStorage.setItem(CHARACTER_NAME_STORAGE_KEY, name);
  } catch {
    // localStorage may be unavailable; the server still receives the selected name for this session.
  }
}
