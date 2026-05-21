import type { GameConnectionProfile } from '../net/network';

const DEFAULT_CHARACTER_NAME = '테스트 생존자';
const AUTH_USERNAME_STORAGE_KEY = 'dalworld:last-username';

type AuthCharacterProfile = {
  id: string;
  accountId: string;
  name: string;
};

type AuthUserProfile = {
  accountId: string;
  username: string;
  character: AuthCharacterProfile | null;
};

type AuthSuccess = {
  ok: true;
  token: string;
  profile: AuthUserProfile;
};

type AuthFailure = {
  ok: false;
  reason: string;
};

type AuthResult = AuthSuccess | AuthFailure;

export type StartScreenResult = Required<Pick<GameConnectionProfile, 'accountId' | 'characterName'>>;

export async function showStartScreen(parent: HTMLElement): Promise<StartScreenResult> {
  const overlay = document.createElement('div');
  overlay.className = 'start-screen';
  overlay.innerHTML = `
    <div class="start-screen__panel" data-step="title">
      <div class="start-screen__eyebrow">DALWORLD</div>
      <h1>잃어버린 캠프</h1>
      <p class="start-screen__copy">계정을 만들고 생존자 캐릭터를 생성한 뒤 무너진 세계로 들어갑니다.</p>
      <button class="start-screen__primary" type="button" data-action="show-login">로그인</button>
      <button class="start-screen__ghost" type="button" data-action="show-register">계정 만들기</button>
    </div>

    <div class="start-screen__panel" data-step="login" hidden>
      <div class="start-screen__eyebrow">로그인</div>
      <h2>계정 접속</h2>
      <label class="start-screen__field">
        <span>계정 ID</span>
        <input type="text" maxlength="20" autocomplete="username" data-login-username />
      </label>
      <label class="start-screen__field">
        <span>비밀번호</span>
        <input type="password" maxlength="72" autocomplete="current-password" data-login-password />
      </label>
      <p class="start-screen__copy" data-login-message></p>
      <button class="start-screen__primary" type="button" data-action="login">월드 접속</button>
      <button class="start-screen__ghost" type="button" data-action="back-title">뒤로</button>
    </div>

    <div class="start-screen__panel" data-step="register" hidden>
      <div class="start-screen__eyebrow">계정 생성</div>
      <h2>새 계정 만들기</h2>
      <label class="start-screen__field">
        <span>계정 ID</span>
        <input type="text" maxlength="20" autocomplete="username" data-register-username />
      </label>
      <label class="start-screen__field">
        <span>비밀번호</span>
        <input type="password" maxlength="72" autocomplete="new-password" data-register-password />
      </label>
      <label class="start-screen__field">
        <span>비밀번호 확인</span>
        <input type="password" maxlength="72" autocomplete="new-password" data-register-password-confirm />
      </label>
      <p class="start-screen__copy" data-register-message>계정 ID는 영문, 숫자, 밑줄 3~20자로 입력하세요.</p>
      <button class="start-screen__primary" type="button" data-action="register">계정 생성</button>
      <button class="start-screen__ghost" type="button" data-action="back-title">뒤로</button>
    </div>

    <div class="start-screen__panel" data-step="character" hidden>
      <div class="start-screen__eyebrow">캐릭터 생성</div>
      <h2>생존자 이름</h2>
      <p class="start-screen__copy">처음 접속하는 계정입니다. 사용할 캐릭터 이름을 정하세요.</p>
      <label class="start-screen__field">
        <span>캐릭터 이름</span>
        <input type="text" maxlength="16" data-character-name />
      </label>
      <p class="start-screen__copy" data-character-message></p>
      <button class="start-screen__primary" type="button" data-action="create-character">시작하기</button>
    </div>
  `;

  const loginUsername = overlay.querySelector<HTMLInputElement>('[data-login-username]');
  const loginPassword = overlay.querySelector<HTMLInputElement>('[data-login-password]');
  const registerUsername = overlay.querySelector<HTMLInputElement>('[data-register-username]');
  const registerPassword = overlay.querySelector<HTMLInputElement>('[data-register-password]');
  const registerPasswordConfirm = overlay.querySelector<HTMLInputElement>('[data-register-password-confirm]');
  const characterNameInput = overlay.querySelector<HTMLInputElement>('[data-character-name]');
  const loginMessage = overlay.querySelector<HTMLElement>('[data-login-message]');
  const registerMessage = overlay.querySelector<HTMLElement>('[data-register-message]');
  const characterMessage = overlay.querySelector<HTMLElement>('[data-character-message]');

  const lastUsername = loadLastUsername();
  if (loginUsername) loginUsername.value = lastUsername;
  if (registerUsername) registerUsername.value = lastUsername;
  if (characterNameInput) characterNameInput.value = DEFAULT_CHARACTER_NAME;

  parent.appendChild(overlay);

  return await new Promise((resolve) => {
    let currentToken = '';
    let currentProfile: AuthUserProfile | null = null;

    const showStep = (step: 'title' | 'login' | 'register' | 'character') => {
      overlay.querySelectorAll<HTMLElement>('[data-step]').forEach((panel) => {
        panel.hidden = panel.dataset.step !== step;
      });
      if (step === 'login') loginUsername?.focus();
      if (step === 'register') registerUsername?.focus();
      if (step === 'character') characterNameInput?.focus();
    };

    const finish = (profile: AuthUserProfile) => {
      const character = profile.character;
      if (!character) {
        currentProfile = profile;
        showStep('character');
        return;
      }

      saveLastUsername(profile.username);
      overlay.remove();
      resolve({ accountId: profile.accountId, characterName: character.name });
    };

    overlay.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-action]')
        : null;
      if (!target) return;

      switch (target.dataset.action) {
        case 'show-login':
          showStep('login');
          return;
        case 'show-register':
          showStep('register');
          return;
        case 'back-title':
          showStep('title');
          return;
        case 'login':
          void submitLogin();
          return;
        case 'register':
          void submitRegister();
          return;
        case 'create-character':
          void submitCharacter();
          return;
      }
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const activePanel = overlay.querySelector<HTMLElement>('[data-step]:not([hidden])');
      if (!activePanel) return;
      event.preventDefault();
      if (activePanel.dataset.step === 'login') void submitLogin();
      if (activePanel.dataset.step === 'register') void submitRegister();
      if (activePanel.dataset.step === 'character') void submitCharacter();
    });

    async function submitLogin(): Promise<void> {
      setMessage(loginMessage, '로그인 중...');
      const result = await postAuth('/auth/login', {
        username: loginUsername?.value ?? '',
        password: loginPassword?.value ?? '',
      });
      if (!result.ok) {
        setMessage(loginMessage, result.reason);
        return;
      }
      currentToken = result.token;
      currentProfile = result.profile;
      finish(result.profile);
    }

    async function submitRegister(): Promise<void> {
      const password = registerPassword?.value ?? '';
      if (password !== (registerPasswordConfirm?.value ?? '')) {
        setMessage(registerMessage, '비밀번호 확인이 일치하지 않습니다.');
        return;
      }

      setMessage(registerMessage, '계정 생성 중...');
      const result = await postAuth('/auth/register', {
        username: registerUsername?.value ?? '',
        password,
      });
      if (!result.ok) {
        setMessage(registerMessage, result.reason);
        return;
      }
      currentToken = result.token;
      currentProfile = result.profile;
      finish(result.profile);
    }

    async function submitCharacter(): Promise<void> {
      if (!currentToken || !currentProfile) {
        setMessage(characterMessage, '먼저 로그인하거나 계정을 생성해주세요.');
        showStep('title');
        return;
      }

      setMessage(characterMessage, '캐릭터 생성 중...');
      const result = await postAuth('/characters', {
        sessionToken: currentToken,
        name: normalizeCharacterName(characterNameInput?.value ?? DEFAULT_CHARACTER_NAME),
      });
      if (!result.ok) {
        setMessage(characterMessage, result.reason);
        return;
      }
      finish(result.profile);
    }
  });
}

async function postAuth(path: string, body: unknown): Promise<AuthResult> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await response.json() as AuthResult;
  } catch {
    return { ok: false, reason: '서버에 연결할 수 없습니다.' };
  }
}

function setMessage(element: HTMLElement | null, message: string): void {
  if (element) element.textContent = message;
}

function normalizeCharacterName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, 16) : DEFAULT_CHARACTER_NAME;
}

function loadLastUsername(): string {
  try {
    return window.localStorage.getItem(AUTH_USERNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLastUsername(username: string): void {
  try {
    window.localStorage.setItem(AUTH_USERNAME_STORAGE_KEY, username);
  } catch {
    // localStorage may be unavailable.
  }
}
