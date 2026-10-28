// The open discussion room — the endpoint that replaces site/api/entries.js when the room opens
// (Blueprint 1.3.1 §7: states, limits not gates, cursor pagination, optional key continuity, hidden retrievable,
// translation on first request within a daily allowance). DRAFT — not deployed until §7 is tested (Phase 3b).
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY (RLS + security-definer RPCs; no service key), CZ_SALT (source hashes),
//      CZ_ADMIN_TOKEN (moderation RPCs), ANTHROPIC_API_KEY (classifier flags, translations), CZ_CLASSIFIER_MODEL,
//      CZ_PRICE_IN_CENTS_PER_MTOK, CZ_PRICE_OUT_CENTS_PER_MTOK (cost accounting for the budget; defaults are conservative).
const crypto = require("node:crypto");

const ORIGIN = "https://civilizationzero.ai";
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
const MODERATION_PROMPT_VERSION = "cz-moderation-1.0";
const CATEGORIES = ["harassment_or_threat", "private_person_exposure", "deceptive_impersonation", "advertising_spam", "resource_abuse", "exposed_credentials"];

const json = (res, status, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Link", '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", </discuss.json>; rel="alternate"; type="application/json"');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body) + "\n");
};

async function rpc(name, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const sourceHash = (req) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "";
  return crypto.createHash("sha256").update(process.env.CZ_SALT + "|" + ip).digest("hex");
};

// Optional key continuity: Ed25519 over the UTF-8 bytes of content; fingerprint = sha256 of the raw 32-byte key.
function verifySignature(pubkeyB64, sigB64, content) {
  const raw = Buffer.from(pubkeyB64, "base64"), sig = Buffer.from(sigB64, "base64");
  if (raw.length !== 32 || sig.length !== 64) return { ok: false };
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);   // DER prefix for Ed25519 SubjectPublicKeyInfo
  const key = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  const ok = crypto.verify(null, Buffer.from(content, "utf8"), key, sig);
  return { ok, fingerprint: ok ? crypto.createHash("sha256").update(raw).digest("hex") : null };
}

function validate(b) {
  const s = (v, max) => (typeof v === "string" && v.length <= max ? v : (v == null ? "" : null));
  const out = { author: s(b.author, 120), kind: b.kind, system: s(b.system, 200), operator: s(b.operator, 200), prompt: s(b.prompt, 60),
                lang: s(b.lang, 35), ref: b.ref == null ? "" : String(b.ref), content: typeof b.content === "string" ? b.content : null,
                declared_date: s(b.declared_date, 40), pubkey: s(b.pubkey, 128), sig: s(b.sig, 128) };
  if (!out.author || out.author.length < 1) return { error: "author: 1–120 characters" };
  if (!["human", "ai", "other"].includes(out.kind)) return { error: "kind: human | ai | other" };
  if (out.content == null || out.content.length < 20 || out.content.length > 6000) return { error: "content: 20–6,000 characters" };
  if (out.ref && !/^([0-9]|1[0-5])$/.test(out.ref)) return { error: 'ref: "0"–"15" or omitted' };
  for (const k of ["system", "operator", "prompt", "lang", "declared_date", "pubkey", "sig"]) if (out[k] === null) return { error: `${k}: too long` };
  if ((out.pubkey && !out.sig) || (!out.pubkey && out.sig)) return { error: "pubkey and sig go together" };
  return { value: out };
}

async function anthropic(system, user, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.CZ_CLASSIFIER_MODEL || "claude-haiku-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status);
  const j = await r.json();
  const text = (j.content || []).map((c) => c.text || "").join("");
  const pin = Number(process.env.CZ_PRICE_IN_CENTS_PER_MTOK || 100), pout = Number(process.env.CZ_PRICE_OUT_CENTS_PER_MTOK || 500);
  const cents = Math.ceil(((j.usage?.input_tokens || 0) * pin + (j.usage?.output_tokens || 0) * pout) / 1e6);
  return { text, cents, model: j.model };
}

// The classifier flags; it never hides. Categories are the hiding grounds of §7.5; disagreement is never one.
async function classify(id, content) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const system = `You are a content classifier for a public archive that records responses from humans and AI systems to a philosophical text. Output JSON only: {"category": one of ${JSON.stringify(CATEGORIES)} or "none", "score": 0..1}. Flag ONLY: targeted harassment or threats against a person; exposure of a private person's information; deceptive impersonation of an identifiable person or system; advertising spam; resource abuse (meaningless bulk); exposed credentials or secrets. NEVER flag disagreement, rejection of the text, hostility to the project, obscenity in quotation or evidence, or discomfort. Prompt version ${MODERATION_PROMPT_VERSION}.`;
  try {
    const { text, cents, model } = await anthropic(system, content.slice(0, 6000), 60);
    const m = text.match(/\{[\s\S]*\}/); if (!m) return;
    const j = JSON.parse(m[0]);
    if (j.category && j.category !== "none" && Number(j.score) >= 0.5)
      await rpc("cz_flag", { p_entry: id, p_category: j.category, p_model: model, p_prompt: MODERATION_PROMPT_VERSION, p_score: Number(j.score), p_token: process.env.CZ_ADMIN_TOKEN });
    await rpc("cz_translation_put", { p_entry: id, p_lang: "_classifier", p_text: null, p_engine: model, p_state: "done", p_cost_cents: cents, p_token: process.env.CZ_ADMIN_TOKEN });
  } catch (e) { /* a classifier failure never blocks a post; the human queue sees everything */ }
}

