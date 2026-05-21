export const AUTH_SESSION_STORAGE_KEY = 'dalworld:session-token';
export const AUTH_USERNAME_STORAGE_KEY = 'dalworld:last-username';

export function loadSessionToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSessionToken(token: string): void {
  try {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, token);
  } catch {
    // localStorage may be unavailable.
  }
}

export function clearSessionToken(): void {
  try {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable.
  }
}

export function loadLastUsername(): string {
  try {
    return window.localStorage.getItem(AUTH_USERNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastUsername(username: string): void {
  try {
    window.localStorage.setItem(AUTH_USERNAME_STORAGE_KEY, username);
  } catch {
    // localStorage may be unavailable.
  }
}

export function clearLastUsername(): void {
  try {
    window.localStorage.removeItem(AUTH_USERNAME_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable.
  }
}

export function logoutAndReload(): void {
  clearSessionToken();
  window.location.reload();
}
