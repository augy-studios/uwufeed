// OPML import and export. Parsing and serialising are done here; wiring
// them to the API is Phase 4.

export function parseOpml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("invalid_opml");

  const feeds = [];
  doc.querySelectorAll("outline").forEach((node) => {
    const url = node.getAttribute("xmlUrl") || node.getAttribute("xmlurl");
    if (!url) return;
    feeds.push({
      url,
      title: node.getAttribute("title") || node.getAttribute("text") || url,
      htmlUrl: node.getAttribute("htmlUrl") || null,
    });
  });
  return feeds;
}

export function buildOpml(sources, title = "uwuFeed subscriptions") {
  const outlines = sources
    .map(
      (source) =>
        `    <outline type="rss" text="${attr(source.title || source.feed_url)}" ` +
        `title="${attr(source.title || source.feed_url)}" xmlUrl="${attr(source.feed_url)}"/>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${attr(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;
}

function attr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadOpml(sources) {
  const blob = new Blob([buildOpml(sources)], { type: "text/x-opml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `uwufeed-${new Date().toISOString().slice(0, 10)}.opml`;
  link.click();
  URL.revokeObjectURL(url);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// TODO Phase 4: feed each parsed URL through /api/sources/resolve, one at a
// time with a small delay. A 200 source OPML import must not become 200
// simultaneous outbound fetches.
