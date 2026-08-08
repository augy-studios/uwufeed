// Operational alerts, to the same Discord webhook delivery uses.
//
// Sharing the channel with feed items is slightly untidy and means the
// message is somewhere you already look. An alert channel nobody opens is
// worse than a noisy one.

const COLOURS = { warn: 0xffcccc, info: 0xccccff, ok: 0xccffcc };

// Alerting must never be the thing that breaks the job it is reporting on,
// so this swallows its own failures and says whether it got through.
export async function alert(title, lines, level = "warn") {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  const body = {
    embeds: [
      {
        title: title.slice(0, 256),
        description: lines.filter(Boolean).join("\n").slice(0, 4000),
        color: COLOURS[level] || COLOURS.warn,
        timestamp: new Date().toISOString(),
        footer: { text: "uwuFeed operations" },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok || res.status === 204;
  } catch (err) {
    console.error(`alert failed: ${err.message}`);
    return false;
  }
}
