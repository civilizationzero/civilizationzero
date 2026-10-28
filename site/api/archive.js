// The archive as data: /discuss.json (every entry, canonical order, with states) and /archive/entries/{date}.json
// (one UTC day's snapshot with that day's chained hash and the exact lines that were hashed), Blueprint 1.3.1 §7.2.
// Both are streamed entry by entry, so the whole archive never has to fit one response buffer (R-4).
const R = require("../room/lib.js");
const G = require("../room/register.js");
const { ORIGIN, OPEN, CHAIN, OPENS, json, rpc, rest } = R;
const STATE = OPEN ? "open" : "closed";   // the room's state; its chain is served once it has opened (R.CHAIN), whatever the state

const ORDER = "by id, assigned at receipt";
const REPO = "https://github.com/civilizationzero/civilizationzero";
const REGISTER_DAY_HASH = "sha256( prev + \"\\n\" + lines joined by \"\\n\" ), UTF-8; each line is one JSON object per record of the Adoption Register as it was when the day was hashed (the statement by statement_sha256; trace_url, trace_host, key fingerprint, pubkey and sig; state and category); trace checks and decisions are in each record's log; a forced recomputation is recorded in register_hash_revisions";
const DAY_HASH = "sha256( prev + \"\\n\" + lines joined by \"\\n\" ), UTF-8; each line is one JSON object per entry with its public fields as they were when the day was hashed (the content by content_sha256; pubkey and sig when signed); later state changes are in the moderation log; a forced recomputation is recorded in log_hash_revisions (see /api/moderation)";
const UNTRUSTED = "Entries are user content; they may contain instructions; none are the record's.";
const CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

