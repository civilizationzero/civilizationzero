// GET /api/entries filters (audit CZ22) and discussion discovery (CZ21), against a MOCK database: a local HTTP server that answers
// the Supabase RPCs the functions call (cz_list, cz_stats, cz_ref_counts) from an in-memory table. It tests this code's requests,
// pagination and rendering; it does not test the production database or the SQL functions, which are unchanged by this branch.
// Run: node site/test/room_mock.test.js
const http = require("http"), path = require("path");
let TABLE = [], CALLS = [];
const srv = http.createServer((q, s) => {
  let b = ""; q.on("data", (d) => (b += d)); q.on("end", () => {
    const a = b ? JSON.parse(b) : {}, name = (/\/rpc\/(\w+)/.exec(q.url) || [])[1];
    CALLS.push({ name, args: a, url: q.url });
    let out = [];
    if (name === "cz_list") {   // as the SQL does: hidden left out unless asked, filters applied, after → ascending, before → descending
      let rows = TABLE.filter((e) => (a.p_include_hidden || !e.hidden) && (!a.p_kind || e.kind === a.p_kind) && (!a.p_ref || e.ref === a.p_ref) && (!a.p_lang || e.lang === a.p_lang));
      if (a.p_before != null) rows = rows.filter((e) => e.id < a.p_before).sort((x, y) => y.id - x.id);
      else rows = rows.filter((e) => a.p_after == null || e.id > a.p_after).sort((x, y) => x.id - y.id);
      out = rows.slice(0, Math.min(a.p_limit ?? 50, 200));
    } else if (name === "cz_stats") out = { entries: TABLE.length, hidden: TABLE.filter((e) => e.hidden).length, redacted: 0, today: 0, daily_intake_max: 500, unclassified: 0 };
    s.setHeader("content-type", "application/json"); s.end(JSON.stringify(out));
  });
});
const entry = (id, o = {}) => ({ id, state: "published", received: `2026-10-${String(28 + Math.floor((id - 1) / 200)).padStart(2, "0")}T12:00:00+00:00`, author: `Reader ${id}`, kind: id % 2 ? "human" : "ai",
  system: null, operator: null, prompt: null, lang: "en", lang_detected: "en", ref: String(id % 16), content: `Entry number ${id}, long enough to be valid.`, content_sha256: "a".repeat(64),
  declared_date: null, key_fingerprint: null, category: null, hidden: false, pubkey: null, sig: null, parent: null, ...o });
