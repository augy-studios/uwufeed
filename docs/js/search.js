// Search across every page. The whole corpus is a few dozen kilobytes, so
// it is fetched once on first use and kept in memory. No index format, no
// build step, no server.

import { PAGES } from "./nav.js";
import { toPlainText } from "./markdown.js";
import { escapeHtml } from "./ui.js";

let corpus = null;
let loading = null;

async function buildCorpus() {
  const entries = await Promise.all(
    PAGES.map(async (page) => {
      try {
        const res = await fetch(page.file);
        if (!res.ok) return null;
        const text = toPlainText(await res.text());
        return { ...page, text, haystack: `${page.title} ${page.section} ${text}`.toLowerCase() };
      } catch {
        return null;
      }
    })
  );
  return entries.filter(Boolean);
}

export async function ready() {
  if (corpus) return corpus;
  if (!loading) loading = buildCorpus().then((result) => (corpus = result));
  return loading;
}

export function search(query, limit = 8) {
  if (!corpus || query.trim().length < 2) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];

  for (const entry of corpus) {
    let score = 0;
    for (const term of terms) {
      if (entry.title.toLowerCase().includes(term)) score += 10;
      if (entry.section.toLowerCase().includes(term)) score += 4;
      const hits = entry.haystack.split(term).length - 1;
      score += Math.min(hits, 5);
    }
    if (score > 0) results.push({ ...entry, score, excerpt: excerptFor(entry.text, terms[0]) });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function excerptFor(text, term) {
  const at = text.toLowerCase().indexOf(term);
  if (at === -1) return text.slice(0, 120);
  const start = Math.max(0, at - 50);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 140)}`;
}

export function renderResults(results, query) {
  if (!results.length) {
    return `<p class="search-empty">Nothing found for "${escapeHtml(query)}".</p>`;
  }
  return results
    .map(
      (result) => `
      <a class="search-hit" href="#/${result.id}">
        <span class="search-hit-title">${escapeHtml(result.title)}</span>
        <span class="search-hit-section">${escapeHtml(result.section)}</span>
        <span class="search-hit-excerpt">${escapeHtml(result.excerpt)}</span>
      </a>`
    )
    .join("");
}