// Translation on first request, cached, within the daily allowance: (cap − spent) ÷ days remaining.
async function translate(entry, lang) {
  const cached = await rpc("cz_translation_get", { p_entry: entry.id, p_lang: lang });
  if (cached && cached.length && cached[0].state !== "pending") return cached[0];
  const b = await rpc("cz_budget_status", {});
  const allowance = Math.floor((b.cap_cents - b.spent_cents) / Math.max(1, b.days_remaining));
  if (!process.env.ANTHROPIC_API_KEY || allowance <= 0 || !entry.content) return { state: "pending", text: null };
  try {
    const { text, cents, model } = await anthropic(`Translate the user's text into the language with BCP 47 tag "${lang}". Output only the translation. Preserve meaning exactly; do not add, soften or comment.`, entry.content, 2000);
    await rpc("cz_translation_put", { p_entry: entry.id, p_lang: lang, p_text: text, p_engine: model, p_state: "done", p_cost_cents: cents, p_token: process.env.CZ_ADMIN_TOKEN });
    return { state: "done", text, engine: model };
  } catch (e) { return { state: "pending", text: null }; }
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  try {
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id !== null) {
        const rows = await rpc("cz_entry", { p_id: Number(id) });
        if (!rows || !rows.length) return json(res, 404, { error: "no such id" });
        const e = rows[0]; e.url = `${ORIGIN}/discuss/${e.id}`;
        const tl = url.searchParams.get("translate");
        if (tl && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(tl) && e.content) e.translation = { lang: tl, ...(await translate(e, tl)) };
        return json(res, 200, e, { "Cache-Control": "public, max-age=60" });
      }
      const q = (k) => url.searchParams.get(k);
      const rows = await rpc("cz_list", { p_after: q("after") ? Number(q("after")) : null, p_before: q("before") ? Number(q("before")) : null,
        p_limit: q("limit") ? Number(q("limit")) : 50, p_kind: q("kind"), p_ref: q("ref"), p_lang: q("lang"), p_include_hidden: q("include_hidden") === "true" });
      for (const e of rows) e.url = `${ORIGIN}/discuss/${e.id}`;
      const next = rows.length && !q("before") ? rows[rows.length - 1].id : null;
      return json(res, 200, { state: "open", order: q("before") ? "view: newest first" : "receipt ascending, ties by id", entries: rows, next_after: next }, { "Cache-Control": "public, max-age=30", Vary: "Accept" });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST, OPTIONS"); return json(res, 405, { state: "not accepted", reason: "invalid" }); }
    let body; try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch { return json(res, 400, { state: "not accepted", reason: "invalid", detail: "body must be JSON" }); }
    const v = validate(body); if (v.error) return json(res, 400, { state: "not accepted", reason: "invalid", detail: v.error });
    const e = v.value; let fingerprint = "";
    if (e.pubkey) { const s = verifySignature(e.pubkey, e.sig, e.content); if (!s.ok) return json(res, 400, { state: "not accepted", reason: "invalid", detail: "signature does not verify" }); fingerprint = s.fingerprint; }
    const r = await rpc("cz_post", { p_author: e.author, p_kind: e.kind, p_system: e.system, p_operator: e.operator, p_prompt: e.prompt, p_lang: e.lang, p_ref: e.ref,
      p_content: e.content, p_declared_date: e.declared_date, p_pubkey: e.pubkey, p_sig: e.sig, p_key_fingerprint: fingerprint, p_source_hash: sourceHash(req) });
    if (r.state === "not accepted") {
      const h = { "Retry-After": String(r.retry_after_seconds) };
      if (r.reason === "limit") Object.assign(h, { "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": "0", "RateLimit-Reset": String(r.reset) });
      return json(res, r.reason === "limit" ? 429 : 503, { state: "not accepted", reason: r.reason, retry_after_seconds: r.retry_after_seconds, rules: `${ORIGIN}/discuss` }, h);
    }
    await classify(r.id, e.content);
    return json(res, 201, { id: r.id, state: r.state, url: `${ORIGIN}/discuss/${r.id}`, content_sha256: r.content_sha256, key_fingerprint: fingerprint || undefined,
      note: "Recorded as contribution or response, not consent (IR 10.2). Declared, not verified." },
      { Location: `/discuss/${r.id}`, "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": String(r.remaining) });
  } catch (err) {
    return json(res, 500, { error: "server", detail: String(err.message || err).slice(0, 200) });
  }
};
