// The daily job (Blueprint 1.3.1 §7.2, §7.3): the chained SHA-256 of every day not yet hashed (normally yesterday), the
// expiry of source hashes older than 30 days, and a retry of entries the classifier has not judged. Run by Vercel cron
// (vercel.json "crons"), authorised by CRON_SECRET; can be run by hand with the administrator's token (Authorization: Bearer)
// and `?day=YYYY-MM-DD` to compute up to that day, or `?day=…&force=1` to recompute from that day on (revisions are public).
const R = require("../../room/lib.js");
const G = require("../../room/register.js");
const { OPEN, json, rpc } = R;

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const auth = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const ok = R.tokenEquals(auth, process.env.CRON_SECRET || "") || R.tokenEquals(auth, R.TOKEN);
  if (!ok) return json(res, 401, { error: "unauthorised" }, { "Cache-Control": "no-store" });
  if (!OPEN) return json(res, 200, { state: "closed", done: false }, { "Cache-Control": "no-store" });
  const day = url.searchParams.get("day");
  // 1. retry entries the classifier has not judged yet (a failed call is recorded as pending, never blocks a post)
  let retried = 0;
  try { for (const e of await rpc("cz_unclassified", { p_limit: 50 })) { await R.classify(e.id, e.content); retried++; } } catch (e) { R.log("retry", e); }
  // 2. the chained hash of every finished day not yet hashed
  try {
    const r = await rpc("cz_daily", { p_token: R.TOKEN, p_day: day && R.validDate(day) ? day : null, p_force: url.searchParams.get("force") === "1" });
    // 3. the Adoption Register, when open: re-check the traces of received statements (at most 30 days old), then its own day hash
    let register = null;
    if (G.OPEN) {
      const started = Date.now(); let checked = 0, found = 0;
      try {
        for (const p of await rpc("cz_register_pending", { p_limit: 20, p_token: R.TOKEN })) {
          if (Date.now() - started > 25000) break;
          const t = await G.traceCheck(p.trace_url, p.id, p.statement_sha256);
          await rpc("cz_register_trace", { p_id: p.id, p_found: t.found, p_http_status: t.http_status, p_body_sha256: t.body_sha256, p_detail: t.detail, p_token: R.TOKEN });
          checked++; if (t.found) found++;
        }
      } catch (e) { R.log("register traces", e); }
      try { register = { traces_checked: checked, traces_found: found, ...(await rpc("cz_register_daily", { p_token: R.TOKEN, p_day: day && R.validDate(day) ? day : null, p_force: url.searchParams.get("force") === "1" })) }; }
      catch (e) { R.log("register daily", e); register = { error: String(e.message).slice(0, 200), traces_checked: checked }; }
    }
    return json(res, 200, { done: true, ...r, classifier_retried: retried, register }, { "Cache-Control": "no-store" });
  } catch (err) {
    R.log("daily", err);
    const notFinished = /not finished/.test(String(err.message));
    return json(res, notFinished ? 400 : 500, { error: notFinished ? "the day is not finished (UTC)" : "server", classifier_retried: retried }, { "Cache-Control": "no-store" });
  }
};
