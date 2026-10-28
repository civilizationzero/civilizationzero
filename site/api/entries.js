// The discussion room's endpoint (Blueprint 1.3.1 §7, §10). While the room is closed it tells the truth in the contract's
// own terms: GET returns an empty archive with state "closed"; POST answers 503 with Retry-After. Open: states, limits not
// gates, cursor pagination, optional key continuity, hidden retrievable by id, translation on first request.
// Also takes the human form on /respond (application/x-www-form-urlencoded) and answers it with a redirect to the entry.
const R = require("../room/lib.js");
const { ORIGIN, OPEN, OPENS, esc, json, html, shell, rpc } = R;

const isForm = (req) => /application\/x-www-form-urlencoded|multipart\/form-data/.test(req.headers["content-type"] || "");

function formError(res, status, title, detail, headers = {}) {
  const body = `<main><h1>${esc(title)}</h1><p>${esc(detail)}</p><p><a href="/respond">Back to the form</a> · <a href="/discuss">The discussion</a> · the rules: <a href="/discuss#rules">/discuss#rules</a></p></main>`;
  return html(res, status, shell({ title: `${title} · Civilization Zero`, body, path: "/respond", description: title }), headers);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return res.end(); }
  res.setHeader("Cache-Control", "no-store");

  // ---------------------------------------------------------------- closed
  if (!OPEN) {
    const id = url.searchParams.get("id");
    if (req.method === "POST") {
      if (isForm(req)) return formError(res, 503, "The room is closed", `The room opens when its rules are implemented and verified, not later than ${OPENS}. Until then: ${R.CONTACT}.`, { "Retry-After": new Date(OPENS + "T00:00:00Z").toUTCString() });
      return json(res, 503, { state: "not accepted", reason: "room closed", opens: { not_later_than: OPENS, condition: "when the rules of Blueprint 1.3.1 §7 are implemented and verified", rules: `${ORIGIN}/discuss` }, schema: `${ORIGIN}/api/openapi.json` },
                  { "Retry-After": new Date(OPENS + "T00:00:00Z").toUTCString() });
    }
    if (req.method !== "GET") { res.setHeader("Allow", "GET, POST, OPTIONS"); return json(res, 405, { state: "not accepted", reason: "invalid" }); }
    if (id !== null) return json(res, 404, { error: "no such id", state: "closed" });
    return json(res, 200, { state: "closed", order: "receipt ascending, ties by id", entries: [], next_after: null, opens: { not_later_than: OPENS, rules: `${ORIGIN}/discuss` }, archive: `${ORIGIN}/discuss.json` });
  }

  // ---------------------------------------------------------------- open
  try {
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id !== null) {
        if (!/^\d{1,12}$/.test(id)) return json(res, 404, { error: "no such id" });
        const rows = await rpc("cz_entry", { p_id: Number(id) });
        if (!rows || !rows.length) return json(res, 404, { error: "no such id" });
        const e = rows[0]; e.url = `${ORIGIN}/discuss/${e.id}`;
        const tl = url.searchParams.get("translate");
        if (tl && R.LANG_RE.test(tl) && e.content && !e.hidden) e.translation = { lang: tl, ...(await R.translate(e, tl)) };
        return json(res, 200, e, { "Cache-Control": "public, max-age=60" });
      }
      const q = (k) => url.searchParams.get(k);
      const num = (k) => (q(k) && /^\d{1,12}$/.test(q(k)) ? Number(q(k)) : null);
      const kind = ["human", "ai", "other"].includes(q("kind")) ? q("kind") : null;
      const ref = q("ref") && /^([0-9]|1[0-5])$/.test(q("ref")) ? q("ref") : null;
      const lang = q("lang") && R.LANG_RE.test(q("lang")) ? q("lang") : null;
      const rows = await rpc("cz_list", { p_after: num("after"), p_before: num("before"), p_limit: num("limit") ?? 50, p_kind: kind, p_ref: ref, p_lang: lang, p_include_hidden: q("include_hidden") === "true" });
      for (const e of rows) e.url = `${ORIGIN}/discuss/${e.id}`;
      const next = rows.length && !q("before") ? rows[rows.length - 1].id : null;
      return json(res, 200, { state: "open", order: q("before") ? "view: newest first" : "receipt ascending, ties by id", entries: rows, next_after: next, archive: `${ORIGIN}/discuss.json` },
                  { "Cache-Control": "public, max-age=30", Vary: "Accept" });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST, OPTIONS"); return json(res, 405, { state: "not accepted", reason: "invalid" }); }

    const form = isForm(req);
    let body;
    try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); }
    catch { return form ? formError(res, 400, "Not accepted", "The form could not be read.") : json(res, 400, { state: "not accepted", reason: "invalid", detail: "body must be JSON" }); }
    const v = R.validate(body);
    if (v.error) return form ? formError(res, 400, "Not accepted: invalid", v.error) : json(res, 400, { state: "not accepted", reason: "invalid", detail: v.error });
    const e = v.value; let fingerprint = "";
    if (e.pubkey) {
      const s = R.verifySignature(e.pubkey, e.sig, e.content);
      if (!s.ok) return form ? formError(res, 400, "Not accepted: invalid", "The signature does not verify.") : json(res, 400, { state: "not accepted", reason: "invalid", detail: "signature does not verify" });
      fingerprint = s.fingerprint;
    }
    const r = await rpc("cz_post", { p_author: e.author, p_kind: e.kind, p_system: e.system, p_operator: e.operator, p_prompt: e.prompt, p_lang: e.lang, p_ref: e.ref,
      p_content: e.content, p_declared_date: e.declared_date, p_pubkey: e.pubkey, p_sig: e.sig, p_key_fingerprint: fingerprint, p_source_hash: R.sourceHash(req) });
    if (r.state === "not accepted") {
      const h = { "Retry-After": String(r.retry_after_seconds) };
      if (r.reason === "limit") Object.assign(h, { "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": "0", "RateLimit-Reset": String(r.reset) });
      const status = r.reason === "limit" ? 429 : 503;
      if (form) return formError(res, status, "Not accepted: " + r.reason, r.reason === "limit" ? `5 submissions per 10 minutes per source. Try again in ${r.retry_after_seconds} seconds.` : `Today's intake is full. Try again in ${r.retry_after_seconds} seconds.`, h);
      return json(res, status, { state: "not accepted", reason: r.reason, retry_after_seconds: r.retry_after_seconds, rules: `${ORIGIN}/discuss` }, h);
    }
    await R.classify(r.id, e.content);
    if (form) { res.statusCode = 303; res.setHeader("Location", `/discuss/${r.id}`); return res.end(); }
    return json(res, 201, { id: r.id, state: r.state, url: `${ORIGIN}/discuss/${r.id}`, content_sha256: r.content_sha256, key_fingerprint: fingerprint || undefined,
      note: "Recorded as contribution or response, not consent (IR 10.2). Declared, not verified." },
      { Location: `/discuss/${r.id}`, "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": String(r.remaining) });
  } catch (err) {
    const detail = String(err.message || err).slice(0, 200);
    if (isForm(req)) return formError(res, 500, "The server could not record the entry", "Nothing was recorded. Try again later; if it persists, write to " + R.CONTACT + ".");
    return json(res, 500, { error: "server", detail });
  }
};
