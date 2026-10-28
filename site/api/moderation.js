// Moderation (Blueprint 1.3.1 §7.5): the public log and the public list of hidden/redacted entries by language (GET);
// the human decision (POST with the administrator's token). A classifier flags; a human decides; everything is logged
// with date, category, entry id and content hash. Disagreement is never a ground.
const R = require("../room/lib.js");
const { ORIGIN, OPEN, json, rpc, rest, CATEGORIES } = R;

const HIDE = ["harassment_or_threat", "private_person_exposure", "deceptive_impersonation", "advertising_spam", "resource_abuse"];
const REDACT = ["exposed_credentials", "private_data", "no_right_to_publish", "lawful_erasure"];

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); return res.end(); }
  try {
    if (req.method === "GET") {
      if (!OPEN) return json(res, 200, { state: "closed", log: [], hidden: [], grounds: { hide: HIDE, redact: REDACT, never: ["disagreement", "rejection of the record", "hostility to the project", "obscenity in quotation or evidence", "discomfort"] } }, { "Cache-Control": "public, max-age=300" });
      const num = (k) => (url.searchParams.get(k) && /^\d{1,12}$/.test(url.searchParams.get(k)) ? Number(url.searchParams.get(k)) : null);
      const after = num("after") ?? 0, limit = Math.min(500, Math.max(1, num("limit") ?? 500));
      const [log, hidden] = await Promise.all([
        rest(`moderation_log?id=gt.${after}&order=id.asc&limit=${limit}&select=id,at,entry_id,action,category,actor,classifier_model,classifier_prompt,classifier_score,content_sha256,reason`),
        rpc("cz_hidden", {}),
      ]);
      const byLang = {};
      for (const h of hidden) { const l = h.lang || "undeclared"; (byLang[l] ||= []).push(h.id); }
      const byMonth = {};
      for (const h of hidden) { const m = String(h.updated || h.received).slice(0, 7); const l = h.lang || "undeclared"; ((byMonth[m] ||= {})[l] ||= []).push(h.id); }
      return json(res, 200, { state: "open", order: "log id ascending", next_after: log.length === limit ? log[log.length - 1].id : null,
        grounds: { hide: HIDE, redact: REDACT, never: ["disagreement", "rejection of the record", "hostility to the project", "obscenity in quotation or evidence", "discomfort"] },
        log, hidden_and_redacted: hidden.map((h) => ({ ...h, url: `${ORIGIN}/discuss/${h.id}` })), hidden_by_language: byLang, hidden_by_month_and_language: byMonth,
        appeal: `${R.CONTACT} with the entry id; receipt within 7 days; a written reason` }, { "Cache-Control": "public, max-age=0, s-maxage=60" });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST, OPTIONS"); return json(res, 405, { error: "method" }); }
    const auth = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (!process.env.CZ_ADMIN_TOKEN || auth !== process.env.CZ_ADMIN_TOKEN) return json(res, 401, { error: "unauthorised" });
    let b; try { b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch { return json(res, 400, { error: "body must be JSON" }); }
    const id = Number(b.id), action = String(b.action || ""), category = b.category == null ? "" : String(b.category), reason = String(b.reason || "").slice(0, 2000);
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: "id" });
    if (!["hide", "unhide", "redact", "unredact"].includes(action)) return json(res, 400, { error: "action: hide | unhide | redact | unredact" });
    if (action === "hide" && !HIDE.includes(category)) return json(res, 400, { error: "category (hide): " + HIDE.join(" | ") });
    if (action === "redact" && !REDACT.includes(category)) return json(res, 400, { error: "category (redact): " + REDACT.join(" | ") });
    if (action === "redact" && (typeof b.redacted_text !== "string" || b.redacted_text.length < 1 || b.redacted_text.length > 6000)) return json(res, 400, { error: "redacted_text: the content with markers in place of the removed parts" });
    if (!reason) return json(res, 400, { error: "reason: a written reason is required" });
    await rpc("cz_moderate", { p_entry: id, p_action: action, p_category: (action === "hide" || action === "redact") ? category : null, p_reason: reason, p_redacted_text: action === "redact" ? b.redacted_text : null, p_token: process.env.CZ_ADMIN_TOKEN });
    const rows = await rpc("cz_entry", { p_id: id });
    return json(res, 200, { id, action, state: rows && rows[0] ? rows[0].state : null, url: `${ORIGIN}/discuss/${id}`, logged: true });
  } catch (err) {
    return json(res, 500, { error: "server", detail: String(err.message || err).slice(0, 200) });
  }
};
