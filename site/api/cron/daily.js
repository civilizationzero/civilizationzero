// The daily job (Blueprint 1.3.1 §7.2, §7.3): the chained SHA-256 of every day not yet hashed (normally yesterday), the
// expiry of source hashes older than 30 days, and a retry of entries the classifier has not judged. Run by Vercel cron
// (vercel.json "crons"), authorised by CRON_SECRET; can be run by hand with the administrator's token (Authorization: Bearer)
// and `?day=YYYY-MM-DD` to compute up to that day, or `?day=…&force=1` to recompute from that day on (revisions are public).
// Order: the hashes first — they are what must never be skipped — then the work that takes time, within a budget that leaves
// the function (60 s) room to answer: the register's trace re-checks (five at a time, 8 s each at most), then classifier retries.
const R = require("../../room/lib.js");
const G = require("../../room/register.js");
const { CHAIN, json, rpc } = R;

const BUDGET_MS = 45000;

module.exports = async (req, res) => {
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);
  const url = new URL(req.url, "http://x");
  const auth = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const ok = R.tokenEquals(auth, process.env.CRON_SECRET || "") || R.tokenEquals(auth, R.TOKEN);
  if (!ok) return json(res, 401, { error: "unauthorised" }, { "Cache-Control": "no-store" });
  if (!CHAIN && !G.CHAIN) return json(res, 200, { state: "closed", done: false }, { "Cache-Control": "no-store" });   // before anything first opened
  const day = url.searchParams.get("day");
  const p_day = day && R.validDate(day) ? day : null, p_force = url.searchParams.get("force") === "1";
  const out = { done: true };
  let failed = null;
  // 1. the room's chain: every finished day not yet hashed (once the room has opened, whatever its state)
  if (CHAIN) {
    try { Object.assign(out, await rpc("cz_daily", { p_token: R.TOKEN, p_day, p_force })); }
    catch (err) { R.log("daily", err); failed = err; }
  }
  // 2. the register's chain (once it has opened, whatever its state)
  if (G.CHAIN) {
    try { out.register = await rpc("cz_register_daily", { p_token: R.TOKEN, p_day, p_force }); }
    catch (e) { R.log("register daily", e); out.register = { error: String(e.message).slice(0, 200) }; }
  }
  // 3. while the register is open: re-check the traces of received statements (at most 30 days old, the least recently checked
  //    first, each record at most once in 10 minutes), five at a time, within the budget
  if (G.OPEN) {
    let checked = 0, found = 0;
    try {
      const queue = await rpc("cz_register_pending2", { p_limit: 50, p_token: R.TOKEN });
      const worker = async () => {
        while (queue.length && left() > 9000) {
          const p = queue.shift();
          const t = await G.traceCheck(p.trace_url, p.trace_token);
          await rpc("cz_register_trace", { p_id: p.id, p_found: t.found, p_http_status: t.http_status, p_body_sha256: t.body_sha256, p_detail: t.detail, p_token: R.TOKEN });
          checked++; if (t.found) found++;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker(), worker()]);
      out.register_traces = { checked, found, left_for_tomorrow: queue.length };
    } catch (e) { R.log("register traces", e); out.register_traces = { checked, found, error: String(e.message).slice(0, 200) }; }
  }
  // 4. while the room is open: retry entries the classifier has not judged yet (a failed call is recorded as pending, never
  //    blocks a post), within the budget
  let retried = 0;
  if (R.OPEN) {
    try {
      for (const e of await rpc("cz_unclassified", { p_limit: 50 })) {
        if (left() < 8000) break;
        await R.classify(e.id, e.content); retried++;
      }
    } catch (e) { R.log("retry", e); }
  }
  out.classifier_retried = retried;
  if (failed) {
    const notFinished = /not finished/.test(String(failed.message));
    return json(res, notFinished ? 400 : 500, { ...out, done: false, error: notFinished ? "the day is not finished (UTC)" : "server" }, { "Cache-Control": "no-store" });
  }
  return json(res, 200, out, { "Cache-Control": "no-store" });
};
