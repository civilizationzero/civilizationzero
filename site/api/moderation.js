// Moderation (Blueprint 1.3.1 §7.5, §7.6): the public log, the public list of hidden/redacted entries by language and by
// month of the decision, the day-hash revisions (GET); the human decision and translation corrections (POST with the
// administrator's token). A classifier flags; a human decides; everything is logged with date, category, entry id and
// content hash. Disagreement is never a ground.
const R = require("../room/lib.js");
const { ORIGIN, OPEN, CHAIN, json, rpc, rest } = R;

const HIDE = ["harassment_or_threat", "private_person_exposure", "deceptive_impersonation", "advertising_spam", "resource_abuse"];
const REDACT = ["exposed_credentials", "private_data", "no_right_to_publish", "lawful_erasure"];
const NEVER = ["disagreement", "rejection of the record", "hostility to the project", "obscenity in quotation or evidence", "discomfort"];
const REASON_MAX = 2000, REGISTER_REASON_MAX = 500;   // the room's and the register's limits for a written reason (characters)
// bad tokens per source in this instance (R-24: slows brute force a little; the token is 256 bits): 20 within 15 minutes of the
// first answer 429 until those 15 minutes are over; entries expire and the map is bounded (the oldest window goes first)
const LOCK_MAX = 20, LOCK_WINDOW_MS = 15 * 60 * 1000, LOCK_SOURCES = 5000;
const failures = new Map();   // source hash → { first, count }
const chars = (s) => [...s].length;   // characters as the database counts them (code points)

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); return res.end(); }
  try {
    if (method === "GET") {
      const grounds = { hide: HIDE, redact: REDACT, never: NEVER };
      if (!OPEN && !CHAIN) return json(res, 200, { state: "closed", log: [], hidden_and_redacted: [], grounds }, { "Cache-Control": "public, max-age=300" });   // before it first opened; afterwards the log stays public
      const num = (k) => (url.searchParams.get(k) && /^\d{1,12}$/.test(url.searchParams.get(k)) ? Number(url.searchParams.get(k)) : null);
      const after = num("after") ?? 0, keptAfter = num("kept_after") ?? 0, limit = Math.min(500, Math.max(1, num("limit") ?? 500));
      const [log, hidden, revisions, stats, kept] = await Promise.all([
        rest(`moderation_log?id=gt.${after}&order=id.asc&limit=${limit}&select=id,at,entry_id,action,category,actor,classifier_model,classifier_prompt,classifier_score,content_sha256,reason`),
        rpc("cz_hidden", {}), rest("log_hash_revisions?select=id,at,day,old_sha256,new_sha256&order=id.asc&limit=500"), rpc("cz_stats", {}),
        rest(`moderation_reviews?id=gt.${keptAfter}&order=id.asc&limit=${limit}&select=id,at,flag_log_id,entry_id,decision,content_sha256,reason`).catch(() => null),
      ]);
      const byLang = {}, byMonth = {};
      for (const h of hidden) {
        const l = h.lang || "undeclared", m = String(h.updated || h.received).slice(0, 7);   // updated = the latest hide/redact decision (R-33)
        (byLang[l] ||= []).push(h.id); ((byMonth[m] ||= {})[l] ||= []).push(h.id);
      }
      return json(res, 200, { state: OPEN ? "open" : "closed", order: "log id ascending", next_after: log.length === limit ? log[log.length - 1].id : null,
        next_kept_after: kept !== null && kept.length === limit ? kept[kept.length - 1].id : null,
        paging: { after: "the log (log): rows with an id greater than this, ascending (default 0); the next page is ?after=<next_after>, which is null on the last page",
                  kept_after: "the keep decisions (kept_after_flag): rows with an id greater than this, ascending (default 0); the next page is ?kept_after=<next_kept_after>, which is null on the last page; \"unavailable\" when they could not be read just now",
                  limit: "rows per page in each of the two lists, 1 to 500 (default 500); the two cursors are independent — every response carries a page of each" },
        grounds,
        classifier: { prompt_version: R.MODERATION_PROMPT_VERSION, flags_only: true, unclassified_entries: stats.unclassified, note: "an entry not yet screened is published all the same; the daily job retries" },
        log, kept_after_flag: kept === null ? "unavailable" : kept.map((k) => ({ ...k, actor: "human", note: "a human decided that no ground applies to this flag" })),
        hidden_and_redacted: hidden.map((h) => ({ id: h.id, received: h.received, state: h.state, category: h.category, lang: h.lang, lang_detected: h.lang_detected, content_sha256: h.content_sha256, decided: h.updated, url: `${ORIGIN}/discuss/${h.id}` })),
        hidden_by_language: byLang, hidden_by_month_and_language: byMonth, day_hash_revisions: revisions,
        appeal: `${R.CONTACT} with the entry id; receipt within 7 days; a written reason; where the complaint concerns the administrator, the second key-holder decides` },
        { "Cache-Control": "public, max-age=0, s-maxage=60" });
    }
    if (method !== "POST") { res.setHeader("Allow", "GET, HEAD, POST, OPTIONS"); return json(res, 405, { error: "method" }); }
    const src = R.sourceHash(req), now = Date.now();
    for (const [k, f] of failures) if (now - f.first >= LOCK_WINDOW_MS) failures.delete(k);
    const f = failures.get(src);
    if (f && f.count >= LOCK_MAX) return json(res, 429, { error: "too many failed attempts" }, { "Retry-After": String(Math.max(1, Math.ceil((f.first + LOCK_WINDOW_MS - now) / 1000))) });
    const auth = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (!R.tokenEquals(auth, R.TOKEN)) {
      if (f) f.count++;
      else { failures.set(src, { first: now, count: 1 }); while (failures.size > LOCK_SOURCES) failures.delete(failures.keys().next().value); }
      return json(res, 401, { error: "unauthorised" });
    }
    let b; try { b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch { return json(res, 400, { error: "body must be JSON" }); }
    const id = Number(b.id), action = String(b.action || ""), category = b.category == null ? "" : String(b.category), reason = String(b.reason || "");
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: "id" });
    if (!reason) return json(res, 400, { error: "reason: a written reason is required" });
    // a reason longer than the limit is refused, never cut: the public log shows exactly what was written
    if (b.target === "register" && chars(reason) > REGISTER_REASON_MAX) return json(res, 400, { error: `reason (register): at most ${REGISTER_REASON_MAX} characters; this one has ${chars(reason)}` });
    if (chars(reason) > REASON_MAX) return json(res, 400, { error: `reason: at most ${REASON_MAX} characters; this one has ${chars(reason)}` });
    if (b.target === "register") {   // the Adoption Register: hide / unhide under the room's grounds (design/ADOPT.md §6)
      if (!["hide", "unhide"].includes(action)) return json(res, 400, { error: "action (register): hide | unhide" });
      if (action === "hide" && !HIDE.includes(category)) return json(res, 400, { error: "category (hide): " + HIDE.join(" | ") });
      let r;
      try { r = await rpc("cz_register_moderate", { p_id: id, p_action: action, p_category: action === "hide" ? category : null, p_reason: reason, p_token: R.TOKEN }); }
      catch (e) { if (/no such record/.test(e.message)) return json(res, 404, { error: "no such record" }); if (/already hidden|not hidden/.test(e.message)) return json(res, 409, { error: e.message.match(/already hidden|not hidden/)[0] }); throw e; }
      return json(res, 200, { id, target: "register", action, state: r.state, url: `${ORIGIN}/adopt/${id}`, logged: true });
    }
    if (action === "correct_translation") {
      const lang = String(b.lang || ""), text = typeof b.text === "string" ? b.text : "";
      if (!R.LANG_RE.test(lang) || lang.length > 35) return json(res, 400, { error: "lang: BCP 47 tag" });
      if (text.length < 1 || text.length > 12000) return json(res, 400, { error: "text: the corrected translation" });
      try { await rpc("cz_translation_correct", { p_entry: id, p_lang: lang, p_text: text, p_reason: reason, p_token: R.TOKEN }); }
      catch (e) { if (/no such entry/.test(e.message)) return json(res, 404, { error: "no such entry" }); throw e; }
      return json(res, 200, { id, action, lang, state: "corrected", url: `${ORIGIN}/discuss/${id}?translate=${encodeURIComponent(lang)}`, logged: true });
    }
    if (!["hide", "unhide", "redact", "unredact"].includes(action)) return json(res, 400, { error: "action: hide | unhide | redact | unredact | correct_translation" });
    if (action === "hide" && !HIDE.includes(category)) return json(res, 400, { error: "category (hide): " + HIDE.join(" | ") });
    if (action === "redact" && !REDACT.includes(category)) return json(res, 400, { error: "category (redact): " + REDACT.join(" | ") });
    if (action === "redact" && (typeof b.redacted_text !== "string" || b.redacted_text.length < 1 || b.redacted_text.length > 6000)) return json(res, 400, { error: "redacted_text: the content with markers in place of the removed parts" });
    try { await rpc("cz_moderate", { p_entry: id, p_action: action, p_category: (action === "hide" || action === "redact") ? category : null, p_reason: reason, p_redacted_text: action === "redact" ? b.redacted_text : null, p_token: R.TOKEN }); }
    catch (e) {
      if (/no such entry/.test(e.message)) return json(res, 404, { error: "no such entry" });
      const noop = e.message.match(/already hidden|not hidden|not redacted/);   // the transition would change nothing (schema v6g): refused, not logged
      if (noop) return json(res, 409, { error: noop[0] });
      throw e;
    }
    const rows = await rpc("cz_entry", { p_id: id });
    return json(res, 200, { id, action, state: rows && rows[0] ? rows[0].state : null, url: `${ORIGIN}/discuss/${id}`, logged: true, note: "pages and data may show the previous state for up to a minute (cache)" });
  } catch (err) {
    R.log("moderation", req.method, err);
    return json(res, 503, { error: "unavailable" }, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
