// PostgREST over HTTPS. Serverless functions never open a direct
// connection, because that is how the pool gets exhausted.

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

function requireConfig() {
  if (!URL_BASE || !KEY) throw new Error("supabase_not_configured");
}

async function pgrest(path, { method = "GET", body, prefer, headers = {} } = {}) {
  requireConfig();
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`postgrest ${res.status} on ${path}: ${raw.slice(0, 300)}`);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function selectOne(table, query) {
  const rows = await pgrest(`${table}?${query}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function select(table, query) {
  const rows = await pgrest(`${table}?${query}`);
  return Array.isArray(rows) ? rows : [];
}

export async function insert(table, rows, { returning = true } = {}) {
  const prefer = returning ? "return=representation" : "return=minimal";
  return pgrest(table, { method: "POST", body: rows, prefer });
}

// Dedup lives in the database. Never read first and then decide.
export async function insertIgnoreDuplicates(table, rows, conflictColumns) {
  return pgrest(`${table}?on_conflict=${conflictColumns.join(",")}`, {
    method: "POST",
    body: rows,
    prefer: "resolution=ignore-duplicates,return=representation",
  });
}

export async function upsert(table, rows, conflictColumns) {
  return pgrest(`${table}?on_conflict=${conflictColumns.join(",")}`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

export async function update(table, query, patch) {
  return pgrest(`${table}?${query}`, {
    method: "PATCH",
    body: patch,
    prefer: "return=representation",
  });
}

export async function rpc(fn, args) {
  return pgrest(`rpc/${fn}`, { method: "POST", body: args });
}

// Returns how many rows went, which is the only interesting output of a
// retention pass. PostgREST reports it in content-range when asked.
export async function remove(table, query) {
  requireConfig();
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      prefer: "return=minimal,count=exact",
    },
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`postgrest ${res.status} deleting ${table}: ${raw.slice(0, 300)}`);
  }

  const range = res.headers.get("content-range") || "";
  const deleted = parseInt(range.split("/")[1] || "0", 10);
  return Number.isFinite(deleted) ? deleted : 0;
}
