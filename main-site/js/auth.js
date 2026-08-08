// Signed in state for the browser half of custom auth.
//
// The session token lives in an HttpOnly cookie, so this module cannot
// read it and neither can an XSS. Everything here is a non-authoritative
// hint: it decides what the shell renders on first paint, never what the
// user is allowed to do. The server decides that, every request.
//
// TODO Phase 4. Wire refresh() to a real endpoint and call it on boot.

import { api } from "./api.js";

const HINT_KEY = "uwufeed.session";

export const state = { signedIn: false, username: null, displayName: null };

// Read the hint before any network call, so the topbar does not flicker
// from signed out to signed in on every load.
export function readHint() {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const hint = JSON.parse(raw);
    // A stale hint is a cosmetic problem, not a security one, but there is
    // no reason to render signed in chrome past the session's own window.
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
export function writeHint({ username, displayName, until }) {
  localStorage.setItem(HINT_KEY, JSON.stringify({ username, displayName, until }));
}

export function clearHint() {
  localStorage.removeItem(HINT_KEY);
}

// The authority. A 401 means signed out whatever the hint said.
export async function refresh() {
  try {
    await api.listItems();
    state.signedIn = true;
  } catch (err) {
    if (err.status === 401) {
      state.signedIn = false;
      clearHint();
    }
  }
  return state;
}
