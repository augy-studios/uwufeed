// A small Markdown renderer. No build step means no bundler, and no
// bundler means no marked.js, so this covers what the docs actually use:
// headings, paragraphs, lists, tables, code, quotes, callouts and links.
//
// Everything is escaped before any markup is added, so content can never
// inject HTML.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Inline code is lifted out first and put back last, so nothing inside a
// span of code is treated as markup. The sentinel is plain text rather
// than a control character, which survives copy and paste through tooling.
const CODE_OPEN = "@@uwucode";
const CODE_CLOSE = "@@";

function inline(text) {
  let out = escapeHtml(text);

  const codeSpans = [];
  out = out.replace(/`([^`]+)`/g, (match, code) => {
    codeSpans.push(code);
    return `${CODE_OPEN}${codeSpans.length - 1}${CODE_CLOSE}`;
  });

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const external = /^https?:\/\//.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  out = out.replace(
    new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g"),
    (match, index) => `<code>${codeSpans[Number(index)]}</code>`
  );
  return out;
}

const CALLOUT_ICON = { note: "info", warn: "alert", ok: "check" };

export function render(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const headings = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    // Fenced code
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const body = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(
        `<pre class="code"${language ? ` data-lang="${escapeHtml(language)}"` : ""}>` +
          `<code>${escapeHtml(body.join("\n"))}</code></pre>`
      );
      continue;
    }

    // Callout, ::: note through to :::
    const callout = /^:::\s*(note|warn|ok)\s*(.*)$/.exec(line);
    if (callout) {
      const kind = callout[1];
      const body = [];
      index += 1;
      while (index < lines.length && !/^:::\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      const label = callout[2].trim();
      html.push(
        `<div class="callout ${kind}">` +
          `<span class="callout-icon" data-icon="${CALLOUT_ICON[kind]}"></span>` +
          `<div class="callout-body">${label ? `<p class="callout-label">${inline(label)}</p>` : ""}` +
          `${render(body.join("\n")).html}</div></div>`
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      if (level === 2 || level === 3) headings.push({ id, text, level });
      html.push(
        `<h${level} id="${id}">${inline(text)}` +
          `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`
      );
      index += 1;
      continue;
    }

    if (/^(---|\*\*\*)\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    // Table
    if (
      /^\|/.test(line) &&
      index + 1 < lines.length &&
      /^\|[\s:|-]+\|?\s*$/.test(lines[index + 1])
    ) {
      const head = splitRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && /^\|/.test(lines[index])) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      html.push(
        `<div class="table-scroll"><table><thead><tr>${head
          .map((cell) => `<th>${inline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const body = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${render(body.join("\n")).html}</blockquote>`);
      continue;
    }

    // Lists
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (index < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        index += 1;
        // A wrapped line continues the item it follows.
        while (index < lines.length && /^\s{2,}\S/.test(lines[index])) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
          index += 1;
        }
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
      continue;
    }

    // Paragraph
    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4}\s|```|>|\||:::|\s*([-*]|\d+\.)\s|---)/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }

  return { html: html.join("\n"), headings };
}

function splitRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// Plain text, for the search index.
export function toPlainText(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
