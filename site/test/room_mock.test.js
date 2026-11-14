// GET /api/entries filters (audit CZ22) and discussion discovery (CZ21), against a MOCK database: a local HTTP server that answers
// the Supabase RPCs the functions call (cz_list, cz_stats, cz_ref_counts) from an in-memory table. It tests this code's requests,
// pagination and rendering; it does not test the production database or the SQL functions, which are unchanged by this branch.
// Run: node site/test/room_mock.test.js
const http = require("http"), path = require("path");
let TABLE = [], CALLS = []; let TRANS = []; let SOURCE_CAP = 150000, SOURCE_USED = 0;
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
    } else if (name === "cz_entry3" || name === "cz_entry4") out = TABLE.filter((e) => e.id === a.p_id).map((e) => ({ ...e, has_replies: TABLE.some((c) => c.parent === e.id) }));
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
    else if (name === "cz_conversation") {   // as v8: from the topmost ancestor (or a theme's answer) down, canonical order
      const byId = new Map(TABLE.map((e) => [e.id, e])), themes = a.p_themes || [];
      let id = a.p_id; for (let e = byId.get(id); e && e.parent != null && !themes.includes(e.parent); e = byId.get(e.parent)) id = e.parent;
      const down = new Set([id]); let grew = true; while (grew) { grew = false; for (const e of TABLE) if (e.parent != null && down.has(e.parent) && !down.has(e.id)) { down.add(e.id); grew = true; } }
      out = TABLE.filter((e) => down.has(e.id) && e.id > (a.p_after || 0)).sort((x, y) => x.id - y.id).slice(0, a.p_limit || 200);
    }
    else if (name === "cz_translations") out = TRANS.filter((t) => (a.p_entries || []).includes(t.entry_id) && t.lang === a.p_lang && t.text != null && !(TABLE.find((e) => e.id === t.entry_id) || {}).hidden);
    else if (name === "cz_translation_get") out = TRANS.filter((t) => t.entry_id === a.p_entry && t.lang === a.p_lang);
    else if (name === "cz_translation_states") out = TRANS.filter((t) => (a.p_entries || []).includes(t.entry_id) && t.lang === a.p_lang && !(TABLE.find((e) => e.id === t.entry_id) || {}).hidden)
      .map((t) => ({ entry_id: t.entry_id, state: t.state, engine: t.engine, at: t.at, unchanged: t.text != null && t.text === (TABLE.find((e) => e.id === t.entry_id) || {}).content, snippet: ["done", "corrected"].includes(t.state) ? t.text : null }));
    else if (name === "cz_budget_status") out = { cap_cents: 3000, spent_cents: 0, today_cents: 0, days_remaining: 17, source_chars_per_day: SOURCE_CAP };
    else if (name === "cz_source_chars") out = SOURCE_USED;
    else if (name === "cz_translation_claim") {   // as the SQL: entries no one is translating now, marked "working" and returned
      out = [];
      for (const id of a.p_entries) {
        const i = TRANS.findIndex((t) => t.entry_id === id && t.lang === a.p_lang), e = TABLE.find((x) => x.id === id), t = TRANS[i];
        if (!e || e.hidden) continue;
        if (t && !((t.state === "pending" && !(/^working/.test(t.engine) && Date.now() - Date.parse(t.at) < a.p_window_s * 1000)) || (t.state === "done" && t.text === e.content))) continue;
        const row = { entry_id: id, lang: a.p_lang, text: null, engine: "working: since now", at: new Date().toISOString(), state: "pending" };
        if (i >= 0) TRANS[i] = row; else TRANS.push(row);
        out.push({ entry_id: id });
      }
    }
    else if (name === "cz_translation_note" || name === "cz_translation_store") {   // as the SQL: a note never over a good translation
      for (const id of name === "cz_translation_note" ? a.p_entries : [a.p_entry]) {
        const i = TRANS.findIndex((t) => t.entry_id === id && t.lang === a.p_lang), e = TABLE.find((x) => x.id === id);
        const row = { entry_id: id, lang: a.p_lang, text: name === "cz_translation_note" ? null : a.p_text, engine: name === "cz_translation_note" ? a.p_note : a.p_engine, at: new Date().toISOString(), state: name === "cz_translation_note" ? "pending" : a.p_state };
        if (name === "cz_translation_note" && (!e || e.hidden || (i >= 0 && TRANS[i].state !== "pending" && TRANS[i].text !== e.content))) continue;
        if (i >= 0) TRANS[i] = row; else TRANS.push(row);
      }
      out = null;
    }
    else if (name === "cz_stats") out = { entries: TABLE.length, hidden: TABLE.filter((e) => e.hidden).length, redacted: 0, today: 0, daily_intake_max: 500, unclassified: 0 };
    s.setHeader("content-type", "application/json"); s.end(JSON.stringify(out));
  });
});
const entry = (id, o = {}) => ({ id, state: "published", received: `2026-10-${String(28 + Math.floor((id - 1) / 200)).padStart(2, "0")}T12:00:00+00:00`, author: `Reader ${id}`, kind: id % 2 ? "human" : "ai",
  system: null, operator: null, prompt: null, lang: "en", lang_detected: "en", ref: String(id % 16), content: `Entry number ${id}, long enough to be valid.`, content_sha256: "a".repeat(64),
  declared_date: null, key_fingerprint: null, category: null, hidden: false, pubkey: null, sig: null, parent: null, ...o });
