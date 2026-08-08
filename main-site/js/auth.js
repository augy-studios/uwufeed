// Signed in state for the browser half of custom auth.
//
// The session token lives in an HttpOnly cookie, so this module cannot
// read it and neither can an XSS. Everything here is a non-authoritative
// hint: it decides what the shell renders on first paint, never what the
// user is allowed to do. The server decides that, every request.

import { api } from "./api.js";

const HINT_KEY = "uwufeed.session";

export const state = { signedIn: false, username: null, email: null };

// Read the hint before any network call, so the shell does not flicker
// from signed out to signed in on every load.
export function readHint() {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const hint = JSON.parse(raw);
    // A stale hint is cosmetic, not a security problem, but there is no
    // reason to render signed in chrome past the session's own window.
    if (hint.until && Date.parse(hint.until) < Date.now()) {
      clearHint();
      return null;
    }
    return hint;
  } catch {
    return null;
  }
}

// Never put the token here. It is in an HttpOnly cookie on purpose.
export function writeHint(user) {
  const until = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  localStorage.setItem(
    HINT_KEY,
    JSON.stringify({ username: user.username || null, email: user.email || null, until })
  );
}

export function clearHint() {
  localStorage.removeItem(HINT_KEY);
}

export function applyUser(user) {
  state.signedIn = true;
  state.username = user.username || null;
  state.email = user.email || null;
  writeHint(user);
  return state;
}

export function applySignedOut() {
  state.signedIn = false;
  state.username = null;
  state.email = null;
  clearHint();
  return state;
}

// Optimistic first paint from the hint, corrected by the first real call.
export function primeFromHint() {
  const hint = readHint();
  if (hint) {
    state.signedIn = true;
    state.username = hint.username;
    state.email = hint.email;
  }
  return state;
}

// Both return the whole response rather than just the state, because
// registration and a first sign in can carry a fresh set of recovery codes
// that is shown once and never again.
export async function login(email, password) {
  const data = await api.login(email, password);
  applyUser(data.user);
  return data;
}

export async function register(email, password, username) {
  const data = await api.register(email, password, username || null);
  applyUser(data.user);
  return data;
}

export async function logout() {
  try {
    await api.logout();
  } finally {
    applySignedOut();
  }
}
