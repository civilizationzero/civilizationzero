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
    } else if (name === "cz_entry3") out = TABLE.filter((e) => e.id === a.p_id).map((e) => ({ ...e, has_replies: false }));
    else if (name === "cz_conversations" || name === "cz_theme_latest") {   // as the SQL of v10 does
      const themes = a.p_themes || [], byId = new Map(TABLE.map((e) => [e.id, e]));
      const rootOf = (e) => { while (e && e.parent != null && !themes.includes(e.parent)) e = byId.get(e.parent); return e; };
      const themeOf = (e) => { while (e && e.parent != null) { if (themes.includes(e.parent)) return e.parent; e = byId.get(e.parent); } return null; };
      if (name === "cz_theme_latest") out = themes.map((t) => { const v = TABLE.filter((e) => !e.hidden && themeOf(e) === t); const l = v.sort((x, y) => y.id - x.id)[0]; return { theme: t, latest_id: l ? l.id : null, latest_received: l ? l.received : null }; });
      else {
        const lat = new Map();
        for (const e of TABLE) { if (themes.includes(e.id) || e.hidden) continue; const r = rootOf(e); if (!r || themes.includes(r.id)) continue; const c = lat.get(r.id); if (!c || e.id > c.id) lat.set(r.id, e); }
        out = [...lat].map(([rid, l]) => ({ ...byId.get(rid), theme: themes.includes(byId.get(rid).parent) ? byId.get(rid).parent : null, latest_id: l.id, latest_received: l.received }))
          .filter((c) => (a.p_before == null || c.latest_id < a.p_before) && (a.p_theme == null || c.parent === a.p_theme)).sort((x, y) => y.latest_id - x.latest_id).slice(0, Math.min(a.p_limit ?? 30, 60));
      }
    }
    else if (name === "cz_stats") out = { entries: TABLE.length, hidden: TABLE.filter((e) => e.hidden).length, redacted: 0, today: 0, daily_intake_max: 500, unclassified: 0 };
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
    // limit boundaries (round 2): 1-200 reach the database unchanged; omitted or empty give 50; anything else is 400 with no database call
    for (const [q, want] of [["", 50], ["limit=", 50], ["limit=1", 1], ["limit=50", 50], ["limit=199", 199], ["limit=200", 200], ["limit=0", 400], ["limit=201", 400], ["limit=-1", 400], ["limit=1.5", 400],
                             ["limit=ten", 400], ["limit=99999999999999999999", 400], ["limit=050", 400], ["limit=+5", 400], ["limit=%201", 400]]) {
      CALLS = []; const rr = await call(entries, `/api/entries?${q}`);
      if (want === 400) { const jj = JSON.parse(rr.body); ok(rr.status === 400 && jj.parameter === "limit" && CALLS.length === 0, `${q || "(no limit)"}: 400, parameter limit, no database call (got ${rr.status}, ${CALLS.length} calls)`); }
      else ok(rr.status === 200 && CALLS.length === 1 && CALLS[0].args.p_limit === want, `${q || "(no limit)"}: reaches the database as ${want} (got ${rr.status} ${CALLS[0] && CALLS[0].args.p_limit})`);
    }
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
    r = await call(discuss, "/api/discuss?view=entries");   // every entry, newest first (since stage 2, /discuss lists conversations)
    const g = (/<div class="group">(?:(?!<div class="group">)[\s\S])*?further entries from the same declared source[\s\S]*?<\/p><\/div>/.exec(r.body) || [""])[0];
    ok(r.status === 200 && /2 further entries from the same declared source on this day \(<a href="\/discuss\/7">#7<\/a>, <a href="\/discuss\/8">#8<\/a>\)/.test(r.body), "a folded group links #7 and #8 by plain links");
    ok(g.includes('rel="nofollow">show all</a>') && !/<a href="\/discuss\/7"[^>]*rel=/.test(r.body), "grouping kept: the 'show all' view stays nofollow; the entry links do not");
    ok([...r.body.matchAll(/href="\/discuss\/(\d+)"/g)].map((m) => +m[1]).filter((v, i, a) => a.indexOf(v) === i).length >= 16, "every one of the 16 entries is linked from the entries view");
    // review of CZ 1432: "$&", "$'" and "$`" in a parent's name or text stay text on /respond?parent=N (a function replacement)
    TABLE = [entry(1, { author: "A$'B $& C", content: "Text with $` and $& and $' in it, long enough." })];
    r = await call(discuss, "/api/discuss?page=respond&parent=1");
    ok(r.status === 200 && (r.body.match(/<h1>/g) || []).length === 1 && (r.body.match(/<form/g) || []).length === 1 && (r.body.match(/name="parent"/g) || []).length === 1
       && (r.body.includes("A$&#39;B $&amp; C") || r.body.includes("A$'B $&amp; C")) && /\$` and \$&amp; and \$(&#39;|') in it/.test(r.body), `respond with a parent whose text holds $-patterns: one h1, one form (${(r.body.match(/<h1>/g) || []).length} h1, ${(r.body.match(/<form/g) || []).length} forms)`);
    // ---------- stage 2 (CZ 1433): the room as conversations — latest first, no counts, a hidden entry never moves a conversation
    TABLE = [entry(1), entry(2), entry(3, { parent: 1 }), entry(4, { parent: 2, hidden: true }), entry(5, { author: "Theme", parent: null }), entry(6, { parent: 5 }), entry(7, { parent: 6, hidden: true })];
    r = await call(discuss, "/api/discuss");
    const order = [...r.body.matchAll(/<article class="entry conv[^"]*" id="c(\d+)"/g)].map((m) => +m[1]);
    ok(r.status === 200 && order.join(",") === "5,1,2", `conversations, latest first (#5 by #6, #1 by #3, #2 alone: its reply #4 is hidden; #7 hidden) (got ${order.join(",")})`);
    ok(r.body.includes('Latest: <a href="/discuss/3">#3</a>') && !/\b\d+ (replies|reply|voices)\b/.test(r.body), "the latest entry is named; no count of replies or voices");
    ok(r.body.includes('href="/discuss?view=entries"') && r.body.includes('href="/discuss?order=canonical"'), "the entries view and the canonical order stay one link away");
    r = await call(discuss, "/api/discuss?cbefore=3");
    ok(r.status === 200 && /id="c2"/.test(r.body) && !/id="c1"/.test(r.body) && r.body.includes('name="robots" content="noindex"'), "conversation pages continue below a latest id, not indexed");
    // the sitemap refuses a query string (no cache bypass of a whole-archive read)
    CALLS = []; r = await call(discuss, "/api/discuss?page=sitemap&x=1");
    ok(r.status === 400 && CALLS.length === 0, `sitemap with a parameter: 400, no database call (got ${r.status})`);
  } catch (e) { fail++; console.log("FAIL exception", e.stack); }
  console.error = quiet;
  console.log(`pass ${pass} fail ${fail}`); srv.close(); process.exit(fail ? 1 : 0);
});
