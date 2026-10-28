// The daily job (Blueprint 1.3.1 §7.2, §7.3): the chained SHA-256 of every day not yet hashed (normally yesterday), the
// expiry of source hashes older than 30 days, and a retry of entries the classifier has not judged. Run by Vercel cron
// (vercel.json "crons"), authorised by CRON_SECRET; can be run by hand with the administrator's token (Authorization: Bearer)
// and `?day=YYYY-MM-DD` to compute up to that day, or `?day=…&force=1` to recompute from that day on (revisions are public).
const R = require("../../room/lib.js");
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
    return json(res, 200, { done: true, ...r, classifier_retried: retried }, { "Cache-Control": "no-store" });
  } catch (err) {
    R.log("daily", err);
    const notFinished = /not finished/.test(String(err.message));
    return json(res, notFinished ? 400 : 500, { error: notFinished ? "the day is not finished (UTC)" : "server", classifier_retried: retried }, { "Cache-Control": "no-store" });
  }
};