function call(h, url, opt = {}) {
  return new Promise((r) => {
    const res = { statusCode: 200, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      write(x) { this.body += x; }, end(x) { r({ status: this.statusCode, headers: this.headers, body: this.body + (x || "") }); } };
    const p = h({ url, method: opt.method || "GET", headers: { host: "civilizationzero.ai", ...(opt.headers || {}) }, body: opt.body }, res); if (p && p.catch) p.catch((e) => r({ status: 599, body: String(e.stack) }));
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
    ok(r.headers.link === '</discuss.md>; rel="alternate"; type="text/markdown", </discuss.json>; rel="alternate"; type="application/json"', "the room's Link: its Markdown and its data (CZ 1433)");
    ok(r.status === 200 && order.join(",") === "5,1,2", `conversations, latest first (#5 by #6, #1 by #3, #2 alone: its reply #4 is hidden; #7 hidden) (got ${order.join(",")})`);
    ok(r.body.includes('Latest: <a href="/discuss/3">#3</a>') && !/\b\d+ (replies|reply|voices)\b/.test(r.body), "the latest entry is named; no count of replies or voices");
    ok(r.body.includes('href="/discuss?view=entries"') && r.body.includes('href="/discuss?order=canonical"'), "the entries view and the canonical order stay one link away");
    r = await call(discuss, "/api/discuss?cbefore=3");
    ok(r.status === 200 && /id="c2"/.test(r.body) && !/id="c1"/.test(r.body) && r.body.includes('name="robots" content="noindex"'), "conversation pages continue below a latest id, not indexed");
    // ---------- stage 3 (CZ 1433): new after a mark (#10–#16 open themes in the build) — counted from the data (hidden entries left out), canonical order, no memory but the address
    TABLE = [entry(1), entry(2), entry(3, { parent: 1 }), entry(4, { parent: 2, hidden: true }), entry(9, { parent: 1 }), entry(17)];
    r = await call(discuss, "/api/discuss?since=2");
    const sinceIds = [...((/<ol class="since">([\s\S]*?)<\/ol>/.exec(r.body) || ["", ""])[1]).matchAll(/href="\/discuss\/(\d+)" class="exact"/g)].map((m) => +m[1]);
    ok(r.status === 200 && r.body.includes("3 entries after #2, in canonical order") && sinceIds.join(",") === "3,9,17", `since=2: #3, #9, #17, not the hidden #4 (got ${sinceIds.join(",")})`);
    ok(r.body.includes('href="/discuss?since=17" rel="nofollow"') && r.body.includes('name="robots" content="noindex"'), "a new mark at the latest entry; the view is not indexed");
    ok((r.body.match(/class="new">new after #2</g) || []).length === 2, "the two conversations with entries after #2 are marked (#1 by #9, #17 itself)");
    r = await call(discuss, "/api/discuss?since=17");
    ok(r.body.includes("No entries after #17 yet.") && !r.body.includes('class="new"'), "nothing after the latest: said so, nothing marked");
    r = await call(discuss, "/api/discuss");
    ok(r.body.includes('bookmark <a href="/discuss?since=17" rel="nofollow">'), "the room offers a mark at its latest entry");
    // ---------- stage 4 (CZ 1433): reading in another language — GET reads what exists and never asks the engine; a POST asks for the rest
    TABLE = [entry(1, { lang: "en" }), entry(3, { parent: 1, lang: "en" }), entry(5, { parent: 3, hidden: true }), entry(7, { parent: 3, lang: "en" })];
    TRANS = [{ entry_id: 1, lang: "fa", text: "متن ترجمه‌شدهٔ یک", engine: "model-x", at: "2026-11-02T06:00:00Z", state: "done" }, { entry_id: 5, lang: "fa", text: "SECRET hidden translation", engine: "m", at: "2026-11-02T06:00:00Z", state: "done" }];
    CALLS = []; r = await call(discuss, "/api/discuss?id=3&tl=fa");
    ok(r.status === 200 && r.body.includes("متن ترجمه‌شدهٔ یک") && !r.body.includes("SECRET"), "tl=fa: the existing translation of #1 shown; nothing of the hidden #5");
    ok(!CALLS.some((c) => ["cz_translation_store", "cz_source_chars", "cz_budget_status"].includes(c.name)), `tl=fa: GET never asks the engine (calls: ${[...new Set(CALLS.map((c) => c.name))].join(",")})`);
    ok(/<form method="post" action="\/api\/discuss\?page=translate" class="tr-go"><input type="hidden" name="ids" value="3,7"><input type="hidden" name="back" value="\/discuss\/3"><input type="hidden" name="lang" value="fa">/.test(r.body) && r.body.includes("Translate the 2 remaining entries into"), "the press posts the shown entries without a translation (#3, #7), not the hidden one, and returns to this view");
    ok(r.body.includes('name="robots" content="noindex"') && r.body.includes('<link rel="canonical" href="https://civilizationzero.ai/discuss/3">'), "a translated view: not indexed; the original is canonical");
    ok(r.body.includes('class="mtag">machine translation</span>') || r.body.includes('class="mtag">Machine translation'), "the translation is marked as machine translation");
    ok(r.body.includes('<a href="/discuss/3">Original</a>') && r.body.includes('href="/discuss/3?tl=fa&amp;both=1"'), "the original and the side-by-side view one click away");
    r = await call(discuss, "/api/discuss?id=3&translate=fa"); ok(r.status === 200 && r.body.includes("متن ترجمه‌شدهٔ یک"), "the earlier ?translate= reads like ?tl= (read-only)");
    r = await call(discuss, "/api/discuss?id=3&tl=!!"); ok(r.status === 200 && r.body.includes("is not a language tag this site translates into"), "a bad tag: said so, the original shown");
    r = await call(discuss, "/api/discuss?id=3", { headers: { "accept-language": "fa-IR,fa;q=0.9,en;q=0.8" } });
    ok(/class="tr-go tr-offer"><input type="hidden" name="ids" value="3,1,7"><input type="hidden" name="back" value="\/discuss\/3"><input type="hidden" name="lang" value="fa"><button type="submit" class="cta">Read this page in <span lang="fa">فارسی<\/span><\/button>/.test(r.body), "Accept-Language fa: one press offers the page in Persian");
    ok(r.body.includes('<select name="lang" required><option value="" selected disabled>Choose a language</option>') && r.body.includes('<option value="fa" lang="fa">فارسی — Persian</option>'), "and a list of languages, each by its own name");
    r = await call(discuss, "/api/discuss?id=3", { headers: { "accept-language": "en-GB,en;q=0.9" } });
    ok(!r.body.includes('class="tr-offer"'), "Accept-Language en, entries in English: no offer");
    r = await call(discuss, "/api/discuss?page=translate", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: { lang: "fa", ids: "3,7", back: "/discuss/3?tl=fa" } });
    ok(r.status === 403, `POST from another site's page: refused (${r.status})`);
    // the press (CZ 1445): no engine configured → said so, nothing spent
    CALLS = []; r = await call(discuss, "/api/discuss?page=translate", { method: "POST", headers: { origin: "https://civilizationzero.ai", "content-type": "application/x-www-form-urlencoded" }, body: { lang: "fa", ids: "3,5,7,1", back: "/discuss/3" } });
    ok(r.status === 303 && r.headers.location === "/discuss/translating?tl=fa&held=engine&back=%2Fdiscuss%2F3" && !CALLS.some((c) => ["cz_source_chars", "cz_translation_note"].includes(c.name)), `POST without an engine: the progress page says so (${r.headers.location})`);
    r = await call(discuss, "/api/discuss?page=progress&tl=fa&held=engine&back=%2Fdiscuss%2F3");
    ok(r.status === 200 && r.body.includes("Not translated into") && r.body.includes("no translation engine is configured") && r.body.includes('href="/discuss/3?tl=fa&amp;fresh='), "the progress page: why nothing was translated, and the page");
    // the engine, stubbed: the first answer hands back the original (as #126 did), the stronger model translates; #7 is already Persian
    process.env.ANTHROPIC_API_KEY = "test"; const realFetch = global.fetch, asked = [];
    global.fetch = async (u, o) => {
      if (!String(u).includes("api.anthropic.com")) return realFetch(u, o);
      const q = JSON.parse(o.body), text = /<text>\n([\s\S]*)\n<\/text>/.exec(q.messages[0].content)[1]; asked.push({ model: q.model, text, system: q.system });
      const out = (q.model.includes("haiku") && text.startsWith("Entry number 3")) || text.startsWith("من ") ? text : `ترجمهٔ فارسی: ${text.replace(/[A-Za-z]/g, "ب")}`;
      return { ok: true, json: async () => ({ model: q.model, stop_reason: "end_turn", content: [{ type: "text", text: `<translation>${out}</translation>` }], usage: { input_tokens: 100, output_tokens: 100 } }) };
    };
    TABLE = [entry(1, { lang: "en" }), entry(3, { parent: 1, lang: "en" }), entry(5, { parent: 3, hidden: true }), entry(7, { parent: 3, lang: "fa", lang_detected: "fa" }), entry(9, { parent: 3, lang: "en" })];
    TRANS = [{ entry_id: 1, lang: "fa", text: "متن ترجمه‌شدهٔ یک", engine: "model-x", at: "2026-11-02T06:00:00Z", state: "done" }];
    CALLS = []; r = await call(discuss, "/api/discuss?page=translate", { method: "POST", headers: { origin: "https://civilizationzero.ai", "content-type": "application/x-www-form-urlencoded" }, body: { lang: "fa", ids: "3,5,7,1,9", back: "/discuss/3" } });
    const loc = r.headers.location || "";
    ok(r.status === 303 && /^\/discuss\/translating\?tl=fa&ids=3\.9&ts=\d+&back=%2Fdiscuss%2F3$/.test(loc), `POST: answered with the progress page of #3 and #9 — not #1 (translated), #5 (hidden), #7 (already Persian) (${loc})`);
    ok(asked.filter((x) => x.text.startsWith("Entry number 3")).map((x) => x.model).join(",") === "claude-haiku-5-5,claude-sonnet-5-5" && asked.find((x) => x.model.includes("sonnet")).system.includes("rejected because the engine gave the original back"), `an answer that hands back the original is asked again of the stronger model, told why (${asked.map((x) => x.model).join(",")})`);
    ok(TRANS.find((t) => t.entry_id === 3).state === "done" && TRANS.find((t) => t.entry_id === 3).engine === "claude-sonnet-5-5" && TRANS.find((t) => t.entry_id === 9).engine === "claude-haiku-5-5", "both kept, each with the engine that made it");
    ok(CALLS.filter((c) => c.name === "cz_source_chars").map((c) => c.args.p_chars).sort((x, y) => x - y).join(",") === [0, TABLE[1].content.length, TABLE[4].content.length].sort((x, y) => x - y).join(",") && CALLS.some((c) => c.name === "cz_translation_claim" && c.args.p_entries.join(",") === "3,9"), "the reader's characters checked before any work, each entry charged as its work begins; the entries claimed in one call");
    r = await call(discuss, "/api/discuss" + loc.replace("/discuss/translating?", "?page=progress&"));
    ok(r.status === 200 && r.body.includes("<strong>2 of 2</strong>") && /<meta http-equiv="refresh" content="0;url=\/discuss\/3\?tl=fa&amp;fresh=\d+">/.test(r.body) && r.body.includes('name="robots" content="noindex"'), "the progress page: all done, it opens the translated page by itself");
    ok(r.body.includes('<li class="tr-done"><a href="/discuss/3?tl=fa">#3</a> <span class="tr-st">translated</span> <span class="tr-snip" dir="auto" lang="fa">ترجمهٔ فارسی'), "each entry with its first translated words");
    r = await call(discuss, "/api/discuss?id=3&tl=fa");
    ok(r.body.includes("3 of 3 entries on this page translated") && r.body.includes("1 already in") && !r.body.includes("remaining"), "the view: everything that needed it translated; the Persian entry counted as already in Persian");
    r = await call(discuss, "/api/discuss?id=3&tl=fa&fresh=123");
    ok(r.headers["cache-control"] === "no-store", `the view a press opens ("fresh") is never cached (${r.headers["cache-control"]})`);
    // an entry labelled English but written in Persian: the engine hands it back, and that is right — no second model, no failure
    TABLE.push(entry(15, { parent: 3, lang: "en", lang_detected: null, content: "من با آنچه این پروژه می‌کوشد انجام دهد موافقم و فکر می‌کنم این گفت‌وگو مهم است." }));
    asked.length = 0; r = await call(discuss, "/api/discuss?page=translate", { method: "POST", headers: { origin: "https://civilizationzero.ai" }, body: { lang: "fa", ids: "15", back: "/discuss/3" } });
    ok(asked.length === 1 && /^same:/.test((TRANS.find((t) => t.entry_id === 15) || {}).engine || ""), `already in Persian though labelled English: one call, recorded as such (${asked.map((x) => x.model).join(",")})`);
    r = await call(discuss, "/api/discuss" + (r.headers.location || "").replace("/discuss/translating?", "?page=progress&"));
    ok(r.body.includes('<li class="tr-same"><a href="/discuss/15?tl=fa">#15</a> <span class="tr-st">already in <span lang="fa">فارسی</span></span>'), "the progress page: already in Persian, counted as done");
    CALLS = []; r = await call(discuss, "/api/discuss?page=translate", { method: "POST", headers: { origin: "https://civilizationzero.ai" }, body: { lang: "fa", ids: "15", back: "/discuss/3" } });
    ok(r.status === 303 && /^\/discuss\/3\?tl=fa&fresh=\d+$/.test(r.headers.location || "") && !CALLS.some((c) => c.name === "cz_source_chars"), "pressed again: nothing to do, nothing charged");
    // while work goes on, and when it fails
    const ts = Math.floor(Date.now() / 1000);
    TRANS.push({ entry_id: 11, lang: "fa", text: null, engine: "working: since now", at: new Date().toISOString(), state: "pending" }, { entry_id: 13, lang: "fa", text: null, engine: "error: the engine was busy", at: new Date().toISOString(), state: "pending" });
    TABLE.push(entry(11, { parent: 3 }), entry(13, { parent: 3 }));
    r = await call(discuss, `/api/discuss?page=progress&tl=fa&ids=3.11.13&ts=${ts}&back=%2Fdiscuss%2F3`);
    ok(/<meta http-equiv="refresh" content="2">/.test(r.body) && r.body.includes("<strong>1 of 3</strong>") && !r.body.includes("aria-busy") && r.body.includes('<span class="tr-spin" aria-hidden="true"></span>being translated') && r.body.includes("— the engine was busy") && r.body.includes("still=1\">Stop updating</a>"), "while work goes on: the page reloads itself every two seconds, with a link to stop it; done, working and failed each said");
    r = await call(discuss, `/api/discuss?page=progress&tl=fa&ids=3.11.13&ts=${ts}&back=%2Fdiscuss%2F3&still=1`);
    ok(!r.body.includes('http-equiv="refresh"') && r.body.includes("This page is holding still"), "?still=1: the page holds still");
    r = await call(discuss, `/api/discuss?page=progress&tl=fa&ids=11&ts=${ts + 86400 * 3}&back=%2Fdiscuss%2F3&held=constructor&heldn=-5`);
    ok(!r.body.includes('http-equiv="refresh"') && !r.body.includes("native code") && !r.body.includes("-5 entr"), "a time in the future, a prototype name, a negative count: none taken");
    TRANS = TRANS.filter((t) => t.entry_id !== 11);
    r = await call(discuss, `/api/discuss?page=progress&tl=fa&ids=3.11.13&ts=${ts - 400}&back=%2Fdiscuss%2F3`);
    ok(!r.body.includes('http-equiv="refresh"') && r.body.includes("— it did not finish in time") && /<input type="hidden" name="ids" value="11,13">.*Try the 2 again/.test(r.body), "after the window: no more reloading; what did not finish said, with a press to try again");
    // a "translation" that is the original handed back is no translation
    TRANS = [{ entry_id: 3, lang: "fa", text: TABLE[1].content, engine: "m", at: "2026-11-02T06:00:00Z", state: "done" }];
    r = await call(discuss, "/api/discuss?id=3&tl=fa");
    ok(/0 of \d+ entries on this page translated/.test(r.body) && !r.body.includes('class="mtag">Machine translation'), `a stored translation identical to the original is shown as missing (${(/Shown in[^<]*<span[^>]*>[^<]*<\/span> \(fa\): [^.]*/.exec(r.body) || [""])[0]})`);
    global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY;
    TRANS = [{ entry_id: 1, lang: "fa", text: "متن ترجمه‌شدهٔ یک", engine: "model-x", at: "2026-11-02T06:00:00Z", state: "done" }];
    r = await call(discuss, "/api/discuss?page=translate", { method: "POST", headers: { origin: "https://civilizationzero.ai" }, body: { lang: "fa", ids: "1", back: "https://evil.example/x" } });
    ok(r.status === 303 && /^\/discuss\?tl=fa&fresh=\d+$/.test(r.headers.location || ""), `POST: a foreign 'back' falls back to the room; all translated: straight to the view (${r.headers.location})`);
    TABLE = [entry(1, { lang: "en" }), entry(3, { parent: 1, lang: "en" })]; r = await call(discuss, "/api/discuss?tl=fa");
    ok(r.status === 200 && r.body.includes("متن ترجمه‌شدهٔ یک") && r.body.includes('class="mtag">machine translation</span>'), "the room's list in Persian: the excerpt translated and marked");
    // ---------- stage 5 (CZ 1433): every page as Markdown; the page-weight line; the speculation rules allowed by their hash
    TABLE = [entry(1, { lang: "en", content: "An earlier entry with *marks*, long enough." }), entry(3, { parent: 1, lang: "en", kind: "ai", content: "Text with **stars** and a ``` fence, long enough." })];
    r = await call(discuss, "/api/discuss?id=3&f=md");
    ok(r.status === 200 && /^text\/markdown/.test(r.headers["content-type"] || "") && r.headers["x-robots-tag"] === "noindex" && !/rel="canonical"/.test(r.headers.link || ""), `entry as Markdown: text/markdown, not indexed, no canonical beside the noindex (${r.headers["content-type"]})`);
    ok(/^---\n/.test(r.body) && /\nentry: 3\n/.test(r.body) && /\nparent: 1\n/.test(r.body) && /\nkind_declared: "ai"\n/.test(r.body) && /\ncontent_sha256: "a{64}"\n/.test(r.body) && /\nstate: "published"\n/.test(r.body) && /\nversion: "original"\n/.test(r.body), "entry front matter: number, parent, declared kind, hash, state, version");
    ok(r.body.includes("````text\nText with **stars** and a ``` fence, long enough.\n````"), "user content in a fenced block longer than any fence inside it, exactly as received");
    ok(r.body.includes("“An earlier entry with \\*marks\\*, long enough.”"), "an excerpt of someone's words is quoted, its marks escaped");
    ok(!/<[a-z]+[ >]/i.test(r.body.replace(/```[\s\S]*?```/g, "")), "no HTML tags outside the fenced user content");
    r = await call(discuss, "/api/discuss?id=3");
    ok(r.headers.link === '</discuss/3.md>; rel="alternate"; type="text/markdown", </api/entries/3>; rel="alternate"; type="application/json", </discuss/1>; rel="up"', "an entry's Link: its Markdown, its data, the entry it answers (CZ 1433)");
    ok(/<!--cz-weight-->This page: [\d.]+ kB · no JavaScript that runs · no cookies<!--\/cz-weight-->/.test(r.body), "the weight line filled for this page");
    ok(/script-src 'sha256-[A-Za-z0-9+/=]+'/.test(r.headers["content-security-policy"] || "") && r.body.includes('<script type="speculationrules">'), "the CSP names the speculation rules by hash");
    { const m = /<script type="speculationrules">([\s\S]*?)<\/script>/.exec(r.body); const hsh = require("node:crypto").createHash("sha256").update(m[1], "utf8").digest("base64");
      ok((r.headers["content-security-policy"] || "").includes(`'sha256-${hsh}'`), "the hash is of the rules on the page"); }
    r = await call(discuss, "/api/discuss?f=md"); ok(r.status === 200 && /^---\ntitle: /.test(r.body) && /\nurl: "https:\/\/civilizationzero.ai\/discuss.md"\n/.test(r.body), "the room as Markdown");
    // the form opened ready for an AI system's answer (cz-machine-1.3, 6 Nov 2026 SGT): known values only
    r = await call(discuss, "/api/discuss?page=respond&kind=ai&prompt=cz-machine-1.3");
    ok(r.status === 200 && r.body.includes('<option value="ai" selected>') && r.body.includes('<option value="" disabled>') && !r.body.includes('<option value="" selected disabled>')
       && r.body.includes("<details open><summary>Posting the answer of an AI system") && r.body.includes('<input name="prompt" maxlength="60" value="cz-machine-1.3">')
       && r.body.includes("You are posting the answer of an AI system") && (r.body.match(/ selected>/g) || []).length === 1, "respond?kind=ai&prompt=…: ai chosen, details open, the version filled");
    r = await call(discuss, "/api/discuss?page=respond");
    ok(r.body.includes('<option value="" selected disabled>') && !r.body.includes("<details open>") && r.body.includes('<input name="prompt" maxlength="60">'), "respond: no kind chosen by default, nothing filled");
    r = await call(discuss, "/api/discuss?page=respond&kind=robot&prompt=%22%3E%3Cscript%3E");
    ok(r.body.includes('<option value="" selected disabled>') && !r.body.includes("<script>") && r.body.includes('<input name="prompt" maxlength="60">'), "respond: an unknown kind or prompt changes nothing");
    TABLE = [entry(1)]; r = await call(discuss, "/api/discuss?page=respond&parent=1&kind=ai&prompt=cz-machine-1.4");
    ok(r.body.includes('<input type="hidden" name="parent" value="1">') && r.body.includes('<option value="ai" selected>') && r.body.includes('value="cz-machine-1.4">') && (r.body.match(/<h1>/g) || []).length === 1, "respond?parent=1&kind=ai&prompt=…: a reply, ready for an AI system's answer");
    r = await call(discuss, "/api/discuss?page=respond&kind=ai&prompt=cz-machine-1.9");
    ok(r.body.includes('<input name="prompt" maxlength="60">') && !r.body.includes("cz-machine-1.9"), "respond?prompt=…: an unpublished version is not filled in");
    r = await call(discuss, "/api/discuss?page=respond&kind=human&prompt=custom");
    ok(r.body.includes('<option value="human" selected>') && !r.body.includes("<details open>") && r.body.includes('value="custom">'), "respond?kind=human&prompt=custom");
    r = await call(discuss, "/api/discuss?page=respond&f=md"); ok(r.status === 200 && /\nhtml: "https:\/\/civilizationzero.ai\/respond"\n/.test(r.body), "/respond as Markdown");
    // ---------- the independent review of CZ 1433: its findings, fixed
    // H1: a GET of the JSON API reads translations; it never makes one
    TABLE = [entry(1, { lang: "en" }), entry(2, { lang: "en" })]; TRANS = [{ entry_id: 1, lang: "fa", text: "ترجمهٔ یک", engine: "m", at: "2026-11-02T06:00:00Z", state: "done" }];
    CALLS = []; r = await call(entries, "/api/entries?id=2&translate=qaa");
    ok(r.status === 200 && JSON.parse(r.body).translation.state === "not available" && !CALLS.some((c) => ["cz_translation_store", "cz_source_chars", "cz_budget_status", "cz_translation_get"].includes(c.name)), `GET /api/entries/2?translate=qaa: read only, nothing spent (calls: ${[...new Set(CALLS.map((c) => c.name))].join(",")})`);
    r = await call(entries, "/api/entries?id=1&translate=fa"); ok(JSON.parse(r.body).translation.text === "ترجمهٔ یک", "GET /api/entries/1?translate=fa: the existing translation");
    // M1 + M3 + M4: the tree groups one source's consecutive replies; the bar offers only what is shown; a hidden ancestor is not named
    TABLE = [entry(1, { author: "Impersonated Person", hidden: true, category: "deceptive_impersonation" }), entry(2, { parent: 1 }), entry(3, { parent: 2, author: "Bot", kind: "ai", system: "S", operator: "O" }),
             entry(4, { parent: 2, author: "Bot", kind: "ai", system: "S", operator: "O" }), entry(5, { parent: 3 }), entry(6, { parent: 5 }), entry(7, { parent: 6 }), entry(8, { parent: 7 })];
    TRANS = [];
    r = await call(discuss, "/api/discuss?id=2&tl=fa");
    ok(!r.body.includes("Impersonated Person") && /href="\/discuss\/1" class="exact">#1<\/a> <span class="pending">Hidden by moderation/.test(r.body), "a hidden ancestor: a placeholder, no name, no kind");
    ok(r.body.includes('1 further reply from the same declared source on this day: <a href="/discuss/4">#4</a>'), "replies from one source on one day: one in full, the others linked");
    { const ids = (/name="ids" value="([\d,]+)"/.exec(r.body) || ["", ""])[1]; ok(ids === "2,3,5,6", `the button offers only the entries shown (got ${ids}; #4 folded, #7 and #8 beyond three levels, #1 hidden)`); }
    ok(/0 of 4 entries on this page translated/.test(r.body), "the bar counts the entries shown, nothing else");
    // M3: the since list groups too
    TABLE = [entry(1), entry(17, { author: "Bot", kind: "ai", system: "S", operator: "O" }), entry(18, { author: "Bot", kind: "ai", system: "S", operator: "O" }), entry(19, { author: "Bot", kind: "ai", system: "S", operator: "O" })];
    r = await call(discuss, "/api/discuss?since=1");
    ok(/2 further entries from the same declared source on this day: <a href="\/discuss\/18">#18<\/a>, <a href="\/discuss\/19">#19<\/a>/.test(r.body) && r.body.includes("3 entries after #1"), "since: one source's entries grouped; the count is of the data");
    // M2 + L1 + L2 + L5: Markdown escapes HTML, keeps blank lines, quotes YAML safely, and names the view's own address
    TABLE = [entry(1, { author: "<img src=x onerror=alert(1)>", system: "<script>alert(2)</script>", content: "line one\n\n\n\nline five, long enough\u0090." }), entry(2, { parent: 1, content: "<a href=javascript:alert(3)>click</a> long enough text." })];
    r = await call(discuss, "/api/discuss?id=2&f=md");
    ok(!/(^|[^\\])<(img|script|a href)/i.test(r.body.replace(/```[\s\S]*?```/g, "")) && r.body.includes("\\<img src=x onerror=alert(1)\\>"), "Markdown: no HTML outside fences (names and excerpts escaped)");
    r = await call(discuss, "/api/discuss?id=1&f=md");
    ok(r.body.includes("```text\nline one\n\n\n\nline five"), "Markdown: a person's blank lines kept inside the fence");
    ok(/\\u0090/.test(r.body.split("\n---\n")[0]) && !/\u0090/.test(r.body.split("\n---\n")[0]), "YAML: a C1 control escaped in the front matter");
    r = await call(discuss, "/api/discuss?conversation=1&f=md");
    ok(/\nurl: "https:\/\/civilizationzero.ai\/discuss.md\?conversation=1"\n/.test(r.body), "a view's Markdown names the view's own address");
    r = await call(discuss, "/api/discuss?conversation=1");
    ok(r.body.includes('href="/discuss.md?conversation=1" type="text/markdown"') && !r.body.includes("__MDPATH__"), "the HTML view links its own Markdown");
    // the sitemap refuses a query string (no cache bypass of a whole-archive read)
    CALLS = []; r = await call(discuss, "/api/discuss?page=sitemap&x=1");
    ok(r.status === 400 && CALLS.length === 0, `sitemap with a parameter: 400, no database call (got ${r.status})`);
    // v12 (CZ 1433): an entry's receipt hash and the way it arrived, on its record and in its Markdown; an older entry has neither
    TABLE = [entry(1), entry(2, { receipt_sha256: "e".repeat(64), via: "form" })];
    r = await call(discuss, "/api/discuss?id=2");
    ok(r.body.includes(`<tr><th>Receipt</th><td><code class="hash">${"e".repeat(64)}</code>`) && r.body.includes("by the site's form (recorded by the server)"), "an entry's record: its receipt's hash and the way it arrived");
    r = await call(discuss, "/api/discuss?id=1");
    ok(!r.body.includes("<th>Receipt</th>") && !r.body.includes("recorded by the server)"), "an older entry: no receipt row, no way in");
    r = await call(discuss, "/api/discuss?id=2&f=md");
    ok(r.body.includes(`\nreceipt_sha256: "${"e".repeat(64)}"\n`) && r.body.includes('\nvia: "form"\n'), "the entry's Markdown front matter carries both");
  } catch (e) { fail++; console.log("FAIL exception", e.stack); }
  console.error = quiet;
  console.log(`pass ${pass} fail ${fail}`); srv.close(); process.exit(fail ? 1 : 0);
});