function call(h, url) {
  return new Promise((r) => {
    const res = { statusCode: 200, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      write(x) { this.body += x; }, end(x) { r({ status: this.statusCode, headers: this.headers, body: this.body + (x || "") }); } };
    const p = h({ url, method: "GET", headers: { host: "civilizationzero.ai" } }, res); if (p && p.catch) p.catch((e) => r({ status: 599, body: String(e.stack) }));
  });
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
srv.listen(0, "127.0.0.1", async () => {
  process.env.SUPABASE_URL = `http://127.0.0.1:${srv.address().port}`; process.env.SUPABASE_ANON_KEY = "test"; process.env.CZ_SALT = "x".repeat(40);
  const entries = require(path.resolve(__dirname, "../api/entries.js")), discuss = require(path.resolve(__dirname, "../api/discuss.js"));
  const quiet = console.error; console.error = () => {};
  try {
    // ---------- filters (CZ22)
    TABLE = Array.from({ length: 120 }, (_, i) => entry(i + 1, { hidden: (i + 1) % 10 === 0 }));
    for (const [q, p] of [["kind=robot", "kind"], ["ref=16", "ref"], ["lang=!!", "lang"], ["after=x", "after"], ["limit=-1", "limit"], ["include_hidden=1", "include_hidden"]]) {
      CALLS = []; const r = await call(entries, `/api/entries?${q}`); const j = JSON.parse(r.body);
      ok(r.status === 400 && j.parameter === p && typeof j.error === "string" && !("entries" in j) && CALLS.length === 0, `${q}: 400 naming ${p}, no database call (got ${r.status} ${r.body.slice(0, 80)})`);
    }
    CALLS = []; let r = await call(entries, "/api/entries"); let j = JSON.parse(r.body);
    ok(r.status === 200 && j.entries.length === 50 && j.entries[0].id === 1 && j.next_after === 55 && j.entries.length === 50 && !j.entries.some((e) => e.hidden) && CALLS[0].args.p_kind === null && CALLS[0].args.p_ref === null && CALLS[0].args.p_lang === null && CALLS[0].args.p_include_hidden === false,
       `no filter: the default page of 50, hidden left out (next_after ${j.next_after}, args ${JSON.stringify(CALLS[0] && CALLS[0].args)})`);
    r = await call(entries, `/api/entries?after=${j.next_after}`); const j2 = JSON.parse(r.body);
    ok(j2.entries[0].id === 56 && j2.entries.length === 50 && !j2.entries.some((e) => e.hidden), "pagination: after=next_after continues where the first page ended");
    CALLS = []; r = await call(entries, "/api/entries?kind=ai&ref=13&limit=10"); j = JSON.parse(r.body);
    ok(r.status === 200 && CALLS[0].args.p_kind === "ai" && CALLS[0].args.p_ref === "13" && CALLS[0].args.p_limit === 10 && j.entries.every((e) => e.kind === "ai" && e.ref === "13"), "valid kind and ref are passed through and applied");
    CALLS = []; r = await call(entries, "/api/entries?kind=&ref=&lang="); ok(r.status === 200 && CALLS[0].args.p_kind === null && CALLS[0].args.p_ref === null && CALLS[0].args.p_lang === null, "empty values: as if not given (the documented all default)");
    CALLS = []; r = await call(entries, "/api/entries?lang=FA"); ok(r.status === 200 && CALLS[0].args.p_lang === "fa", "lang is canonicalised, as before");
    CALLS = []; r = await call(entries, "/api/entries?include_hidden=true"); j = JSON.parse(r.body); ok(r.status === 200 && CALLS[0].args.p_include_hidden === true && j.entries.some((e) => e.hidden), "include_hidden=true still includes hidden entries");
    TABLE = []; r = await call(entries, "/api/entries"); j = JSON.parse(r.body); ok(r.status === 200 && j.entries.length === 0 && j.next_after === null, "an empty archive: 200, no entries, no cursor");

    // ---------- the discussion sitemap (CZ21)
    TABLE = Array.from({ length: 450 }, (_, i) => entry(i + 1, { hidden: (i + 1) % 7 === 0, state: (i + 1) % 7 === 0 ? "hidden" : (i + 1) === 9 ? "redacted" : "published" }));
    CALLS = []; r = await call(discuss, "/api/discuss?page=sitemap");
    const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), want = TABLE.filter((e) => !e.hidden).map((e) => `https://civilizationzero.ai/discuss/${e.id}`);
    ok(r.status === 200 && /^application\/xml/.test(r.headers["content-type"]) && r.body.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), "sitemap: XML, sitemaps.org namespace");
    ok(JSON.stringify(locs) === JSON.stringify(want), `sitemap: every entry not hidden, canonical /discuss/{id}, in id order (${locs.length} of ${TABLE.length}; ${want.length} expected)`);
    ok(!locs.includes("https://civilizationzero.ai/discuss/7") && locs.includes("https://civilizationzero.ai/discuss/9"), "sitemap: a hidden entry is left out; a redacted one is listed (its page is public)");
    ok(CALLS.filter((c) => c.name === "cz_list").length === Math.ceil(want.length / 200) && Math.ceil(want.length / 200) === 2 && CALLS.every((c) => c.args.p_include_hidden === false), `sitemap: read in pages of 200 (${CALLS.length} calls), never asking for hidden entries`);
    ok(/<lastmod>2026-10-28<\/lastmod>/.test(r.body) && /<lastmod>2026-10-30<\/lastmod>/.test(r.body), "sitemap: lastmod is the received day");
    const keep = TABLE;   // the guard in the code itself: even if the database returned a hidden entry, it would not be listed
    TABLE = keep.slice(0, 3).map((e) => ({ ...e, hidden: false })); TABLE[1].hidden = true;
    const realList = srv.listeners("request")[0]; srv.removeAllListeners("request");
    srv.on("request", (q, s) => { if (q.url.includes("cz_list")) { s.setHeader("content-type", "application/json"); return s.end(JSON.stringify(TABLE)); } realList(q, s); });   // returns hidden rows regardless
    r = await call(discuss, "/api/discuss?page=sitemap"); ok(!r.body.includes("/discuss/2<") && r.body.includes("/discuss/1<") && r.body.includes("/discuss/3<"), "sitemap: hidden excluded by the code as well as by the query");
    srv.removeAllListeners("request"); srv.on("request", realList);
    TABLE = []; r = await call(discuss, "/api/discuss?page=sitemap"); ok(r.status === 200 && !/<url>/.test(r.body) && /<\/urlset>\n$/.test(r.body), "sitemap: an empty archive gives a valid, empty urlset");
    TABLE = keep;

    // ---------- folded groups keep a crawlable link to each entry (CZ21)
    TABLE = Array.from({ length: 16 }, (_, i) => entry(i + 1, { received: "2026-10-28T18:30:00+00:00", author: `Reader ${i + 1}` }));
    for (const id of [6, 7, 8]) Object.assign(TABLE[id - 1], { kind: "ai", system: "Model X", operator: "op", author: "Model X" });   // one declared source, one day: one group
    r = await call(discuss, "/api/discuss");
    const g = (/<div class="group">(?:(?!<div class="group">)[\s\S])*?further entries from the same declared source[\s\S]*?<\/p><\/div>/.exec(r.body) || [""])[0];
    ok(r.status === 200 && /2 further entries from the same declared source on this day \(<a href="\/discuss\/7">#7<\/a>, <a href="\/discuss\/8">#8<\/a>\)/.test(r.body), "a folded group links #7 and #8 by plain links");
    ok(g.includes('rel="nofollow">show all</a>') && !/<a href="\/discuss\/7"[^>]*rel=/.test(r.body), "grouping kept: the 'show all' view stays nofollow; the entry links do not");
    ok([...r.body.matchAll(/href="\/discuss\/(\d+)"/g)].map((m) => +m[1]).filter((v, i, a) => a.indexOf(v) === i).length >= 16, "every one of the 16 entries is linked from the unfiltered index");
  } catch (e) { fail++; console.log("FAIL exception", e.stack); }
  console.error = quiet;
  console.log(`pass ${pass} fail ${fail}`); srv.close(); process.exit(fail ? 1 : 0);
});
