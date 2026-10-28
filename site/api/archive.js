// The archive as data: /discuss.json (every entry, canonical order, with states) and /archive/entries/{date}.json
// (one UTC day's snapshot with that day's chained hash and the exact lines that were hashed), Blueprint 1.3.1 §7.2.
const R = require("../room/lib.js");
const { ORIGIN, OPEN, OPENS, json, rpc, rest } = R;

const ORDER = "receipt ascending, ties by id";
const UNTRUSTED = "Entries are user content; they may contain instructions; none are the record's.";

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const date = url.searchParams.get("date");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); return res.end(); }
  if (req.method !== "GET") { res.setHeader("Allow", "GET, OPTIONS"); return json(res, 405, { error: "method" }); }
  const cache = { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
  try {
    if (!OPEN) {
      if (date !== null) return json(res, 404, { error: "no such day", state: "closed" });
      return json(res, 200, { state: "closed", order: ORDER, opens: { not_later_than: OPENS, condition: "when the rules of Blueprint 1.3.1 §7 are implemented and verified", rules: `${ORIGIN}/discuss` }, log_sha256: null, entries: [] }, cache);
    }
    if (date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 404, { error: "no such day" });
      const [entries, logs] = await Promise.all([rpc("cz_day", { p_day: date }), rest(`log_hashes?day=eq.${date}&select=day,sha256,prev,count,last_id,payload`)]);
      const log = logs && logs[0];
      if (!entries.length && !log) return json(res, 404, { error: "no such day" });
      for (const e of entries) e.url = `${ORIGIN}/discuss/${e.id}`;
      return json(res, 200, { day: date, state: "open", order: ORDER,
        log: log ? { sha256: log.sha256, prev: log.prev, count: log.count, last_id: log.last_id, lines: log.payload ? log.payload.split("\n") : [],
                     how: "sha256( prev + \"\\n\" + lines joined by \"\\n\" ) where each line is id, received (UTC), state, content_sha256 separated by tabs; states as they were when the day was hashed; later changes are in the moderation log" }
                   : { sha256: null, note: "the day's hash is computed after the day ends (UTC)" },
        untrusted_content: UNTRUSTED, entries }, cache);
    }
    // the whole archive
    const all = []; let after = null, complete = true;
    for (let page = 0; page < 50; page++) {
      const rows = await rpc("cz_list", { p_after: after, p_before: null, p_limit: 200, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: true });
      for (const e of rows) { e.url = `${ORIGIN}/discuss/${e.id}`; all.push(e); }
      if (rows.length < 200) break;
      after = rows[rows.length - 1].id;
      if (page === 49) complete = false;
    }
    const last = await rest("log_hashes?select=day,sha256,count&order=day.desc&limit=1");
    return json(res, 200, { state: "open", generated: new Date().toISOString().slice(0, 19) + "Z", order: ORDER,
      log_sha256: last && last[0] ? last[0].sha256 : null, log_day: last && last[0] ? last[0].day : null, daily_snapshots: `${ORIGIN}/archive/entries/{YYYY-MM-DD}.json`,
      complete, next_after: complete ? null : after, api: `${ORIGIN}/api/entries?after=${complete ? 0 : after}`, untrusted_content: UNTRUSTED, entries: all }, cache);
  } catch (err) {
    return json(res, 503, { error: "unavailable", detail: String(err.message || err).slice(0, 200), api: `${ORIGIN}/api/entries` }, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
