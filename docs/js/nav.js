// The table of contents. One place that knows every page, its title and
// its file, so the sidebar, the router, the search index, the prev and
// next links and the service worker precache all agree.

export const SECTIONS = [
  {
    title: "Getting started",
    pages: [
      { id: "introduction", title: "Introduction", file: "content/introduction.md" },
      { id: "quick-start", title: "Quick start", file: "content/quick-start.md" },
      { id: "how-it-works", title: "How it works", file: "content/how-it-works.md" },
    ],
  },
  {
    title: "Web app",
    pages: [
      { id: "web-overview", title: "Overview", file: "content/web-overview.md" },
      { id: "web-sources", title: "Adding sources", file: "content/web-sources.md" },
      { id: "web-opml", title: "OPML import and export", file: "content/web-opml.md" },
      { id: "web-notifications", title: "Notifications", file: "content/web-notifications.md" },
      { id: "web-themes", title: "Themes", file: "content/web-themes.md" },
    ],
  },
  {
    title: "Telegram bot",
    pages: [
      { id: "telegram-overview", title: "Overview", file: "content/telegram-overview.md" },
      { id: "telegram-commands", title: "Commands", file: "content/telegram-commands.md" },
      { id: "telegram-running", title: "Running it", file: "content/telegram-running.md" },
    ],
  },
  {
    title: "Discord bot",
    pages: [
      { id: "discord-overview", title: "Overview", file: "content/discord-overview.md" },
      { id: "discord-commands", title: "Commands", file: "content/discord-commands.md" },
      { id: "discord-running", title: "Running it", file: "content/discord-running.md" },
    ],
  },
  {
    title: "Workers",
    pages: [
      { id: "workers-overview", title: "Overview", file: "content/workers-overview.md" },
      { id: "workers-dispatcher", title: "Dispatcher", file: "content/workers-dispatcher.md" },
      { id: "workers-poller", title: "Poller", file: "content/workers-poller.md" },
      { id: "workers-streams", title: "Stream listeners", file: "content/workers-streams.md" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { id: "item-shape", title: "The item shape", file: "content/item-shape.md" },
      { id: "shared-auth", title: "The shared auth tables", file: "content/shared-auth.md" },
      { id: "self-hosting", title: "Self hosting", file: "content/self-hosting.md" },
      { id: "faq", title: "Questions", file: "content/faq.md" },
      { id: "next-steps", title: "What comes next", file: "next-steps.md" },
    ],
  },
];

export const PAGES = SECTIONS.flatMap((section) =>
  section.pages.map((page) => ({ ...page, section: section.title }))
);

export const DEFAULT_PAGE = PAGES[0].id;

export function findPage(id) {
  return PAGES.find((page) => page.id === id) || null;
}

export function neighbours(id) {
  const index = PAGES.findIndex((page) => page.id === id);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? PAGES[index - 1] : null,
    next: index < PAGES.length - 1 ? PAGES[index + 1] : null,
  };
}
