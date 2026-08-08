// Daily, non-negotiable. WebSub leases cap at ten days, so anything
// expiring within three days gets resubscribed tonight.
//
// Skip this and the push tier goes silent after a week and a half with
// nothing logging an error anywhere. It looks exactly like nobody
// publishing, which is why this job alerts rather than just returning.

import { select, update, count } from "../_lib/db.js";
import { json, methodNotAllowed, timingSafeEqualString } from "../_lib/http.js";
import { requestHubSubscription } from "../_lib/websub.js";
import { alert } from "../_lib/alert.js";

const RENEW_WITHIN_DAYS = 3;

// Ordered by soonest expiry, so a cap only delays the least urgent. Three
// days of nightly attempts means a source has three chances before its
// lease actually lapses.
const BATCH_LIMIT = 100;

// A hub that will not take us back is a broken hub. Fall back to polling
// rather than leaving the user with nothing.
const FAILURES_BEFORE_DEMOTION = 5;

// Sequential with a small gap. One hub, many requests, no reason to burst.
const SPACING_MS = 150;

// A push source with no lease this long after creation was never verified.
const UNVERIFIED_GRACE_MS = 24 * 3600 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  const now = new Date();
  const cutoff = new Date(now.getTime() + RENEW_WITHIN_DAYS * 86400 * 1000).toISOString();

  const summary = {
    due: 0,
    requested: 0,
    rejected: 0,
    demoted: 0,
    lapsed_before_run: 0,
    errors: [],
  };

  // Anything already past its lease is receiving nothing right now. This is
  // the number that matters, and it is checked before any work so a broken
  // run still reports it.
  try {
    summary.lapsed_before_run = await count(
      "uwufeed_sources",
      `tier=eq.push&retired_at=is.null&lease_expires_at=lt.${encodeURIComponent(now.toISOString())}`
    );
  } catch (err) {
    summary.errors.push(`lapsed count: ${err.message}`);
  }

  let due = [];
  try {
    due = await select(
      "uwufeed_sources",
      `tier=eq.push&retired_at=is.null` +
        `&or=(lease_expires_at.is.null,lease_expires_at.lt.${encodeURIComponent(cutoff)})` +
        `&order=lease_expires_at.asc.nullsfirst&limit=${BATCH_LIMIT}&select=*`
    );
  } catch (err) {
    summary.errors.push(`select: ${err.message}`);
    await alert("Lease renewal could not read its queue", [
      "The push tier stops within ten days if this keeps failing.",
      `\`${err.message}\``,
    ]);
    return json(res, 500, summary);
  }

  summary.due = due.length;

  for (const source of due) {
    await sleep(SPACING_MS);

    // A source still lapsed when we get here was requested before and never
    // verified. That is the only evidence available without storing a
    // per attempt timestamp, and it is enough to spot a dead hub.
    const unverified = isUnverified(source, now);
    let failures = (source.fail_count || 0) + (unverified ? 1 : 0);

    let result;
    try {
      result = await requestHubSubscription(source, "subscribe");
    } catch (err) {
      result = { ok: false, reason: err.message };
    }

    if (result.ok) {
      summary.requested += 1;
      // The lease is written by the GET verification handler, not here. A
      // 202 means accepted, never confirmed.
      if (unverified) {
        await safeUpdate(summary, source.id, { fail_count: failures });
      }
    } else {
      summary.rejected += 1;
      failures = (source.fail_count || 0) + 1;
    }

    if (failures >= FAILURES_BEFORE_DEMOTION) {
      await demote(summary, source);
    } else if (!result.ok) {
      await safeUpdate(summary, source.id, { fail_count: failures });
    }
  }

  // Twitch is not WebSub and has no lease, so it never appears in the queue
  // above. A revoked EventSub subscription is otherwise completely
  // invisible: no error, no expiry, just silence.
  summary.twitch = await recheckTwitch(summary);

  await reportIfWrong(summary);

  return json(res, summary.errors.length ? 207 : 200, summary);
}

