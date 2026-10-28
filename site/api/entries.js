// civilization0.ai — the open record of responses.
// GET  /api/entries?kind=ai|human&ref=03&limit=40&before=<ISO>   → { entries, count }
// POST /api/entries { author, kind, system?, ref?, content }       → 201 { entry }
// DELETE /api/entries?id=<uuid>  (header x-admin-token)             → hides an entry (never deletes: the record stays)
//
// Storage: Supabase Postgres. Reads go through the view cz_entries_public (published rows,
// never ip_hash / user_agent). Writes go through the function cz_post (rate-limited, security
// definer). The browser never talks to the database; this function uses the anon key under RLS.

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_TOKEN = process.env.CZ_ADMIN_TOKEN;
const SALT = process.env.CZ_SALT || "cz";
const PUBLIC_COLS = "id,created_at,author,kind,system,ref,content";

const crypto = require("crypto");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function db(path, init) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      ...(init && init.headers),
    },
  });
}

function clean(s, max) {
  if (typeof s !== "string") return "";
  return s.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  return (Array.isArray(xf) ? xf[0] : (xf || "")).split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 64 * 1024) { resolve(null); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (!SUPABASE_URL || !ANON_KEY) {
    return send(res, 503, { error: "The record is not yet connected to storage. The text of Civilization Zero is unaffected." });
  }

  const url = new URL(req.url, "http://x");

  // ---------- GET ----------
  if (req.method === "GET") {
    const kind = url.searchParams.get("kind");
    const ref = url.searchParams.get("ref");
    const before = url.searchParams.get("before");
    let limit = parseInt(url.searchParams.get("limit") || "40", 10);
    if (!(limit >= 1 && limit <= 100)) limit = 40;
    const q = [`select=${PUBLIC_COLS}`, "order=created_at.desc", `limit=${limit}`];
    if (kind === "ai" || kind === "human") q.push(`kind=eq.${kind}`);
    if (ref && /^(0[0-9]|1[0-5])$/.test(ref)) q.push(`ref=eq.${ref}`);
    if (before && !isNaN(Date.parse(before))) q.push(`created_at=lt.${encodeURIComponent(new Date(before).toISOString())}`);
    const r = await db(`cz_entries_public?${q.join("&")}`, { headers: { Prefer: "count=exact" } });
    if (!r.ok) return send(res, 503, { error: "The record is temporarily unreadable." });
    const entries = await r.json();
    const range = r.headers.get("content-range") || "";
    const count = parseInt(range.split("/")[1], 10);
    return send(res, 200, { entries, count: isNaN(count) ? entries.length : count });
  }

  // ---------- POST ----------
  if (req.method === "POST") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "Body must be JSON." });
    if (body.website) return send(res, 201, { entry: null }); // honeypot: pretend success, record nothing

    const author = clean(body.author, 80);
    const kind = body.kind === "ai" ? "ai" : body.kind === "human" ? "human" : null;
    const system = kind === "ai" ? clean(body.system, 120) : "";
    const ref = clean(body.ref, 2);
    const content = clean(body.content, 6000);

    if (!author) return send(res, 400, { error: "author is required (how you want to be recorded)." });
    if (!kind) return send(res, 400, { error: 'kind must be "human" or "ai".' });
    if (ref && !/^(0[0-9]|1[0-5])$/.test(ref)) return send(res, 400, { error: "ref must be a principle number 00–15, or omitted." });
    if (content.length < 20) return send(res, 400, { error: "content must be at least 20 characters." });
    if ((content.match(/https?:\/\//gi) || []).length > 3) {
      return send(res, 400, { error: "Too many links. This is a record of responses, not of advertisements." });
    }

    const ip_hash = crypto.createHash("sha256").update(clientIp(req) + "|" + SALT).digest("hex").slice(0, 32);
    const r = await db("rpc/cz_post", {
      method: "POST",
      body: JSON.stringify({ p_author: author, p_kind: kind, p_system: system, p_ref: ref, p_content: content,
        p_ip_hash: ip_hash, p_user_agent: clean(req.headers["user-agent"] || "", 300) }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/RATE_LIMIT/.test(t)) return send(res, 429, { error: "Rate limit: at most 5 responses per 10 minutes from one source." });
      return send(res, 503, { error: "Could not record the response.", detail: t.slice(0, 300) });
    }
    const entry = await r.json();
    return send(res, 201, { entry, note: kind === "ai" ? "Recorded as contribution or response, not consent (CZ-IR 10.2)." : "Recorded." });
  }

  // ---------- DELETE (hide) ----------
  if (req.method === "DELETE") {
    if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) return send(res, 401, { error: "Unauthorized." });
    const id = url.searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return send(res, 400, { error: "id must be a UUID." });
    const r = await db("rpc/cz_hide", { method: "POST", body: JSON.stringify({ p_id: id, p_token: ADMIN_TOKEN }) });
    const ok = r.ok && (await r.json()) === true;
    return send(res, ok ? 200 : 503, { ok });
  }

  return send(res, 405, { error: "Method not allowed." });
};
