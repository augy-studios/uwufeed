// Telegram Bot API calls the site makes for itself.
//
// The reason this exists: Telegram does have a live permission check, which
// the design originally assumed it did not. getChatMember answers whether a
// person is an administrator of a chat right now, which makes the Telegram
// dashboard work the same way the Discord one does. Losing admin removes
// the group from somebody's list on the next load rather than never.
//
// Delivery is not done here. That is the dispatcher's job, and it sends to
// targets. This is about who may manage what.

const API = "https://api.telegram.org";

// creator and administrator are the two that carry management rights.
// restricted, member, left and kicked do not.
const ADMIN_STATUSES = new Set(["creator", "administrator"]);

export function configured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

async function call(method, params) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) return null;
    return payload.result;
  } catch (err) {
    console.error(`telegram ${method} failed: ${err.message}`);
    return null;
  }
}

// Returns true, false, or null when Telegram could not be asked. The three
// are genuinely different: a caller must not treat "could not check" as
// "not an admin", or an outage would empty everybody's dashboard.
export async function isChatAdmin(chatId, telegramUserId) {
  if (!chatId || !telegramUserId) return false;

  const member = await call("getChatMember", {
    chat_id: String(chatId),
    user_id: Number(telegramUserId),
  });
  if (!member || typeof member.status !== "string") return null;

  return ADMIN_STATUSES.has(member.status);
}

// The chat's own title, so a renamed group does not keep its old label
// forever. Best effort: a failure just leaves the recorded label alone.
export async function chatTitle(chatId) {
  const chat = await call("getChat", { chat_id: String(chatId) });
  return chat && chat.title ? chat.title : null;
}