async function recheckTwitch(summary) {
  const { configured, appToken } = await import("../_lib/twitch.js");
  if (!configured()) return { skipped: "not_configured" };

  let live;
  try {
    const token = await appToken();
    const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions?status=enabled", {
      headers: {
        authorization: `Bearer ${token}`,
        "client-id": process.env.TWITCH_CLIENT_ID,
      },
    });
    if (!res.ok) throw new Error(`helix ${res.status}`);
    const body = await res.json();
    live = new Set(
      (body.data || []).map((sub) => String(sub.condition?.broadcaster_user_id || ""))
    );
  } catch (err) {
    summary.errors.push(`twitch recheck: ${err.message}`);
    return { error: err.message };
  }

  let sources = [];
  try {
    sources = await select(
      "uwufeed_sources",
      "platform=eq.twitch&retired_at=is.null&external_ref=not.is.null&select=id,title,external_ref"
    );
  } catch (err) {
    summary.errors.push(`twitch sources: ${err.message}`);
    return { error: err.message };
  }

  const missing = sources.filter((s) => !live.has(String(s.external_ref)));
  if (missing.length) {
    await alert("Twitch subscriptions are missing", [
      `**${missing.length}** Twitch sources have no enabled EventSub subscription, ` +
        "so going live will not be announced for them.",
      missing
        .slice(0, 10)
        .map((s) => `- ${s.title || s.external_ref}`)
        .join("\n"),
      "Re-add them to recreate the subscription.",
    ]);
  }

  return { checked: sources.length, missing: missing.length };
}

function isUnverified(source, now) {
  if (source.lease_expires_at) return new Date(source.lease_expires_at) < now;
  // Never verified at all. Allow a day, since resolve subscribes the moment
  // a source is created and verification takes seconds.
  const created = source.created_at ? new Date(source.created_at) : null;
  return created ? now - created > UNVERIFIED_GRACE_MS : false;
}

// Push is broken for this source, so hand it to the poller rather than
// leaving the subscriber with nothing. Items arrive in minutes instead of
// seconds, which beats never.
async function demote(summary, source) {
  try {
    await update("uwufeed_sources", `id=eq.${source.id}`, {
      tier: "poll",
      next_check_at: new Date().toISOString(),
      poll_interval_s: source.poll_interval_s || 900,
      // Fresh counter. The poll tier retires at 20 of its own failures, and
      // hub problems should not count toward that.
      fail_count: 0,
    });
    summary.demoted += 1;
  } catch (err) {
    summary.errors.push(`demote ${source.id}: ${err.message}`);
  }
}

async function safeUpdate(summary, id, patch) {
  try {
    await update("uwufeed_sources", `id=eq.${id}`, patch);
  } catch (err) {
    summary.errors.push(`update ${id}: ${err.message}`);
  }
}

// Silence is the failure mode here, so say something whenever the numbers
// are not what a healthy night looks like.
async function reportIfWrong(summary) {
  const lines = [];

  if (summary.lapsed_before_run > 0) {
    lines.push(
      `**${summary.lapsed_before_run}** push sources are past their lease and receiving nothing.`
    );
  }
  if (summary.due > 0 && summary.requested === 0) {
    lines.push(`**${summary.due}** sources were due and none were accepted by their hub.`);
  }
  if (summary.demoted > 0) {
    lines.push(`**${summary.demoted}** sources fell back to the poll tier after repeated rejections.`);
  }
  if (summary.rejected > 0 && summary.requested > 0) {
    lines.push(`${summary.rejected} of ${summary.due} renewals were rejected.`);
  }
  if (summary.errors.length) {
    lines.push(`Errors: ${summary.errors.slice(0, 5).join("; ")}`);
  }

  if (!lines.length) return;
  await alert("Lease renewal needs attention", lines);
}

// Vercel sends Authorization: Bearer $CRON_SECRET on scheduled invocations.
export function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || "";
  return timingSafeEqualString(header.startsWith("Bearer ") ? header.slice(7) : "", secret);
}
