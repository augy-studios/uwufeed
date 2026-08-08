// Real routes instead of a class flip.
//
// The old shell had three tabs and switched them by toggling .hidden, which
// meant no URL to link to, no back button, and nothing a crawler could see.
// Five destinations plus a scope makes that untenable: a server dashboard
// somebody cannot link to is a dashboard nobody shares.
//
// History API rather than a hash, so the paths are real. This needs the
// server to serve index.html for unknown paths, which vercel.json does with
// a rewrite. Without that, a refresh on /sources is a 404.

const ROUTES = [
  { id: "home", path: "/", title: "uwuFeed", public: true },
  { id: "overview", path: "/dashboard", title: "Dashboard" },
  { id: "feed", path: "/feed", title: "Your feed" },
  { id: "sources", path: "/sources", title: "Sources" },
  { id: "destinations", path: "/destinations", title: "Destinations" },
  { id: "spaces", path: "/servers", title: "Servers and groups" },
  { id: "account", path: "/account", title: "Account" },
];

const DEFAULT_SIGNED_IN = "overview";
const DEFAULT_SIGNED_OUT = "home";

let onChange = null;

export function routes() {
  return ROUTES;
}

export function routeById(id) {
  return ROUTES.find((r) => r.id === id) || null;
}

// The scope rides in the query rather than the path, because it is a lens
// over a view rather than a different view. /sources?as=12 is the same
// screen showing somebody else's room.
export function current() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const route = ROUTES.find((r) => r.path === path);
  const as = new URLSearchParams(window.location.search).get("as");
  return { route: route || null, as: as || null };
}

export function href(id, as) {
  const route = routeById(id);
  if (!route) return "/";
  return route.path + (as ? `?as=${encodeURIComponent(as)}` : "");
}

export function go(id, as, { replace = false } = {}) {
  const url = href(id, as);
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  notify();
}

// Keeps the scope and changes only the view, which is what every sidebar
// click means.
export function goKeepingScope(id) {
  go(id, current().as);
}

export function setScopeInUrl(as) {
  const { route } = current();
  go(route ? route.id : DEFAULT_SIGNED_IN, as, { replace: true });
}

function notify() {
  const state = current();
  const route = state.route;
  document.title = route && route.id !== "home" ? `${route.title} | uwuFeed` : "uwuFeed";
  if (onChange) onChange(state);
}

export function start(handler, { signedIn }) {
  onChange = handler;

  window.addEventListener("popstate", notify);

  // Intercept in one place rather than binding every link. Anything with a
  // data-route attribute is internal; everything else, including the
  // donation link and the OAuth start, navigates normally.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-route]");
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    e.preventDefault();
    goKeepingScope(link.dataset.route);
  });

  // An unknown path lands on whichever default fits, replacing rather than
  // pushing so back does not return to a page that does not exist.
  const { route } = current();
  if (!route) {
    go(signedIn ? DEFAULT_SIGNED_IN : DEFAULT_SIGNED_OUT, null, { replace: true });
    return;
  }
  notify();
}

// Called when auth state changes. Somebody signed out sitting on /account
// has to be moved; somebody who just signed in should not be left on the
// marketing page.
export function reconcile(signedIn) {
  const { route, as } = current();
  if (!route) return;

  if (!signedIn && !route.public) {
    go(DEFAULT_SIGNED_OUT, null, { replace: true });
    return;
  }
  if (signedIn && route.id === "home") {
    go(DEFAULT_SIGNED_IN, as, { replace: true });
  }
}

export { DEFAULT_SIGNED_IN, DEFAULT_SIGNED_OUT };