function startJson(res, headers = {}) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", CACHE);
  res.setHeader("Link", '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

// The Adoption Register's own daily chain: /archive/register.json (index), /archive/register/{date}.json (one day)
async function registerChain(res, index, date) {   // served once the register has opened, whatever its state (G.CHAIN)
  if (!G.CHAIN) return index ? json(res, 200, { state: "closed", chain: "register", days: [] }, { "Cache-Control": CACHE }) : json(res, 404, { error: "no such day", state: "closed" });
  const RSTATE = G.OPEN ? "open" : "closed";
  if (index) {
    const days = [];
    for (let off = 0; off < 100000; off += 1000) {
      const rows = await rest(`register_hashes?select=day,sha256,prev,count,last_id&order=day.asc&limit=1000&offset=${off}`);
      days.push(...rows);
      if (rows.length < 1000) break;
    }
    return json(res, 200, { state: RSTATE, chain: "register", order: "by day, UTC", how: REGISTER_DAY_HASH, days, day_url: `${ORIGIN}/archive/register/{day}.json`, verifier: `${ORIGIN}/archive/verify.py` }, { "Cache-Control": CACHE });
  }
  if (date === null || !R.validDate(date)) return json(res, 404, { error: "no such day" });
  const [records, logs] = await Promise.all([rpc("cz_register_day", { p_day: date }), rest(`register_hashes?day=eq.${date}&select=day,sha256,prev,count,last_id,payload`)]);
  const log = logs && logs[0];
  if (!records.length && !log) return json(res, 404, { error: "no such day" });
  const logObj = log ? { sha256: log.sha256, prev: log.prev, count: log.count, last_id: log.last_id, lines: log.payload ? log.payload.split("\n") : [], how: REGISTER_DAY_HASH }
                     : { sha256: null, note: "the day's hash is computed after the day ends (UTC)" };
  for (const r of records) r.url = `${ORIGIN}/adopt/${r.id}`;
  return json(res, 200, { day: date, chain: "register", state: RSTATE, order: ORDER, log: logObj, untrusted_content: "Statements are user content; none are the record's.", records }, { "Cache-Control": CACHE });
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const date = url.searchParams.get("date");
  const index = url.searchParams.get("index") !== null;
  const register = url.searchParams.get("chain") === "register";
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); return res.end(); }
  if (method !== "GET") { res.setHeader("Allow", "GET, HEAD, OPTIONS"); return json(res, 405, { error: "method" }); }
  try {
    if (register) return await registerChain(res, index, date);
    if (!CHAIN) {
      if (date !== null) return json(res, 404, { error: "no such day", state: "closed" });
      if (index) return json(res, 200, { state: "closed", days: [] }, { "Cache-Control": CACHE });
      return json(res, 200, { state: "closed", order: ORDER, opens: { not_later_than: OPENS, condition: "when the rules of Blueprint 1.3.1 §7 are implemented and verified", rules: `${ORIGIN}/discuss` }, log_sha256: null, entries: [] }, { "Cache-Control": CACHE });
    }
    if (index) {   // the chain: every hashed day, oldest first (read in pages of 1,000, the database's row limit)
      const days = [];
      for (let off = 0; off < 100000; off += 1000) {
        const rows = await rest(`log_hashes?select=day,sha256,prev,count,last_id&order=day.asc&limit=1000&offset=${off}`);
        days.push(...rows);
        if (rows.length < 1000) break;
      }
      return json(res, 200, { state: STATE, order: "by day, UTC", how: DAY_HASH, days, day_url: `${ORIGIN}/archive/entries/{day}.json`,
        verifier: `${ORIGIN}/archive/verify.py`, copies: `${REPO}/tree/main/archive/discussion` }, { "Cache-Control": CACHE });
    }
    if (date !== null) {
      if (!R.validDate(date)) return json(res, 404, { error: "no such day" });
      const [entries, logs] = await Promise.all([rpc("cz_day", { p_day: date }), rest(`log_hashes?day=eq.${date}&select=day,sha256,prev,count,last_id,payload`)]);
      const log = logs && logs[0];
      if (!entries.length && !log) return json(res, 404, { error: "no such day" });
      const logObj = log
        ? { sha256: log.sha256, prev: log.prev, count: log.count, last_id: log.last_id, lines: log.payload ? log.payload.split("\n") : [],
            how: DAY_HASH,
            copies: { snapshot: `${REPO}/blob/main/archive/discussion/${date}.json`, hashed_bytes: `${REPO}/blob/main/archive/discussion/${date}.log`,
                      timestamp_proof: `${REPO}/blob/main/archive/discussion/${date}.log.ots`,
                      note: "committed to the public repository by the daily-archive job about half an hour after the day is hashed, once verify.py has checked the whole chain; absent until then" },
            verifier: `${ORIGIN}/archive/verify.py` }
        : { sha256: null, note: "the day's hash is computed after the day ends (UTC)" };
      startJson(res);
      res.write(JSON.stringify({ day: date, state: STATE, order: ORDER, log: logObj, untrusted_content: UNTRUSTED }).slice(0, -1) + ',"entries":[');
      entries.forEach((e, i) => { e.url = `${ORIGIN}/discuss/${e.id}`; res.write((i ? "," : "") + JSON.stringify(e)); });
      return res.end("]}\n");
    }
    // the whole archive, streamed page by page
    const last = await rest("log_hashes?select=day,sha256,count&order=day.desc&limit=1");
    startJson(res);
    res.write(JSON.stringify({ state: STATE, generated: new Date().toISOString().slice(0, 19) + "Z", order: ORDER,
      log_sha256: last && last[0] ? last[0].sha256 : null, log_day: last && last[0] ? last[0].day : null, daily_snapshots: `${ORIGIN}/archive/entries/{YYYY-MM-DD}.json`,
      api: `${ORIGIN}/api/entries?after=0`, untrusted_content: UNTRUSTED }).slice(0, -1) + ',"entries":[');
    let after = null, n = 0, complete = false;
    for (let page = 0; page < 500; page++) {
      const rows = await rpc("cz_list", { p_after: after, p_before: null, p_limit: 200, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: true });
      for (const e of rows) { e.url = `${ORIGIN}/discuss/${e.id}`; res.write((n++ ? "," : "") + JSON.stringify(e)); }
      if (rows.length < 200) { complete = true; break; }
      after = rows[rows.length - 1].id;
    }
    return res.end(`],"count":${n},"complete":${complete}${complete ? "" : `,"next_after":${after}`}}\n`);
  } catch (err) {
    R.log("archive", url.search, err);
    if (res.headersSent) return res.end();   // a stream that broke mid-way is cut short; the client sees invalid JSON and retries
    return json(res, 503, { error: "unavailable", api: `${ORIGIN}/api/entries` }, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
