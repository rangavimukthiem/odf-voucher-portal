import { apiFetch, clearSession, getCachedUser, getToken, setSession } from './api.js';

export const authState = $state({
  user: getCachedUser(),
  ready: false,
});

export async function refreshAuth() {
  const token = getToken();
  if (!token) {
    authState.user = null;
    authState.ready = true;
    return null;
  }

  try {
    const res = await apiFetch('/api/auth/me');
    authState.user = res.user;
    setSession(token, res.user);
    authState.ready = true;
    return res.user;
  } catch {
    authState.user = null;
    authState.ready = true;
    return null;
  }
}

export async function loginUser(username, password) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setSession(res.token, res.user);
  authState.user = res.user;
  authState.ready = true;
  return res.user;
}

export function logoutUser() {
  clearSession();
  authState.user = null;
  window.location.replace('/login');
}
