// The daily job (Blueprint 1.3.1 §7.2, §7.3): the chained SHA-256 of yesterday's entry log, and expiry of source hashes
// older than 30 days. Run by Vercel cron (vercel.json "crons"), authorised by CRON_SECRET; can be run by hand with the
// administrator's token (Authorization: Bearer) and an optional ?day=YYYY-MM-DD to (re)compute one day.
const R = require("../../room/lib.js");
const { OPEN, json, rpc } = R;

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const auth = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const ok = (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) || (process.env.CZ_ADMIN_TOKEN && auth === process.env.CZ_ADMIN_TOKEN);
  if (!ok) return json(res, 401, { error: "unauthorised" }, { "Cache-Control": "no-store" });
  if (!OPEN) return json(res, 200, { state: "closed", done: false }, { "Cache-Control": "no-store" });
  const day = url.searchParams.get("day");
  try {
    const r = await rpc("cz_daily", { p_token: process.env.CZ_ADMIN_TOKEN, p_day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null });
    return json(res, 200, { done: true, ...r }, { "Cache-Control": "no-store" });
  } catch (err) {
    return json(res, 500, { error: "server", detail: String(err.message || err).slice(0, 200) }, { "Cache-Control": "no-store" });
  }
};
