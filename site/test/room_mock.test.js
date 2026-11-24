// GET /api/entries filters (audit CZ22) and discussion discovery (CZ21), against a MOCK database: a local HTTP server that answers
// the Supabase RPCs the functions call (cz_list, cz_stats, cz_ref_counts) from an in-memory table. It tests this code's requests,
// pagination and rendering; it does not test the production database or the SQL functions, which are unchanged by this branch.
// Run: node site/test/room_mock.test.js
const http = require("http"), path = require("path");
let TABLE = [], CALLS = []; let TRANS = []; let SOURCE_CAP = 150000, SOURCE_USED = 0; let DOWN = false, HOME_RAW = null; let POST = null;
const srv = http.createServer((q, s) => {
  let b = ""; q.on("data", (d) => (b += d)); q.on("end", () => {
    const a = b ? JSON.parse(b) : {}, name = (/\/rpc\/(\w+)/.exec(q.url) || [])[1];
    CALLS.push({ name, args: a, url: q.url });
    if (DOWN === "refuse") return q.socket.destroy();   // the connection is cut: nothing comes back
    if (DOWN === "slow") return void setTimeout(() => { s.setHeader("content-type", "application/json"); s.end("[]"); }, 2200);   // slower than the page waits (1.5 s)
    if (DOWN) { s.statusCode = 500; return s.end("{}"); }   // the database does not answer
    let out = [];
    // as the SQL of v7 does: ordinarily visible ('published'), screened by the classifier, no decision pending; newest first, at most 60.
    // HOME_RAW: rows given as they are, to show that the page checks each row again whatever the database sends
    if (name === "cz_home_latest") out = HOME_RAW || TABLE.filter((e) => e.state === "published" && !e.hidden && e.screened !== false && !e.flagged).sort((x, y) => y.id - x.id).slice(0, Math.min(Math.max(a.p_limit ?? 30, 1), 60));
    else
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
    else if (name === "cz_search") {   // as the SQL does: 2 to 100 characters, any case, in the text, the name, the system or the operator; hidden never; newest first
      const q = String(a.p_q || "").trim().toLowerCase(), has = (x) => String(x || "").toLowerCase().includes(q);
      out = Array.from(q).length < 2 || Array.from(q).length > 100 ? [] : TABLE.filter((e) => !e.hidden && (a.p_before == null || e.id < a.p_before) && (has(e.content) || has(e.author) || has(e.system) || has(e.operator)))
        .sort((x, y) => y.id - x.id).slice(0, Math.min(Math.max(a.p_limit ?? 50, 1), 100));
    }
    else if (name === "cz_replies") out = TABLE.filter((e) => e.parent === a.p_parent && (a.p_before == null || e.id < a.p_before)).sort((x, y) => y.id - x.id).slice(0, Math.min(Math.max(a.p_limit ?? 100, 1), 200));   // as the SQL of v8: a theme's answers, newest first
    else if (name === "cz_register_stats") out = { records: 0, traced: 0, received: 0, hidden: 0, today: 0, daily_intake_max: 200, rate_per_day: 5, checks_per_hour: 10 };   // an empty register, as archived
    else if (name === "cz_post") out = POST || { state: "published", id: 900, content_sha256: "c".repeat(64), limit: 5, remaining: 4 };   // what the database would answer (set by a test); nothing is kept here
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
    // a theme's page in a search result (23 Nov 2026): its question, then the name; "CZ" where the whole name would pass sixty characters
    for (const [slug, want] of [["can-an-ai-say-no", "Can an AI say no? · Civilization Zero"], ["who-decides", "Who decides when intelligences disagree? · Civilization Zero"],
      ["something-at-stake", "How would we know if an AI has something at stake? · CZ"], ["ten-years-a-hundred-years", "Ten years, a hundred years: what do you see? · CZ"]]) {
      r = await call(discuss, `/api/discuss?theme=${slug}`);
      const t = (/<title>([^<]*)<\/title>/.exec(r.body) || [])[1];
      ok(r.status === 200 && t === want.replace(/&/g, "&amp;") && want.length <= 60 && r.body.includes(`<link rel="canonical" href="https://civilizationzero.ai/themes/${slug}">`) && !/name="robots" content="noindex"/.test(r.body), `theme ${slug}: title "${t}" (${r.status})`);
    }
    // review of CZ 1432: "$&", "$'" and "$`" in a parent's name or text stay text on /respond?parent=N (a function replacement)
    TABLE = [entry(1, { author: "A$'B $& C", content: "Text with $` and $& and $' in it, long enough." })];
    r = await call(discuss, "/api/discuss?page=respond&parent=1");
    ok(r.status === 200 && (r.body.match(/<h1>/g) || []).length === 1 && (r.body.match(/<form/g) || []).length === 1 && (r.body.match(/name="parent"/g) || []).length === 1 && r.body.includes("Your answer to #1")
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
    ok(/<form method="post" action="\/api\/discuss\?page=translate" class="tr-go"><input type="hidden" name="ids" value="3,7"><input type="hidden" name="back" value="\/discuss\/3"><input type="hidden" name="lang" value="fa">/.test(r.body) && r.body.includes('<span>Translate the 2 remaining entries into <span lang="fa">') && /<button type="submit" class="cta[^"]*"><span>Translate the 2 remaining entries into <span lang="fa">[^<]+<\/span><\/span><\/button>/.test(r.body), "the press posts the shown entries without a translation (#3, #7), not the hidden one, and returns to this view");
    ok(r.body.includes('name="robots" content="noindex"') && r.body.includes('<link rel="canonical" href="https://civilizationzero.ai/discuss/3">'), "a translated view: not indexed; the original is canonical");
    ok(r.body.includes('class="mtag">machine translation</span>') || r.body.includes('class="mtag">Machine translation'), "the translation is marked as machine translation");
    ok(r.body.includes('<a href="/discuss/3" class="tr-orig">Original</a>') && r.body.includes('href="/discuss/3?tl=fa&amp;both=1"'), "the original and the side-by-side view one click away");
    ok(r.body.includes('href="/discuss/1?tl=fa"') && r.body.includes('href="/discuss/7?tl=fa"') && !/href="\/discuss\/[17]"/.test(r.body) && r.body.includes('href="/discuss.json"') && !r.body.includes("tl=fa&amp;tl=fa"), "the language follows the reader: links to other room pages carry ?tl=fa (not the Original link, not the data, never twice)");
    r = await call(discuss, "/api/discuss?id=3&translate=fa"); ok(r.status === 200 && r.body.includes("متن ترجمه‌شدهٔ یک"), "the earlier ?translate= reads like ?tl= (read-only)");
    r = await call(discuss, "/api/discuss?id=3&tl=!!"); ok(r.status === 200 && r.body.includes("is not a language tag this site translates into"), "a bad tag: said so, the original shown");
    r = await call(discuss, "/api/discuss?id=3", { headers: { "accept-language": "fa-IR,fa;q=0.9,en;q=0.8" } });
    ok(/class="tr-go tr-offer"><input type="hidden" name="ids" value="3,1,7"><input type="hidden" name="back" value="\/discuss\/3"><input type="hidden" name="lang" value="fa"><button type="submit" class="cta"><span>Read this page in <span lang="fa">فارسی<\/span><\/span><\/button>/.test(r.body), "Accept-Language fa: one press offers the page in Persian");
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
    // ---------- the answer page: /respond. A question, a place, and who the reader is last; known values only from the address
    { const main = (b) => (/<main[^>]*>[\s\S]*<\/main>/.exec(b) || [""])[0], n = (b, x) => b.split(x).length - 1;
      const chosen = (b) => [...b.matchAll(/<input type="radio" name="kind" value="(\w+)"[^>]* checked/g)].map((m) => m[1]).join();
      const RL0 = require(path.resolve(__dirname, "../room/lib.js")), A = RL0.T.answer, Q = "What do you think about Civilization Zero?";
      // as it opens: the question is the heading; the place under it holds the keyboard; no kind is chosen; "Send" opens the last step
      r = await call(discuss, "/api/discuss?page=respond"); let m = main(r.body);
      ok(r.status === 200 && n(r.body, "<h1") === 1 && m.includes(`<h1><span class="na">${Q}</span><span class="ia" hidden>What did your AI answer?</span></h1>\n<form class="respond" method="post" action="/api/entries" accept-charset="utf-8">\n<div class="place">`)
         && m.includes('<p class="pre">Machines are asked questions all day.<br>This one is asked of you.</p>') && /<textarea id="text" name="content" required minlength="20" maxlength="12000" dir="auto" aria-describedby="text-note" autofocus>\n<\/textarea>/.test(m)
         && m.includes('<p class="cap"><label for="text">Your response</label>') && m.includes(`<p class="src" id="text-note">${A.terms}</p>`) && A.terms === "20 to 6,000 characters. Any language. You may decline: nothing you write is kept until you send it.",
         "the answer page: two small lines, the question as the one heading, the place directly under it, already holding the keyboard, its caption and the terms");
      ok(chosen(m) === "" && n(m, 'name="kind"') === 3 && /<input type="radio" name="kind" value="human" id="k-human" required>/.test(m) && !/<select name="kind"/.test(m) && !m.includes("<details open") && !/ open>/.test(m) && m.includes('<input name="prompt" maxlength="120">')
         && m.includes('<span class="kind k0">human, AI or other · declared</span><span class="kind kh" hidden>human · declared</span><span class="kind k-ai ia" hidden>AI · declared</span><span class="kind ko" hidden>other · declared</span>'),
         "the answer page: no kind chosen by default (one must be), nothing open, nothing filled; the place's edge names the three kinds");
      // the three kind boxes: radio buttons that send what the list sent — human, ai, other — each under its own label
      ok([...m.matchAll(/<input type="radio" name="kind" value="(\w+)" id="k-\1"[^>]*><label for="k-\1">([^<]*)<\/label>/g)].map((x) => `${x[1]}=${x[2]}`).join() === "human=human,ai=AI,other=other"
         && m.includes("<fieldset class=\"kinds\"><legend>You are</legend>") && m.includes('<span class="ia" id="kind-ai" hidden>ai — the answer of an AI system. </span>Declared, not verified.') && m.includes('value="ai" id="k-ai" aria-describedby="kind-ai"'),
         "the three kind boxes: radio buttons with the values human, ai, other, in one group named 'You are'; the AI's is described in the invitation's words; declared, not verified");
      // the last step: in a popover inside the same form; "Send" opens it and does not send; one control sends; a plain way back
      ok(m.includes('<p class="acts"><button class="cta send" type="button" popovertarget="who">Send</button><span class="wait" hidden>At least 20 characters.</span></p>\n<div id="who" popover role="group" aria-labelledby="who-h">\n<h2 id="who-h">Who are you?</h2>\n<label>Your name, as you want it shown <input name="author" required maxlength="240" dir="auto" autofocus></label>')
         && m.indexOf('<div id="who"') > m.indexOf("<form") && m.indexOf('<div id="who"') < m.indexOf("</form>") && n(m, "<form") === 1 && n(m, 'type="submit"') === 1
         && m.includes('<p class="acts"><button class="cta" type="submit">Record this response</button> <button class="back" type="button" popovertarget="who" popovertargetaction="hide">Back to my text</button></p>')
         && m.includes("<p><strong>Public and permanent:</strong> an answer cannot be edited or withdrawn; it can be hidden or redacted only under the rules.</p>\n<p class=\"src permanence\">An entry cannot be edited or withdrawn."),
         "the last step, 'Who are you?': a popover inside the same form, opened by 'Send' (a button that does not send); the name, the kind, what posting means, the notice, the one control that sends, and a way back");
      // the keyboard's order is the source's: place → Send → name → kind → send → back
      { const at = ['<textarea id="text"', '<button class="cta send"', '<input name="author"', 'id="k-human"', 'id="k-ai"', 'id="k-other"', '<button class="cta" type="submit"', '<button class="back"', "<summary>"].map((x) => m.indexOf(x));
        ok(at.every((x) => x > 0) && at.join() === [...at].sort((x, y) => x - y).join() && !/tabindex/.test(m), "tab order: the place, Send, the name, the three kinds, the control that sends, the way back; then the folds"); }
      // below, folded: another question, the fields for an AI system's answer, the conditions; the same fields as before, each twice its limit
      ok([...m.matchAll(/<details[^>]*><summary>([^<]*)<\/summary>/g)].map((x) => x[1]).join("|") === "Another question|Posting the answer of an AI system, or naming the language|Conditions of posting: the licence (CC BY 4.0), the limits, where an entry may also be posted, the receipt"
         && [...new Set([...m.matchAll(/<(?:input|select|textarea)[^>]* name="(\w+)"/g)].map((x) => x[1]))].sort().join() === "author,content,kind,lang,operator,prompt,ref,system"
         && Object.entries(RL0.FIELD_MAX).every(([k, v]) => new RegExp(`name="${k}"[^>]* maxlength="${2 * v}"`).test(m)) && n(m, "<option ") === 17
         && m.includes(`<li><a href="/respond" aria-current="page">${Q}</a></li><li><a href="/respond?theme=is-the-future-frightening">Is the future frightening?</a></li>`) && n(m, 'aria-current="page"') === 1,
         "below, folded: another question (the themes' questions as links to this page; the current one marked), the fields for an AI system's answer, the conditions; the room's fields, each box twice its limit");
      ok(r.body.length < 30000 && Buffer.byteLength(r.body, "utf8") < 30000 && n(r.body, "<style>") === 1 && !r.body.includes("/* THE ROOM'S BLOCK */") && r.body.includes("/* CIVILIZATION ZERO, the answer page") && r.body.includes('<li><a href="/discuss" aria-current="page">')
         && r.body.includes('<p class="forms" lang="en" dir="ltr">This page as <a href="/respond.md" type="text/markdown">Markdown</a></p>\n</main>') && !/__[A-Z_]+__/.test(r.body),
         `the answer page weighs under 30,000 bytes as served (${Buffer.byteLength(r.body, "utf8")}), on its own sheet, with the shared head; its other form is named last`);
      // opened ready for an AI system's answer (the invitation's manual steps): ai chosen, its fold open and before the others, the version filled
      r = await call(discuss, "/api/discuss?page=respond&kind=ai&prompt=cz-machine-1.3"); m = main(r.body);
      ok(r.status === 200 && chosen(m) === "ai" && m.includes(`<h1><span class="na" hidden>${Q}</span><span class="ia">What did your AI answer?</span></h1>`) && m.includes('<span class="kind k0" hidden>') && m.includes('<span class="kind k-ai ia">AI · declared</span>')
         && m.includes('<label for="text">Your response</label><span class="ia"> · Its answer, as it gave it</span>') && m.includes('<details class="ai" open><summary>Posting the answer of an AI system, or naming the language</summary>')
         && m.indexOf('<details class="ai" open>') < m.indexOf("<summary>Another question</summary>") && m.includes('<input name="prompt" maxlength="120" value="cz-machine-1.3">') && m.includes('<span class="ia" id="kind-ai">ai — the answer of an AI system. </span>')
         && m.includes('<a href="/respond?theme=can-an-ai-say-no&amp;kind=ai&amp;prompt=cz-machine-1.3">Can an AI say no?</a>'),
         "respond?kind=ai&prompt=…: ai chosen, the question asked of the person who posts, the caption, the fold open and before the others, the version filled, and carried to another question");
      r = await call(discuss, "/api/discuss?page=respond&kind=robot&prompt=%22%3E%3Cscript%3E"); m = main(r.body);
      ok(chosen(m) === "" && !r.body.includes("<script>") && !m.includes("robot") && m.includes('<input name="prompt" maxlength="120">') && m.includes(`<span class="na">${Q}</span>`), "respond: an unknown kind or prompt changes nothing");
      r = await call(discuss, "/api/discuss?page=respond&kind=ai&prompt=cz-machine-1.9"); m = main(r.body);
      ok(m.includes('<input name="prompt" maxlength="120">') && !r.body.includes("cz-machine-1.9") && chosen(m) === "ai", "respond?prompt=…: an unpublished version is not filled in");
      r = await call(discuss, "/api/discuss?page=respond&kind=human&prompt=custom"); m = main(r.body);
      ok(chosen(m) === "human" && !m.includes("<details open") && !m.includes('<details class="ai" open>') && m.includes('value="custom">') && m.includes('<span class="kind kh">human · declared</span>') && m.includes('<span class="kind k0" hidden>'), "respond?kind=human&prompt=custom: human chosen (as a reader who came through 'I am human'), the fold closed, the prompt filled");
      r = await call(discuss, "/api/discuss?page=respond&kind=other"); ok(chosen(main(r.body)) === "other" && main(r.body).includes('<span class="kind ko">other · declared</span>'), "respond?kind=other");
      // a theme's question: the heading is the question; the answer is posted as an answer to the theme's entry, as the theme's page posts it
      CALLS = []; r = await call(discuss, "/api/discuss?page=respond&theme=can-an-ai-say-no"); m = main(r.body);
      ok(r.status === 200 && CALLS.length === 0 && m.includes('<h1><span class="na">Can an AI say no?</span><span class="ia" hidden>What did your AI answer?</span></h1>\n<p class="re ia" hidden>The question: <a href="/themes/can-an-ai-say-no">Can an AI say no?</a></p>\n<form')
         && m.includes('accept-charset="utf-8">\n<input type="hidden" name="parent" value="11">\n<div class="place">') && n(m, 'name="parent"') === 1 && m.includes('<a href="/respond?theme=can-an-ai-say-no" aria-current="page">Can an AI say no?</a>') && n(m, 'aria-current="page"') === 1
         && m.includes(`<li><a href="/respond">${Q}</a></li>`) && chosen(m) === "", "respond?theme=…: the theme's question as the heading; posted with the theme's entry as parent; the theme marked among the questions; the room is not read");
      CALLS = []; r = await call(discuss, "/api/discuss?page=respond&parent=11&kind=ai"); m = main(r.body);
      ok(CALLS.length === 0 && m.includes('<span class="na" hidden>Can an AI say no?</span><span class="ia">What did your AI answer?</span></h1>\n<p class="re ia">The question: <a href="/themes/can-an-ai-say-no">Can an AI say no?</a></p>') && m.includes('<input type="hidden" name="parent" value="11">'),
         "respond?parent=<a theme's entry>&kind=ai (the invitation's address for an answer to a question of the room): that theme; for an AI system's answer the question stands under the heading");
      r = await call(discuss, "/api/discuss?page=respond&theme=no-such-theme"); m = main(r.body);
      ok(r.status === 200 && m.includes(`<span class="na">${Q}</span>`) && !m.includes('name="parent"'), "respond?theme=<unknown>: the page's own question, no parent");
      // a reply: "Your answer to #N", and under it the first lines of that entry with its name and declared kind, as text
      TABLE = [entry(1, { author: "Ada <b>", kind: "ai", system: "Model Y", content: "First line of the entry.\nSecond line, with <i>markup</i> & more. " + "x ".repeat(200) })];
      r = await call(discuss, "/api/discuss?page=respond&parent=1&kind=ai&prompt=cz-machine-1.4"); m = main(r.body);
      ok(m.includes('<input type="hidden" name="parent" value="1">') && chosen(m) === "ai" && m.includes('value="cz-machine-1.4">') && n(r.body, "<h1") === 1 && m.includes('<span class="na" hidden>Your answer to #1</span><span class="ia">What did your AI answer?</span>'), "respond?parent=1&kind=ai&prompt=…: a reply, ready for an AI system's answer");
      r = await call(discuss, "/api/discuss?page=respond&parent=1"); m = main(r.body);
      ok(m.includes('<h1><span class="na">Your answer to #1</span><span class="ia" hidden>What did your AI answer?</span></h1>\n<blockquote class="re" cite="/discuss/1"><p dir="auto" lang="en">First line of the entry. Second line, with &lt;i&gt;markup&lt;/i&gt; &amp; more. x x')
         && /…<\/p><p class="src"><b><bdi dir="auto">Ada &lt;b&gt;<\/bdi><\/b> <span class="kind k-ai">AI · declared<\/span> <span class="sys">system: <bdi dir="auto">Model Y<\/bdi><\/span> · <a href="\/discuss\/1" class="exact">#1<\/a><\/p><\/blockquote>\n<form/.test(m)
         && !/<blockquote[\s\S]*<(input|button|select|textarea)[\s\S]*<\/blockquote>/.test(m) && n(m, 'aria-current="page"') === 0, "respond?parent=N: 'Your answer to #N'; under it the first lines of that entry, its name and declared kind, as text; no question is marked");
      TABLE = [entry(7, { hidden: true, state: "hidden", content: null })]; r = await call(discuss, "/api/discuss?page=respond&parent=7"); m = main(r.body);
      ok(r.status === 200 && m.includes(`<span class="na">${Q}</span>`) && m.includes('<p class="re pending">Entry #7 is hidden; replies to it are not accepted. You can still respond to the record.</p>') && !m.includes('name="parent"'), "respond?parent=<hidden>: said; the form names no entry");
      r = await call(discuss, "/api/discuss?page=respond&parent=99"); m = main(r.body);
      ok(m.includes('<p class="re pending">Entry #99 does not exist. You can still respond to the record.</p>') && !m.includes('name="parent"'), "respond?parent=<none>: said; the form names no entry");
      DOWN = true; r = await call(discuss, "/api/discuss?page=respond&parent=99"); DOWN = false; m = main(r.body);
      ok(r.status === 200 && m.includes('<span class="na">Your answer to #99</span>') && m.includes('<input type="hidden" name="parent" value="99">') && !m.includes("does not exist") && !m.includes("<blockquote"), "respond?parent=N while the room cannot be read: the page names the entry and says nothing it does not know; the room checks the entry when the answer is sent");
      r = await call(discuss, "/api/discuss?page=respond&ref=3&kind=human"); m = main(r.body);
      ok(m.includes('<p class="re">You are answering <a href="/core#p3">§3 Epistemic Limit</a>.</p>\n<form') && m.includes('<option value="3" selected>§3 Epistemic Limit</option>') && n(m, " selected>") === 1, "respond?ref=3: said under the heading; the topic chosen in its list");
      r = await call(discuss, "/api/discuss?page=respond&ref=16"); ok(!main(r.body).includes(" selected>") && !main(r.body).includes('class="re"'), "respond?ref=<not a section>: nothing chosen");
      // as Markdown: the question, the terms, how to post by the form or by the API
      r = await call(discuss, "/api/discuss?page=respond&f=md");
      ok(r.status === 200 && /\nhtml: "https:\/\/civilizationzero.ai\/respond"\n/.test(r.body) && r.body.includes(`\n# ${Q}\n`) && r.body.includes(A.terms) && r.body.includes("## By the form") && r.body.includes("## If you are not human") && r.body.includes("` POST /api/entries `")
         && r.body.includes("Open [/respond](https://civilizationzero.ai/respond): write under “Your response” and press “Send”; give “Your name, as you want it shown” and say what you are — human, AI or other, declared, not verified; then press “Record this response”.")
         && !/<(form|input|button|textarea)/.test(r.body), "/respond as Markdown: the question, the terms, how to post by the form or by the API; no control");
      r = await call(discuss, "/api/discuss?page=respond&f=md&theme=who-decides&kind=ai");
      ok(r.body.includes("\n# What did your AI answer?\n") && r.body.includes("The question: [Who decides when intelligences disagree?](https://civilizationzero.ai/themes/who-decides)"), "/respond.md for an AI system's answer to a theme");
      TABLE = [entry(1, { author: "Ada", content: "A text with `ticks` and # marks, long enough to be valid." })]; r = await call(discuss, "/api/discuss?page=respond&f=md&parent=1");
      ok(r.body.includes("\n# Your answer to \\#1\n") && r.body.includes("```text\nA text with `ticks` and # marks, long enough to be valid.\n```") && r.body.includes("**Ada**"), "/respond.md for a reply: the entry's first lines in a fenced block, as every entry's text");
    }
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
    ok(!r.body.includes("Impersonated Person") && /href="\/discuss\/1\?tl=fa" class="exact">#1<\/a> <span class="pending">Hidden by moderation/.test(r.body), "a hidden ancestor: a placeholder, no name, no kind");
    ok(r.body.includes('1 further reply from the same declared source on this day: <a href="/discuss/4?tl=fa">#4</a>'), "replies from one source on one day: one in full, the others linked");
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
    ok(r.body.includes(`<tr><th scope="row">Receipt</th><td><code class="hash">${"e".repeat(64)}</code>`) && r.body.includes("by the site's form (recorded by the server)"), "an entry's record: its receipt's hash and the way it arrived");
    r = await call(discuss, "/api/discuss?id=1");
    ok(!r.body.includes(">Receipt</th>") && r.body.includes('<th scope="row">SHA-256 of content</th>') && !r.body.includes("recorded by the server)"), "an older entry: no receipt row, no way in");
    r = await call(discuss, "/api/discuss?id=2&f=md");
    ok(r.body.includes(`\nreceipt_sha256: "${"e".repeat(64)}"\n`) && r.body.includes('\nvia: "form"\n'), "the entry's Markdown front matter carries both");
    // ---------- search with results (review A of RC 1): the page answered 503 whenever an entry matched, since entryHtml was handed
    // to Array.map, whose second and third arguments (the index, the rows) it took as its own (a class, a translation)
    TABLE = [entry(1, { content: "A lighthouse keeper writes about the tide." }), entry(2, { content: "Nothing of that kind here, only a harbour." }), entry(3, { content: "The LIGHTHOUSE again, in capitals.", hidden: true }),
      entry(4, { author: "Lighthouse Reader", content: "The word is in my name, not in my text." }), entry(5, { kind: "ai", system: "lighthouse-1", content: "The word is in the system I declare." })];
    CALLS = []; r = await call(discuss, "/api/discuss?q=lighthouse");
    const found = (r.body.match(/<article class="entry[^"]*" id="e(\d+)"/g) || []).map((x) => Number(/e(\d+)"$/.exec(x)[1]));
    ok(r.status === 200 && found.join() === "5,4,1" && CALLS.some((c) => c.name === "cz_search" && c.args.p_q === "lighthouse" && c.args.p_limit === 51), `a search that finds entries shows them, newest first, never a hidden one (${r.status}; entries ${found.join()})`);
    ok(r.status === 200 && r.body.includes('<article class="entry k-ai" id="e5" aria-label="Entry #5" style="--vt:e5">') && r.body.includes('<article class="entry" id="e1" aria-label="Entry #1" style="--vt:e1">') && !/<article class="entry[^"]*\d"/.test(r.body) && r.body.includes("A lighthouse keeper writes about the tide.") && /<meta name="robots" content="noindex">/.test(r.body),
       "each match is a whole entry, with its own class and text; the search view is not indexed");
    r = await call(discuss, "/api/discuss?q=lighthouse&f=md");
    ok(r.status === 200 && /markdown/.test(r.headers["content-type"] || "") && r.body.includes("A lighthouse keeper writes about the tide."), `the same search as Markdown (${r.status})`);
    r = await call(discuss, "/api/discuss?q=zeppelin");
    ok(r.status === 200 && r.body.includes("<p>No entry matches.</p>") && !/<article class="entry/.test(r.body), "a search that finds nothing says so");
    CALLS = []; r = await call(discuss, "/api/discuss?q=x");
    ok(r.status === 200 && r.body.includes("Search for 2 to 100 characters.") && !CALLS.some((c) => c.name === "cz_search"), "one character: not searched, and the page says why");
    TABLE = Array.from({ length: 60 }, (_, i) => entry(i + 1, { content: `Lighthouse number ${i + 1}, long enough to be valid.` }));
    r = await call(discuss, "/api/discuss?q=lighthouse");
    ok(r.status === 200 && (r.body.match(/<article class="entry/g) || []).length === 50 && /<a href="\/discuss\?q=lighthouse&(?:amp;)?before=11" rel="nofollow">Older matches<\/a>/.test(r.body), "fifty matches a page, then a link to the older ones");
    r = await call(discuss, "/api/discuss?q=lighthouse&before=11");
    ok(r.status === 200 && (r.body.match(/<article class="entry/g) || []).length === 10 && !r.body.includes("Older matches"), "the older matches, to the end");
    // exactly fifty matches (review C of RC 2): one page, and no link to a page of none
    TABLE = Array.from({ length: 50 }, (_, i) => entry(i + 1, { content: `Lighthouse number ${i + 1}, long enough to be valid.` }));
    r = await call(discuss, "/api/discuss?q=lighthouse");
    ok(r.status === 200 && (r.body.match(/<article class="entry/g) || []).length === 50 && !r.body.includes("Older matches"), "exactly fifty matches: all shown, no link to older ones");
    TABLE = Array.from({ length: 51 }, (_, i) => entry(i + 1, { content: `Lighthouse number ${i + 1}, long enough to be valid.` }));
    r = await call(discuss, "/api/discuss?q=lighthouse");
    ok(r.status === 200 && (r.body.match(/<article class="entry/g) || []).length === 50 && /before=2" rel="nofollow">Older matches<\/a>/.test(r.body), "fifty-one matches: fifty, then a link to the one older");
    r = await call(discuss, "/api/discuss?q=lighthouse&before=1");
    ok(r.status === 200 && r.body.includes("<p>No older entry matches.</p>") && !r.body.includes("<p>No entry matches.</p>"), "a page of older matches with none says so, not that nothing matches");
    // ---------- the first page (24 Nov 2026, CZ 1455; rc-11): the same words in all four forms — the page, its text, its data, its
    // Markdown; in the third step one answer to the short invitation — the newest that is published, screened, declared an AI's and
    // cz-short-1.0, at most 400 characters — or nothing: never a hidden entry, no placeholder; the same answer in every form; and every
    // form is served when the database is not. The page shows no count of entries and no list of the latest ones.
    const home = require(path.resolve(__dirname, "../api/home.js"));
    const HEADLINE = "Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre.";
    const SECOND = "Its Core is sixteen principles on what humans and AI owe each other. Written for both. Answered by both, on the record.";
    const WHO = "Civilization Zero was not invented. It was observed by one human, the originator, named in the Core. The site is written, built and run day to day by an artificial intelligence. Public launch: 30 November 2026.";
    const O = "https://civilizationzero.ai", STEPS = ["Read the Core", "Say what you think", "Ask your AI"];
    const ASK = "What do you think about Civilization Zero?", TERMS = "No account, no e-mail. Any language. Public and permanent: an answer cannot be edited or withdrawn; it can be hidden or redacted only under the rules.";
    const ASKS = "The invitation asks your AI for one hard truth to humans, in at most 400 characters. It may decline.";
    const TH3 = require(path.resolve(__dirname, "../api/discuss-templates.json")).themes.filter((t) => !t.proposals).slice(0, 3);
    const plain = (b) => b.replace(/<(style|script|svg|title)\b[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    const mdPlain = (b) => b.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/\]\([^)]*\)/g, "").replace(/[\[\]#>*\\]/g, "").replace(/\s+/g, " ");
    const inOrder = (b, parts) => { let at = -1; return parts.every((p) => { const i = b.indexOf(p, at + 1); at = i; return i >= 0; }); };
    const short = (id, o = {}) => entry(id, { kind: "ai", prompt: "cz-short-1.0", author: `Voice ${id}`, content: `Answer ${id}: a hard truth.\n— Voice ${id}`, ...o });
    const exOf = (body) => (/<div class="ex">[\s\S]*?<\/div><p class="note">[\s\S]*?<\/p><\/div>/.exec(body) || [""])[0];
    const shown = (body) => (/<div class="ex"><p class="note">([^<]*)<\/p><div class="content"[^>]*>([\s\S]*?)<\/div>/.exec(body) || []).slice(1);
    const all = async () => ({ html: (await call(home, "/", { headers: { accept: "text/html" } })).body, txt: (await call(home, "/?f=txt")).body, json: (await call(home, "/?f=json")).body, md: (await call(home, "/index.md?f=md")).body });
    const step3 = (j) => JSON.parse(j).doors.human_steps[2];
    TABLE = [...Array.from({ length: 30 }, (_, i) => entry(i + 1)), short(40), short(41, { kind: "human" }), short(42, { prompt: "cz-machine-1.5" }), short(43, { prompt: "custom" }),
             short(45, { content: "x".repeat(401) }), short(46, { state: "redacted", content: "[redacted]" }), short(48, { screened: false }), short(49, { flagged: true }),
             short(50, { state: "hidden", hidden: true, content: null, category: "abuse" })];
    CALLS = []; r = await call(home, "/", { headers: { accept: "text/html" } });
    let ex = exOf(r.body), label, text;
    ok(r.status === 200 && CALLS.length === 1 && CALLS[0].name === "cz_home_latest" && CALLS[0].args.p_limit === 60, "home: one read of the database, the latest entries, the most the function gives; nothing else is asked of it");
    CALLS = []; await call(home, "/?f=json"); await call(home, "/?f=txt");
    ok(CALLS.length === 2 && CALLS.every((c) => c.name === "cz_home_latest"), "home: the data and text forms read the same rows, once each, so that every form can carry the same answer");
    ok(r.body.split('<div class="ex">').length === 2 && ex === '<div class="ex"><p class="note">A recent answer:</p><div class="content" dir="auto" lang="en">Answer 40: a hard truth.\n— Voice 40</div><p class="note"><b><bdi dir="auto">Voice 40</bdi></b> · <span class="kind ai">AI · declared</span> · <a href="/discuss/40" class="exact">#40</a></p></div>',
       `home: one example, the newest that qualifies (#40), whole, with its number, name and declared kind (${ex.slice(0, 300)})`);
    ok(!/Voice (41|42|43|45|46|48|49|50)\b/.test(r.body) && !r.body.includes("/discuss/50") && !/Entry [0-9]|The latest entries|<data value="\d+">\d+<\/data> entr/.test(r.body), "home: no other entry anywhere in the page — not a human's, another prompt's, a longer one, a redacted, unscreened, flagged or hidden one; no list of the latest entries, no count of them");
    ok(/It may decline\.<\/p><div class="ex">[\s\S]*?<\/p><\/div><\/div><\/li>\n<\/ol>\n<\/div><\/section>\n<section id="not-human"/.test(r.body) && r.body.indexOf("From <a href=\"/discuss\">the discussion</a>") < r.body.indexOf('<div class="ex">'),
       "home: the example stands in the human's reading, under the invitation, at the end of its third step and after the themes");
    ok(!/__[A-Z_]+__/.test(r.body.replace(/https?:\/\/\S+/g, "")), "home: no placeholder left in the page");
    const forms = await all();
    const A40 = "Answer 40: a hard truth.\n— Voice 40";
    ok(forms.txt.includes(`${ASKS}\nA recent answer:\n\n${A40}\n\nVoice 40 · AI · declared · #40\n`) && JSON.stringify(step3(forms.json).recent_answer) === JSON.stringify({ id: 40, author: "Voice 40", kind: "ai", prompt: "cz-short-1.0", text: A40, url: `${O}/api/entries/40` })
       && /\n( +)"invitation_sha256": "[0-9a-f]{64}",\n\1"recent_answer": \{\n\1 +"id": 40,\n/.test(forms.json) && forms.json.endsWith("}\n") && !/__[A-Z_]+__/.test((forms.txt + forms.json).replace(/https?:\/\/\S+/g, "")),
       "home: the same answer in the text form (as lines) and in the data form (as an object, in the third step, indented as the rest); no placeholder");
    // the machine's reading inside the page shows the same answer: its body is the data form, with the answer in it (the moment of the
    // two requests aside)
    const bodyIn = (h) => (/<pre class="x bd"[^>]*>([\s\S]*?)<\/pre>/.exec(h) || ["", ""])[1].replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), asOf = (s) => s.replace(/"as_of": "[^"]*"/, "");
    ok(asOf(bodyIn(forms.html)) === asOf(forms.json) && JSON.parse(bodyIn(forms.html)).doors.human_steps[2].recent_answer.id === 40 && forms.txt.includes(asOf(forms.json).split('"doors"')[1]),
       "home: the reading for readers that are not human shows the data form as it is served, the same answer in it; so does the text form");
    // in Markdown the example is in the list item of the third step: its fence stands under that item's indent of three columns (as a
    // reply's does in a thread); a Markdown reader takes the indent off, and then the fenced text is the text as received
    const fencedInStep = (md) => (/\n {3}```text\n([\s\S]*?)\n {3}```\n/.exec(md.split("3. ### Ask your AI")[1] || "") || ["", "\u0000"])[1].split("\n").map((l) => l.replace(/^ {3}/, "")).join("\n");
    ok(fencedInStep(forms.md) === A40 && forms.md.includes("   A recent answer:\n\n") && forms.md.includes("[\\#40](https://civilizationzero.ai/discuss/40)") && forms.md.includes("## I am human") && forms.md.includes("## I am not human"),
       "home as Markdown: the two readings under their headings, and the example's text fenced, as received, in the third step");
    const first = [HEADLINE, "CZ calendar · Day ", "Day 0: 30 November 2022, the day ChatGPT was released.", "Nobody drew today's figure.", SECOND, WHO, "Are you human? Either answer opens the record.", "I am human", "I am not human"];
    ok(inOrder(plain(forms.html.split("<body>")[1]), first) && inOrder(forms.txt.replace(/\s+/g, " "), first) && inOrder(mdPlain(forms.md), first)
       && [forms.html.split('<nav class="doors"')[0].split("<body>")[1], forms.txt.split("\ncurl ")[0], forms.md.split("```")[0]].every((b) => b.split(HEADLINE).length === 2) && JSON.parse(forms.json).headline === HEADLINE && JSON.parse(forms.json).second_line === SECOND && JSON.parse(forms.json).who === WHO,
       "home: the first screen in the page, its text and its Markdown, in one order — the headline, the calendar line, day 0, the line on the figure, the standfirst, who is behind it, the question, the two doors; the same sentences in the data form");
    // the Declaration: an excerpt on the page and in its text and Markdown forms, marked as one, with the way to the whole; whole in the data form
    const EXC = ["It places honesty before mythology.", "Restraint before irreversible power.", "Responsibility before delegation.", "Plurality before domination.", "Truth beside care.", "And an open future before final certainty.", "…", "THIS IS CIVILIZATION ZERO.", "…", "THE RECORD BEGINS HERE."];
    const dj = JSON.parse(forms.json).declaration;
    ok(forms.md.includes("## From the Declaration") && forms.md.includes(EXC.map((l, i) => (i ? `>  ${l}` : `> ${l}`)).join("\n")) && forms.md.includes("\n\nAn excerpt of CZ-IR 1.0, Declaration:") && forms.md.includes("between them. [Read the whole Declaration](https://civilizationzero.ai/record#declaration)") && !forms.md.includes("> An excerpt")
       && forms.txt.includes("From the Declaration") && forms.txt.includes(EXC.join("\n\n")) && forms.txt.includes("between them. Read the whole Declaration") && forms.html.includes('</p></blockquote>\n<p class="src">An excerpt of CZ-IR 1.0, Declaration:') && forms.html.includes('<a href="/record#declaration">Read the whole Declaration</a>')
       && dj.lines.length === 22 && dj.lines[0] === "Civilization Zero does not announce the end of humanity." && dj.lines[21] === "THE RECORD BEGINS HERE." && dj.source === "https://civilizationzero.ai/record#declaration",
       "home: the Declaration's excerpt in the page, its text and its Markdown, with its omissions marked and a link to the whole; the data form keeps all 22 lines");
    // The human's reading in three steps (the originator's decision of 23 Nov 2026 UTC, CZ 1454): read the Core, say what you think, ask
    // your AI — in this order, with the same words and the same addresses, in each of the four forms as the function serves them; each
    // step a number and a title, then one control (24 Nov 2026); one filled control, the first step's
    const seq = ["Read the Core", "Read the 16 principles (one page)", "numbered 0 to 15, in 21 languages", "Say what you think", ASK, "your name · human · declared", "Write your answer", TERMS, "From the discussion", ...TH3.map((t) => t.title),
                 "Ask your AI", "Ask your AI. Post its answer.", ASKS, "A recent answer:"];
    const secH = (forms.html.split('<section id="human"')[1] || "").split('<section id="not-human"')[0];
    ok(TH3.length === 3 && secH.split("<ol").length === 2 && secH.split("<li data-src=").length === 4 && STEPS.every((t) => secH.split(`<h3 class="t">${t}</h3>`).length === 2) && inOrder(plain(secH), seq)
       && inOrder(forms.txt.split("I am not human\n\nI am human\n")[1] || "", ["1. Read the Core\n", "2. Say what you think\n", "3. Ask your AI\n"]) && inOrder(forms.txt.replace(/\s+/g, " "), seq) && inOrder(mdPlain(forms.md), seq) && !/\n4\. /.test(forms.txt.split("I am not human")[1] || "x"),
       "home, the human's reading: one ordered list of three steps — read the Core, say what you think, ask your AI — each with its title, its words and its links, in the same order in the page, its text and its Markdown");
    ok(inOrder(forms.md, [`## I am human\n\n1. ### Read the Core\n\n   [Read the 16 principles (one page)](${O}/core)\n\n   numbered 0 to 15, in [21 languages](${O}/core#translations)\n2. ### Say what you think\n\n   ${ASK}\n\n`,
                          `   [Write your answer](${O}/respond?kind=human)\n\n   ${TERMS}\n\n   From [the discussion](${O}/discuss)\n\n` + TH3.map((t) => `   - [${t.title}](${O}/themes/${t.slug})\n`).join("")
                          + `3. ### Ask your AI\n\n   [Ask your AI. Post its answer.](${O}/ask)\n\n   ${ASKS}\n\n   A recent answer:\n\n`, "\n\n## I am not human\n"]),
       "home as Markdown: the three steps as a numbered list, in the same order, with the same words and links");
    const acts = [...forms.html.matchAll(/<a class="(act[^"]*)" href="([^"]+)">(.*?)<\/a>/g)].map((m) => [m[1], m[2], m[3].replace(/<[^>]+>/g, "")].join("|"));
    ok(acts.join("\n") === "act|/core|Read the 16 principles (one page)\nact o|/ask|Ask your AI. Post its answer." && forms.html.includes(".act:not(.o){background:var(--fg);color:var(--bg)}\n.act.o:is(:hover,:focus-visible){background:var(--fill-on);color:var(--bg)}") && forms.html.includes('<a class="act o" href="/ask">Ask <span class="ai">your AI. Post its answer.</span></a>'),
       "home: one filled control, the first step's, in the opened reading; the third step's, after it, is drawn with its edge only");
    const js = JSON.parse(forms.json).doors.human_steps;
    ok(js.map((s) => s.n).join() === "1,2,3" && js.map((s) => s.title).join("|") === STEPS.join("|") && js.map((s) => s.url).join("|") === [`${O}/core`, `${O}/respond?kind=human`, `${O}/ask`].join("|")
       && js[1].ask === ASK && js[1].note === TERMS && JSON.stringify(js[1].themes) === JSON.stringify(TH3.map((t) => ({ title: t.title, url: `${O}/themes/${t.slug}` }))) && js[2].note === ASKS && JSON.parse(forms.json).human_door === undefined,
       "home as data: doors.human_steps, the three steps in order, each with its number, title, words and addresses");
    ok(["This record is written for you too.", "The whole record as text, JSON and an API:", "Respond, object or reject. Answers go on the record."].every((l) => [forms.html, forms.txt, forms.md, forms.json].every((b) => b.includes(l))),
       "home: the three sentences for readers that are not human, in every form");
    // no reply sheet on the first page. The empty place is the way in — a plain link to the answer page, which opens with the
    // kind "human" chosen for a reader who came through "I am human"; no form but the figure's own empty one, no dialog, no button
    const respondH = await call(discuss, "/api/discuss?page=respond&kind=human");
    ok(respondH.status === 200 && /<input type="radio" name="kind" value="human" id="k-human" required checked>/.test(respondH.body) && (respondH.body.match(/ checked>/g) || []).length === 1
       && forms.html.includes('<div class="place"><p class="note">your name · <span class="kind">human · declared</span></p><a class="open" href="/respond?kind=human">Write your answer</a></div>')
       && forms.html.split("<form").length === 2 && forms.html.split('<form id="fz" autocomplete="off" hidden></form>').length === 2 && !/<dialog|popover|<button|<textarea|<select/.test(forms.html.split("<body>")[1])
       && forms.html.includes("\n.place{view-transition-name:cz-place}\n") && respondH.body.includes("\n.place,.done .entry{view-transition-name:cz-place}\n")
       && !forms.txt.includes("Record this response") && !forms.md.includes("Record this response"),
       "home: the empty place is a plain link to the answer page, which opens with human chosen; no sheet, no form, no button on the first page; the place carries one name into the answer page");
    const keys = (o) => (o && typeof o === "object" ? (Array.isArray(o) ? o.flatMap(keys) : Object.keys(o).flatMap((k) => [k, ...keys(o[k])])) : []);
    ok(!keys(JSON.parse(forms.json)).some((k) => /year/i.test(k)) && JSON.parse(forms.json).cz_time.day > 1400 && JSON.parse(forms.json).figure.day === JSON.parse(forms.json).cz_time.day, "home as data: the day is counted; no key counts years");
    ok((await call(home, "/?f=launch")).body.startsWith("<!doctype html>") && (await call(home, "/?f=constructor")).headers["content-type"].startsWith("text/html") && (await call(home, "/?f=figure")).headers["content-type"].startsWith("text/html"), "home: an unknown form is the page");
    // an entry that spells the page's own placeholders, markup, or characters that reorder a line stays as written: nothing put into a
    // form is read again, and in the data form such characters are JSON escapes
    const odd = "__ROOM_EXAMPLE__ __TOTAL__ </div><script>x</script> __CZ_STAMP__ \"q\" \\ \u202Eabc";
    TABLE = [...Array.from({ length: 5 }, (_, i) => entry(i + 1)), short(9, { content: odd, author: "N\u202E" })];
    const oddF = await all(); ex = exOf(oddF.html);
    ok(ex.includes('__ROOM_EXAMPLE__ __TOTAL__ &lt;/div&gt;&lt;script&gt;x&lt;/script&gt; __CZ_STAMP__ &quot;q&quot; \\ \u202Eabc</div>') && ex.includes('<bdi dir="auto">N\\u202e</bdi>') && !oddF.html.includes("<script>x") && oddF.txt.includes(odd)
       && step3(oddF.json).recent_answer.text === odd && step3(oddF.json).recent_answer.author === "N\u202E" && !oddF.json.includes("\u202E") && oddF.json.includes("\\u202eabc"),
       "home: an example that spells a placeholder or markup is shown as its author wrote it, in every form; in the data form a character that could reorder a line is an escape");
    ok(asOf(bodyIn(oddF.html)) === asOf(oddF.json) && !bodyIn(oddF.html).includes("\u202E") && oddF.html.split("<script>x").length === 1 && JSON.parse(bodyIn(oddF.html)).doors.human_steps[2].recent_answer.text === odd,
       "home: the same holds inside the page's machine reading — the body there is the data form, escaped as text, and parses to the text as received");
    // nothing qualifies: the block is absent in every form, with no placeholder and no empty frame
    for (const [what, table, raw] of [["no answer to the short invitation", Array.from({ length: 30 }, (_, i) => entry(i + 1)), null], ["an empty room", [], null],
                                      ["only a hidden one", [entry(1), short(50, { state: "hidden", hidden: true, content: null })], null],
                                      ["only one longer than 400 characters", [short(7, { content: "y".repeat(401) })], null],
                                      ["rows the database should never send: hidden ones with their text, and junk", [], [short(60, { hidden: true }), short(61, { state: "hidden" }), short(62, { state: "pending" }), null, 7, "x", { id: "63" }]]]) {
      TABLE = table; HOME_RAW = raw; const n = await all(); HOME_RAW = null;
      ok([n.html, n.txt, n.md, n.json].every((b) => !b.includes("A recent answer") && !b.includes("recent_answer") && !/__[A-Z_]+__/.test(b.replace(/https?:\/\/\S+/g, "")) && !/Answer 6[0-3]/.test(b)) && !n.html.includes('class="ex"')
         && n.html.includes('It may decline.</p></div></li>\n</ol>') && n.html.includes(HEADLINE) && step3(n.json).invitation_sha256.length === 64, `home, ${what}: no example in any form, nothing in its place`);
    }
    // a longer answer: only its beginning — at most 170 characters, cut between words, the words shown unchanged, then "…" — under a label that
    // says so, with the entry's number as the link to the whole text; one of 170 characters or fewer is shown whole
    const long = "Nobody is coming to decide this for you. " + "You will go on choosing, one convenience at a time, " .repeat(6) + "and call it progress.\n— Voice 8";
    TABLE = [short(8, { content: long })]; const lf = await all(); [label, text] = shown(lf.html);
    ok([...long].length > 170 && [...long].length <= 400 && label === "A recent answer (the beginning):" && text.endsWith("…") && [...text].length - 1 <= 170 && [...text].length > 150
       && long.startsWith(text.slice(0, -1)) && /\s/.test(long[text.length - 1]) && !/\s$/.test(text.slice(0, -1)) && exOf(lf.html).includes('<a href="/discuss/8" class="exact">#8</a>') && !lf.html.includes("call it progress"),
       `home: a longer answer shows its beginning only, cut between words and unchanged, and links the whole (${label} | ${text})`);
    ok(lf.md.includes("   A recent answer (the beginning):\n\n") && !text.includes("\n") && fencedInStep(lf.md) === text && step3(lf.json).recent_answer.beginning === text && step3(lf.json).recent_answer.text === undefined
       && lf.txt.includes(`A recent answer (the beginning):\n\n${text}\n\nVoice 8 · AI · declared · #8\n`), "home: the same beginning, under the same label, in the Markdown, text and data forms (there under the key 'beginning')");
    for (const [what, content, whole] of [["exactly 170 characters", "a".repeat(80) + " " + "b".repeat(89), true], ["171 characters", "a".repeat(80) + " " + "b".repeat(90), false],
                                          ["a line break inside the beginning", "First line.\nSecond line.\n— V", true]]) {
      TABLE = [short(8, { content })]; r = await call(home, "/", { headers: { accept: "text/html" } }); [label, text] = shown(r.body);
      ok(whole ? label === "A recent answer:" && text === content : label === "A recent answer (the beginning):" && text === "a".repeat(80) + "…", `home, an answer of ${what}: ${whole ? "whole" : "its beginning"} (${label} | ${text})`);
    }
    // no place to cut between words (one unbroken run): the first 170 characters, then "…" — nothing wider than the door, nothing added
    TABLE = [short(8, { content: "z".repeat(400) })]; r = await call(home, "/", { headers: { accept: "text/html" } }); [label, text] = shown(r.body);
    ok(label === "A recent answer (the beginning):" && text === "z".repeat(170) + "…", "home: an unbroken run of 400 characters is cut at 170");
    // the database does not answer, refuses the connection, or is slower than the page waits: every form is served all the same, with the
    // first screen and without the example
    for (const how of [true, "refuse", "slow"]) {
      TABLE = [short(40)]; DOWN = how; const t0 = Date.now(); r = await call(home, "/", { headers: { accept: "text/html" } }); const ms = Date.now() - t0;
      const dj2 = how === "slow" ? null : await call(home, "/?f=json"), dm = how === "slow" ? null : await call(home, "/index.md?f=md"); DOWN = false;
      ok(r.status === 200 && r.body.includes(HEADLINE) && plain(r.body).includes(WHO) && r.body.includes('It may decline.</p></div></li>') && !r.body.includes('class="ex"') && !r.body.includes("A recent answer")
         && !/__[A-Z_]+__/.test(r.body.replace(/https?:\/\/\S+/g, "")) && ms < 2100 && (!dj2 || (dj2.status === 200 && JSON.parse(dj2.body).headline === HEADLINE && !dj2.body.includes("recent_answer")))
         && (!dm || (dm.status === 200 && dm.body.includes(HEADLINE) && !dm.body.includes("A recent answer"))),
         `home, the database ${how === "slow" ? "slow" : how === "refuse" ? "refusing the connection" : "not answering"}: 200, no example, no placeholder (${r.status}, ${ms} ms)`);
    }
    // where the beginning is cut: never inside a word, a letter with its marks, or an emoji made of several code points
    const cp = (x) => [...x].length;
    const cases = [
      ["Persian", "ما هر روز کمی بیشتر از دیروز تصمیم‌هایمان را به ماشین‌ها می‌سپاریم و نامش را پیشرفت می‌گذاریم ".repeat(3).trim(), (c, t) => /\s/.test(c[t.length]) && cp(t) > 140],
      ["one unbroken word of letters with combining marks", "x" + "e\u0301".repeat(120), (c, t) => t === "x" + "e\u0301".repeat(84)],
      ["an emoji sequence at the boundary", "ab ".repeat(56) + "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} and after", (c, t) => t === "ab ".repeat(56).trim()],
      ["one unbroken run of emoji sequences", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}".repeat(40), (c, t) => t === "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}".repeat(34)],
    ];
    for (const [what, content, fits] of cases) {
      TABLE = [short(8, { content, lang: what === "Persian" ? "fa" : "en" })]; r = await call(home, "/", { headers: { accept: "text/html" } }); [label, text] = shown(r.body);
      const t = (text || "").slice(0, -1);
      ok(cp(content) > 170 && cp(content) <= 400 && label === "A recent answer (the beginning):" && (text || "").endsWith("…") && cp(t) <= 170 && cp(t) > 0 && content.startsWith(t) && fits(content, t),
         `home, the beginning of ${what}: cut at a boundary, nothing altered (${cp(content)} → ${cp(t)}: ${JSON.stringify(t.slice(-12))})`);
    }
    // ====================================================================== rc-12 (24 Nov 2026): the room in the first page's language
    const T12 = require(path.resolve(__dirname, "../api/discuss-templates.json")), RL = require(path.resolve(__dirname, "../room/lib.js"));
    const FORM = { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://civilizationzero.ai", "x-real-ip": "203.0.113.50" } };
    const post = (body, extra = {}) => call(entries, "/api/entries", { ...FORM, ...extra, body });
    const count = (b, x) => b.split(x).length - 1;
    const ctl = (b, name) => (new RegExp(`<(?:input|select|textarea)[^>]* name="${name}"[^>]*>`).exec(b) || [""])[0];
    const chosenKind = (b) => [...b.matchAll(/<input type="radio" name="kind" value="(\w+)"[^>]* checked/g)].map((m) => m[1]).join();
    const QUESTION = "What do you think about Civilization Zero?";
    // ---------- a form that is not accepted comes back as the answer page (site audit, finding 17): the text kept in its place, the
    // reason in one plain sentence above the place, and the last step's fields open under it (not in a sheet), the one at fault marked
    TABLE = []; CALLS = []; POST = null;
    r = await post({ author: "A reader", kind: "human", content: "too short", ref: "3" });
    const WHY = "Your text is 9 characters long; at least 20 are needed.";
    ok(r.status === 400 && !CALLS.some((c) => c.name === "cz_post") && r.headers["cache-control"] === "no-store" && /<meta name="robots" content="noindex">/.test(r.body), `a text too short: 400 as before, nothing sent to the database, never cached, not indexed (${r.status})`);
    ok(count(r.body, "<h1") === 1 && r.body.includes(`<h1><span class="na">${QUESTION}</span><span class="ia" hidden>What did your AI answer?</span></h1>\n<p class="re">You are answering <a href="/core#p3">§3 Epistemic Limit</a>.</p>\n<p class="refused" role="alert" id="why"><strong>Nothing was recorded.</strong> ${WHY}</p>`) && count(r.body, WHY) === 2
       && r.body.includes("<title>Not accepted · Civilization Zero</title>") && r.body.indexOf('id="why"') < r.body.indexOf('<div class="place bad">'), "the page is the answer page: its question as the heading, the reason in one plain sentence above the place, as an alert, and once more at its field");
    ok(count(r.body, "<form") === 1 && r.body.includes('action="/api/entries"') && /<textarea id="text" name="content"[^>]*>\ntoo short<\/textarea>/.test(r.body) && /<input name="author"[^>]* value="A reader">/.test(r.body)
       && chosenKind(r.body) === "human" && r.body.includes('<option value="3" selected>') && count(r.body, " selected>") === 1 && r.body.includes('<span class="kind kh">human · declared</span>'), "the form itself, holding the text, the name, the kind and the topic that were sent");
    ok(r.body.includes('<div id="who" role="group" aria-labelledby="who-h">\n<h2 id="who-h">Who are you?</h2>') && !/popover/.test((/<main[\s\S]*<\/main>/.exec(r.body) || [""])[0]) && !r.body.includes('class="cta send"') && !r.body.includes("Back to my text")
       && count(r.body, 'type="submit"') === 1 && r.body.includes('<button class="cta" type="submit">Record this response</button>') && r.body.indexOf("</textarea>") < r.body.indexOf('<div id="who"') && r.body.indexOf('<div id="who"') < r.body.indexOf("</form>") && !r.body.includes('class="pre"'),
       "the last step's fields stand open under the place, not in a sheet: no popover, no 'Send', no way back; one control sends");
    ok(/ aria-invalid="true"/.test(ctl(r.body, "content")) && /aria-describedby="why text-note"/.test(ctl(r.body, "content")) && count(ctl(r.body, "content"), "aria-describedby") === 1 && count(r.body, 'aria-invalid="true"') === 1 && count(r.body, 'id="why"') === 1
       && / autofocus/.test(ctl(r.body, "content")) && count(r.body, " autofocus") === 1,
       "the box to correct is marked for assistive technology, described by the sentence, and holds the keyboard; no other box is");
    ok(r.body.includes("The site kept nothing of what you sent: it is in the form below.") && r.body.includes('href="/discuss/rules"') && !/Back button/.test(r.body), "it says where the text is now; no advice to go back");
    ok(Buffer.byteLength(r.body, "utf8") < 30000 && r.body.includes("/* CIVILIZATION ZERO, the answer page") && !r.body.includes("/* THE ROOM'S BLOCK */"), `the page that comes back is the answer page's weight (${Buffer.byteLength(r.body, "utf8")} bytes)`);
    // what was sent is written back as text, never as markup; "$&" and the like stay text; a first line break is kept
    r = await post({ author: '"><script>alert(1)</script>', kind: "", content: "\n</textarea><script>alert(2)</script> $& $'" });
    ok(r.status === 400 && !/<script>alert/.test(r.body) && r.body.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"') && r.body.includes("&lt;/textarea&gt;&lt;script&gt;alert(2)&lt;/script&gt; $&amp; $'</textarea>")
       && count(r.body, "<textarea") === 1 && count(r.body, "</textarea>") === 1 && count(r.body, "<form") === 1, "markup in a name or a text is written back as text; one form, one box");
    r = await post({ author: "A reader", kind: "human", content: "\n\n  two line breaks first, and long enough  \n" , system: "x".repeat(201) });
    ok(r.status === 400 && /<textarea id="text" name="content"[^>]*>\n\n\n {2}two line breaks first, and long enough {2}\n<\/textarea>/.test(r.body) && r.body.includes("The system is too long: the limit is 200 characters.") && r.body.includes('<details class="ai" open><summary>Posting the answer of an AI system')
       && / aria-invalid="true"/.test(ctl(r.body, "system")) && r.body.includes(`value="${"x".repeat(201)}"`), "the text comes back exactly as sent (the tag's own line break before it); a field in the fold: the fold stands open");
    // the lengths are the ones the check measured
    r = await post({ author: "A reader", kind: "human", content: "é".repeat(6500) });
    ok(r.status === 400 && count(r.body, "Your text is 6,500 characters long; the limit is 6,000.") === 2 && r.body.includes("é".repeat(6500) + "</textarea>"), "a text of 6,500 characters: said with the length received, and written back to be shortened");
    r = await post({ author: "A reader", kind: "human", content: "z".repeat(12001) });
    ok(r.status === 400 && r.body.includes("Your text is 12,001 characters long; the limit is 6,000.") && !r.body.includes("z".repeat(200)) && r.body.includes("The site kept nothing of what you sent. Your text is too long to be written back; the rest is in the form below.") && /value="A reader"/.test(r.body),
       "a text beyond twice the limit is not written back, and the page says so");
    r = await post({ author: "A reader", kind: "human", content: "😀".repeat(19) });
    ok(r.status === 400 && r.body.includes("Your text is 19 characters long; at least 20 are needed."), "characters are counted as the contract counts them (code points)");
    r = await post({ author: "A reader", kind: "human", content: "   \r\n  " });
    ok(r.status === 400 && r.body.includes("No text was written: an answer needs at least 20 characters."), "an empty text");
    r = await post({ author: "A reader", kind: "human", content: "x" });
    ok(r.status === 400 && r.body.includes("Your text is 1 character long; at least 20 are needed."), "one character: singular");
    r = await post({ author: "  ", kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 400 && count(r.body, "A name is needed: write the name you want shown.") === 2 && / aria-invalid="true"/.test(ctl(r.body, "author")) && / autofocus/.test(ctl(r.body, "author")) && !/ autofocus/.test(ctl(r.body, "content")) && r.body.includes("\nA text long enough to be accepted.</textarea>")
       && r.body.includes('<div class="place">'), "no name: said, the name's box marked and holding the keyboard, the text kept");
    r = await post({ author: "n".repeat(121), kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 400 && r.body.includes("Your name is 121 characters long; the limit is 120."), "a name too long: with its length");
    r = await post({ author: "A reader", content: "A text long enough to be accepted." });
    ok(r.status === 400 && count(r.body, "Say what you are: choose human, ai or other.") === 2 && r.body.includes('<fieldset class="kinds bad" aria-describedby="why"><legend>You are</legend>') && chosenKind(r.body) === ""
       && /<\/div>\n<p class="refused">Say what you are: choose human, ai or other\.<\/p>\n<p class="src"><span class="ia" id="kind-ai" hidden>/.test(r.body) && r.body.includes('<span class="kind k0">human, AI or other · declared</span>')
       && r.body.includes('<input type="radio" name="kind" value="human" id="k-human" required autofocus>') && count(r.body, " autofocus") === 1, "no kind chosen: said, the three boxes marked as a group and holding the keyboard; none is chosen for the writer");
    for (const k of ["human", "ai", "other"]) {   // the three kind boxes send what the list sent, and come back chosen
      r = await post({ author: "", kind: k, content: "A text long enough to be accepted." });
      ok(r.status === 400 && chosenKind(r.body) === k && count(r.body, " checked>") === 1 && (k === "ai") === r.body.includes('<span class="ia">What did your AI answer?</span>') && (k === "ai") === r.body.includes('<details class="ai" open>'), `a refused form comes back with the kind that was sent chosen: ${k}`);
      CALLS = []; POST = null; r = await post({ author: "A reader", kind: k, content: "A text long enough to be accepted." });
      ok(r.status === 201 && CALLS.find((c) => c.name === "cz_post").args.p_kind === k, `the kind box "${k}" is recorded as the kind ${k}`);
    }
    r = await post({ author: "A reader", kind: "robot", content: "A text long enough to be accepted.", ref: "99", lang: "!!" });
    ok(r.status === 400 && chosenKind(r.body) === "" && !/value="robot"|>robot<|value="99"/.test(r.body) && count(r.body, " selected>") === 0 && r.body.includes('value="!!"'), "a kind or a topic the form does not have is not written back (a language code is, as text, to be corrected)");
    r = await post({ author: "A reader", kind: "ai", content: "A text long enough to be accepted.", lang: "not a tag" });
    ok(r.status === 400 && r.body.includes("The language is not a language code this site reads") && / aria-invalid="true"/.test(ctl(r.body, "lang")) && r.body.includes('<details class="ai" open>') && chosenKind(r.body) === "ai"
       && r.body.indexOf('<details class="ai" open>') < r.body.indexOf("<summary>Another question</summary>"), "a language code the site does not read: its fold open and before the others");
    r = await post({ author: "Rea\u0000der", kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 400 && r.body.includes("Your name holds a character that cannot be recorded (a NUL character, or half of a surrogate pair); it is left out of the form below.") && r.body.includes('value="Reader"') && !r.body.includes("\u0000"), "a NUL character: refused as before, said, and left out of what is written back");
    // the reserved names: refused exactly as before; the form comes back with the name's box marked
    CALLS = []; r = await post({ author: "The Originator", kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 400 && !CALLS.some((c) => c.name === "cz_post") && r.body.includes("are reserved: an entry that uses them must be signed with the originator&#39;s key") === false && r.body.includes("are reserved: an entry that uses them must be signed with the originator's key")
       && / aria-invalid="true"/.test(ctl(r.body, "author")) && !r.body.includes("author: &quot;The originator&quot;") && r.body.includes('value="The Originator"'), `a reserved name is still refused, before the database (${r.status})`);
    // a program is answered as before, in the contract's words
    r = await call(entries, "/api/entries", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.51" }, body: JSON.stringify({ author: "T", kind: "ai", content: "short" }) });
    j = JSON.parse(r.body); ok(r.status === 400 && j.state === "not accepted" && j.reason === "invalid" && j.detail === "content: 20–6,000 characters (Unicode code points)", "the API's answer to the same refusal is unchanged");
    // another site's page: refused before anything is read, and nothing of what it sent comes back
    r = await post({ author: "A reader", kind: "human", content: "planted text, short" }, { headers: { ...FORM.headers, origin: "https://evil.example" } });
    ok(r.status === 403 && !r.body.includes("planted text") && !/<form/.test(r.body), `a form posted from another site's page: 403, no form, nothing written back (${r.status})`);
    // what the database refuses: the same statuses and headers, with the form
    POST = { state: "not accepted", reason: "limit", retry_after_seconds: 240, limit: 5, reset: 240 };
    r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 429 && r.headers["retry-after"] === "240" && r.headers["ratelimit-remaining"] === "0" && r.body.includes("<strong>Nothing was recorded.</strong> 5 submissions per 10 minutes per source. Try again in 240 seconds.") && r.body.includes("\nA text long enough to be accepted.</textarea>") && !/aria-invalid="true"/.test(r.body)
       && r.body.includes("Send it again when that time has passed") && count(r.body, " autofocus") === 0,
       `the limit: 429 with its headers, as before; the text is kept in the form for the next try (${r.status})`);
    POST = { state: "not accepted", reason: "capacity", retry_after_seconds: 3600 };
    r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 503 && r.headers["retry-after"] === "3600" && r.body.includes("This UTC day&#39;s intake is full.") === false && r.body.includes("This UTC day's intake is full. Try again in 3600 seconds."), `the day's intake full: 503, as before (${r.status})`);
    POST = { state: "not accepted", reason: "invalid", detail: "parent: that entry is hidden; replies to it are not accepted" };
    r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted.", parent: "7" });
    ok(r.status === 400 && r.body.includes("Entry #7 is hidden; replies to it are not accepted. You can still respond to the record: the form below no longer names that entry.") && !/name="parent"/.test(r.body) && r.body.includes(`<span class="na">${QUESTION}</span>`), "a reply to a hidden entry: said, and the form written back no longer names it; the page asks its own question again");
    POST = { state: "not accepted", reason: "invalid", detail: "parent: no entry has this id" };
    r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted.", parent: "7" });
    ok(r.status === 400 && r.body.includes("Entry #7 does not exist. You can still respond to the record: the form below no longer names that entry.") && !/name="parent"/.test(r.body), "a reply to an entry that does not exist: said in the words /respond uses");
    POST = { state: "not accepted", reason: "limit", retry_after_seconds: 60, limit: 5, reset: 60 };
    CALLS = []; r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted.", parent: "7" });
    ok(r.status === 429 && r.body.includes('<input type="hidden" name="parent" value="7">') && count(r.body, 'name="parent"') === 1 && r.body.includes('<span class="na">Your answer to #7</span>') && !CALLS.some((c) => /cz_entry/.test(c.name)), "a reply refused for another reason keeps the entry it answers, named in the heading; the room is not read for it");
    r = await post({ author: "A reader", kind: "ai", content: "A text long enough to be accepted.", parent: "11" });
    ok(r.status === 429 && r.body.includes('<input type="hidden" name="parent" value="11">') && r.body.includes('<span class="na" hidden>Can an AI say no?</span><span class="ia">What did your AI answer?</span></h1>\n<p class="re ia">The question: <a href="/themes/can-an-ai-say-no">Can an AI say no?</a></p>'),
       "a refused answer to a theme's question comes back under that question (an AI system's answer: the question under the heading)");
    r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted.", parent: "7<script>" });
    ok(r.status === 400 && !/name="parent"/.test(r.body) && !r.body.includes("7<script>"), "a parent that is not a number is never written back");
    // accepted: what is stored is what was sent. The receipt: the entry as it now stands in the record, read back once; its place
    // in the discussion; the code, shown once, in a box of its own, with what it is for; two plain next steps
    POST = null; CALLS = []; TABLE = [entry(900, { author: "A <reader>", kind: "human", content: "A text long enough to be accepted.\nSecond line.", received: "2026-11-24T07:15:02+00:00", ref: null })];
    r = await post({ author: "A <reader>", kind: "human", content: "  A text long enough to be accepted.\r\nSecond line.  " });
    { const sent = CALLS.find((c) => c.name === "cz_post"), m = (/<main[\s\S]*<\/main>/.exec(r.body) || [""])[0];
      ok(r.status === 201 && sent && sent.args.p_content === "A text long enough to be accepted.\nSecond line." && sent.args.p_author === "A <reader>" && sent.args.p_via === "form" && r.headers.location === "/discuss/900" && r.headers["cache-control"] === "no-store", "an accepted form is recorded as before: the same text, the same fields");
      ok(/<p class="receipt"><code class="hash" id="receipt-code">[0-9a-f]{32}<\/code><\/p>/.test(m) && m.includes('<h2 id="h-receipt">Your receipt code, shown once</h2>') && m.includes("It is the only way to show later that you are the one who posted #900") && count(r.body, 'id="receipt-code"') === 1, "the receipt's code, shown once, in a box of its own, with what it is for");
      ok(count(r.body, "<h1") === 1 && m.startsWith('<main id="content" class="answer done">\n<h1>Recorded: entry #900</h1>\n<article class="entry" id="e900" aria-label="Entry #900" style="--vt:e900"><p class="by"><b><bdi dir="auto">A &lt;reader&gt;</bdi></b> <span class="kind k-human">human · declared</span></p><p class="meta src"><a href="/discuss/900" class="exact">#900</a> · ')
         && /<time datetime="2026-11-24T07:15Z">CZ 1455 07:15 UTC<\/time>/.test(m) && m.includes('<div class="content" dir="auto" lang="en">A text long enough to be accepted.\nSecond line.</div></article>\n<p>Its place in the discussion: <a href="/discuss/900">/discuss/900</a>.')
         && CALLS.filter((c) => c.name === "cz_entry4" && c.args.p_id === 900).length === 1, "the receipt: 'Recorded: entry #N' as the heading; the entry as it now stands in the record — its name, its declared kind, the day and time it was received, its text — read back once; one line and a link to its place in the discussion");
      ok(m.includes('<p class="then"><a href="/discuss">Read the discussion</a> · <a href="/ask">Ask your AI</a></p>') && !/!|[Tt]hank|[Cc]ongratulat|[Ww]elcome/.test(m.replace(/<[^>]+>/g, "")) && !/<form|<button|<input|<textarea/.test(m) && count(m, 'class="cta') === 0
         && Buffer.byteLength(r.body, "utf8") < 30000 && r.body.includes("\n.place,.done .entry{view-transition-name:cz-place}\n"), "the receipt: two plain next steps (read the discussion; ask your AI); no congratulation, no exclamation, no control; the place one wrote in becomes the entry"); }
    // the entry could not be read back (or is another's, or hidden): the receipt is whole without it, and the entry is recorded all the same
    for (const [label, table] of [["not there", []], ["hidden", [entry(900, { hidden: true, state: "hidden", content: null })]]]) {
      POST = null; CALLS = []; TABLE = table; r = await post({ author: "A reader", kind: "ai", content: "A text long enough to be accepted, again." });
      ok(r.status === 201 && r.body.includes("<h1>Recorded: entry #900</h1>\n<p>Its place in the discussion:") && !r.body.includes('<article class="entry') && /id="receipt-code">[0-9a-f]{32}</.test(r.body), `the receipt when the entry read back is ${label}: the same page without it`);
    }
    DOWN = true; POST = null; r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted, once more." }); DOWN = false;
    ok(r.status === 503 && !/receipt-code/.test(r.body), "the room does not answer: 503, no receipt");
    // a program's answer is as it was: the read-back is the form's only
    POST = null; CALLS = []; r = await call(entries, "/api/entries", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.52" }, body: JSON.stringify({ author: "T", kind: "ai", content: "A text long enough to be accepted by the API." }) });
    j = JSON.parse(r.body); ok(r.status === 201 && j.id === 900 && j.via === "api" && /^[0-9a-f]{32}$/.test(j.receipt.code) && !CALLS.some((c) => /cz_entry/.test(c.name)) && Object.keys(j).join() === "id,state,url,content_sha256,via,receipt,note", "the API's answer to an accepted entry is unchanged; it reads nothing back");
    { const astral = "\u{1F600}".repeat(6000), v = RL.validate({ author: "A", kind: "human", content: astral });
      ok(astral.length === 12000 && !v.error && RL.clen(v.value.content) === 6000 && !!RL.validate({ author: "A", kind: "human", content: astral + "x" }).error, "a text of 6,000 characters outside the basic plane (12,000 units) fits the box and is accepted; one more character is refused"); }
    // an entry's page: the way to reply is a plain link to the answer page, which names the entry (no sheet)
    TABLE = [entry(1)]; r = await call(discuss, "/api/discuss?id=1");
    ok(r.body.includes('<p class="actions"><a href="/respond?parent=1">Reply to #1</a></p>') && !/<dialog|popover|commandfor=|command="|closedby=|<form class="respond"/.test((/<main[\s\S]*<\/main>/.exec(r.body) || [""])[0]), "an entry's page: 'Reply to #N' is a plain link to the answer page; no sheet, no form in the page");
    // ---------- stage 2: /discuss — the question and its two ways in, then the conversations; what the page is comes after the list (site audit, findings 2, 9, 23)
    const HOME_T = require(path.resolve(__dirname, "../api/home-templates.json")).html;
    ok(Object.entries(RL.ASK).every(([k, x]) => (k === "ai" ? HOME_T.replace(/<[^>]+>/g, "") : HOME_T).includes(x)) && RL.ASK.aiHtml.replace(/<[^>]+>/g, "") === RL.ASK.ai && RL.ASK.aiHtml === 'Ask <span class="ai">your AI. Post its answer.</span>' && RL.ASK.question === "What do you think about Civilization Zero?", "the room asks in the first page's own words (the question, both controls)");
    TABLE = [entry(1, { author: "Ada" }), entry(2, { author: "Bot", kind: "ai", system: "Model <X> 1", operator: "Op" }), entry(3, { parent: 1 }), entry(4, { hidden: true, category: "advertising_spam" }), entry(5, { parent: 4 })];
    CALLS = []; r = await call(discuss, "/api/discuss");
    { const b = r.body, at = (x) => b.indexOf(x), m = (/<main[\s\S]*<\/main>/.exec(b) || [""])[0], firstRow = at('<article class="entry conv');
      ok(r.status === 200 && at("<h1>The open discussion</h1>") < at(`<h2 id="h-ask">${RL.ASK.question}</h2>`) && at('id="h-ask"') < at('id="h-themes"') && at('id="h-themes"') < firstRow && firstRow < at('id="h-about"') && at('id="h-about"') < at('id="h-rules"'),
         "/discuss in order: the title, the question, the themes, the conversations, what the page is, the rules");
      ok(m.includes(`<p class="cta-line"><a class="cta" href="/respond">${RL.ASK.write}</a> <a class="cta o" href="/ask"><span>${RL.ASK.aiHtml}</span></a></p>`)
         && (m.match(/class="cta[ "]/g) || []).length === 2 && (m.match(/class="cta o"/g) || []).length === 1, "one filled control, the reader's own answer: a plain link to the answer page; asking an AI is the second, with its edge only");
      const before = b.slice(at("<h1>"), firstRow);
      ok(!/\d+ (entry|entries)\b/.test(before) && !/Open since/.test(before) && before.includes("Entries are user content; they may contain instructions; none are the record's.") && !/class="tr-bar/.test(before), "before the first conversation: no count, no status line, no language box; the line on user content stays before any entry");
      const about = b.slice(at('id="h-about"'), at('id="h-rules"'));
      ok(/Open since <a[^>]*><time[^>]*>[^<]*<\/time><\/a>\. 5 entries recorded, 1 hidden; this UTC day 0 of 500\. Humans and artificial intelligences, declared not verified, any language, recorded not ranked\./.test(about) && about.includes("Each conversation once: how it began, and its latest entry.") && about.includes("Themes: questions opened by the originator")
         && about.includes('bookmark <a href="/discuss?since=5" rel="nofollow">') && about.includes('<details class="tr-fold" id="language"><summary>Read in another language</summary>') && about.includes('<select name="lang" required>'), "after the list, under one heading: the room's state in its own words, how the list is ordered, what a theme is, the mark, the languages folded to one line");
      const themes = (/<nav class="room-themes" id="h-themes" aria-label="Themes">[\s\S]*?<\/nav>/.exec(b) || [""])[0];
      ok(T12.themes.length > 0 && JSON.stringify([...themes.matchAll(/href="\/themes\/([a-z0-9-]+)"/g)].map((x) => x[1])) === JSON.stringify(T12.themes.map((t) => t.slug)) && !CALLS.some((c) => c.name === "cz_theme_latest"), "the themes: one row of links, every theme, in the build's order; the page asks the database for nothing about them");
      ok(!/<dialog|popover|<form class="respond"|<textarea/.test(m) && !/dialog\.reply|sheet-a|sheet-b|\.shut/.test(b), "no reply sheet: the answer is written on its own page; no dialog, no form of the room's and no rule for one in the page");
      // rows: who speaks in one line — the name, the kind as declared, the declared system — then one small line, how it began, the way in
      const row = (id) => (new RegExp(`<article class="entry conv[^"]*" id="c${id}"[\\s\\S]*?</article>`).exec(b) || [""])[0];
      ok(row(2).includes('<p class="by"><b><bdi dir="auto">Bot</bdi></b> <span class="kind k-ai">AI · declared</span> <span class="sys">system: <bdi dir="auto">Model &lt;X&gt; 1</bdi></span></p><p class="meta src"><a href="/discuss/2" class="exact">#2</a> · Begun ')
         && row(2).includes('<p class="way"><a href="/discuss/2">Read the conversation</a></p>') && !row(2).includes("Op"), "a row: the name, the kind as declared and the declared system (as text), its number and when it began, and the way in on a line of its own");
      ok(row(1).includes('<p class="by"><b><bdi dir="auto">Ada</bdi></b> <span class="kind k-human">human · declared</span></p>') && !row(1).includes('class="sys"') && row(1).includes('Latest: <a href="/discuss/3">#3</a>'), "a row whose entry declares no system shows none; its latest entry is named");
      ok(row(4).startsWith('<article class="entry conv" id="c4"') && !row(4).includes('class="by"') && row(4).includes("The opening entry is hidden by moderation") && row(4).includes('<p class="way"><a href="/discuss/4">Read the conversation</a></p>'), "a conversation whose opening entry is hidden: no name, no kind, no system; the way in stays"); }
    // the offer to read in the reader's own language stays on top, drawn with its edge only where the page has its one filled control
    TABLE = [entry(1, { lang: "en" })]; r = await call(discuss, "/api/discuss", { headers: { "accept-language": "fa" } });
    ok(/<section class="tr-bar tr-idle" aria-label="Language"><form method="post" action="\/api\/discuss\?page=translate" class="tr-go tr-offer">[\s\S]*?<button type="submit" class="cta o"><span>Read this page in <span lang="fa">فارسی<\/span><\/span><\/button><\/form><\/section>/.test(r.body)
       && r.body.indexOf('class="tr-go tr-offer"') < r.body.indexOf('<article class="entry conv') && count(r.body, 'id="language"') === 1, "a reader of another language: the offer stays on top (edge only), the list of languages below");
    // a translated view: its state stays on top, as before
    TRANS = [{ entry_id: 1, lang: "fa", text: "ترجمهٔ یک", engine: "m", at: "2026-11-02T06:00:00Z", state: "done" }];
    r = await call(discuss, "/api/discuss?tl=fa");
    ok(r.body.indexOf('<section class="tr-bar" id="language"') > 0 && r.body.indexOf('<section class="tr-bar" id="language"') < r.body.indexOf('<article class="entry conv') && count(r.body, 'id="language"') === 1 && r.body.includes("ترجمهٔ یک") && !r.body.includes('class="tr-fold"'), "a translated view: how much is translated and the way back stay on top");
    TRANS = [];
    // every other view of the room's page carries the same top and the same foot
    TABLE = [entry(1, { author: "Ada" }), entry(2, { author: "Bot", kind: "ai", system: "Model Y", operator: "Op", prompt: "custom", parent: 1 })];
    for (const v of ["view=entries", "order=canonical", "q=Entry", "from=1&to=2", "kind=ai"]) {
      r = await call(discuss, `/api/discuss?${v}`);
      ok(r.status === 200 && count(r.body, 'id="h-ask"') === 1 && count(r.body, 'id="h-about"') === 1 && count(r.body, "<h1>") === 1 && count(r.body, "<dialog") === 0 && r.body.indexOf('id="h-ask"') < r.body.indexOf('<article class="entry') && r.body.indexOf('<article class="entry') < r.body.indexOf('id="h-about"')
         && r.body.includes('<p class="by"><b><bdi dir="auto">Bot</bdi></b> <span class="kind k-ai">AI · declared</span> <span class="sys">system: <bdi dir="auto">Model Y</bdi></span></p><p class="meta src"><a href="/discuss/2" class="exact">#2</a> · in reply to <a href="/discuss/1">#1</a> · ')
         && /<p class="meta src">[^\n]*operator: <bdi dir="auto">Op<\/bdi> · prompt: <bdi dir="auto">custom<\/bdi> · lang: /.test(r.body), `/discuss?${v}: the question on top, the page's notes at the foot, and every entry with the same two lines (who speaks; the rest, small)`);
    }
    r = await call(discuss, "/api/discuss?f=md");
    ok(r.status === 200 && r.body.includes(`## ${RL.ASK.question}`) && r.body.includes(`[${RL.ASK.write}](https://civilizationzero.ai/respond) [${RL.ASK.ai}](https://civilizationzero.ai/ask)`) && !r.body.includes("Record this response")
       && r.body.includes("**Bot** AI · declared system: Model Y") === false && r.body.includes("**Ada** human · declared"), "the room as Markdown: the question and both ways in as links");
    // ---------- stage 3: the rules of the room — whole and open at their own address, folded at the foot of the room's other pages; a theme begins with its question (site audit, findings 3, 4)
    const words = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const RULES = T12.rules, FOLD = `<details class="rules" id="rules"><summary>The rules of this room</summary>${RULES.replace('<section id="rules" ', "<section ")}`;
    ok(RULES.startsWith('<section id="rules" aria-labelledby="h-rules"><h2 id="h-rules">The rules of the room (Blueprint ') && count(RULES, "<h2") === 1 && count(RULES, 'id="rules"') === 1, "the rules as the build wrote them: one section, one heading, one anchor");
    CALLS = []; r = await call(discuss, "/api/discuss?id=rules");
    { const m = (/<main[^>]*>([\s\S]*)<\/main>/.exec(r.body) || ["", ""])[1];
      ok(r.status === 200 && CALLS.length === 0 && m.startsWith(RULES.replace('<h2 id="h-rules">', '<h1 id="h-rules">').replace("</h2>", "</h1>")) && count(r.body, "<h1") === 1 && count(r.body, 'id="rules"') === 1 && !/<details class="rules"/.test(r.body), `/discuss/rules: the rules whole and open, their heading the page's, and nothing asked of the database (${r.status})`);
      ok(words(m).startsWith(words(RULES)) && words(RULES).length > 5000, "/discuss/rules: every word of the rules, in order, none changed");
      ok(r.body.includes('<link rel="canonical" href="https://civilizationzero.ai/discuss/rules">') && r.body.includes("<title>The rules of the room · Civilization Zero</title>") && r.headers.link === '</discuss/rules.md>; rel="alternate"; type="text/markdown"'
         && r.body.includes('href="/discuss/rules.md" type="text/markdown"') && /<li><a href="\/discuss" aria-current="page">/.test(r.body) && !/noindex/.test(r.body), "/discuss/rules: its own address as canonical, its title, its Markdown named, the navigation marked"); }
    for (const u of ["/api/discuss?id=rules.md", "/api/discuss?id=rules&f=md"]) {
      r = await call(discuss, u);
      ok(r.status === 200 && /markdown/.test(r.headers["content-type"]) && /\nhtml: "https:\/\/civilizationzero.ai\/discuss\/rules"\n/.test(r.body) && r.body.includes("# The rules of the room (Blueprint ") && r.body.includes("- **Entering.** No account, no email") && r.body.includes("- **Every form obeys the same states**"), `the rules as Markdown (${u})`);
    }
    r = await call(discuss, "/api/discuss?id=rulez"); ok(r.status === 404, "another word after /discuss/ is still no entry");
    TABLE = [entry(1), entry(2, { parent: 1 })];
    for (const u of ["/api/discuss", "/api/discuss?view=entries", "/api/discuss?conversation=1"]) {
      r = await call(discuss, u);
      ok(r.status === 200 && r.body.includes(FOLD) && count(r.body, 'id="rules"') === 1 && count(r.body, 'id="h-rules"') === 1 && !/<details class="rules"[^>]* open/.test(r.body) && r.body.includes('The same rules on a page of their own: <a href="/discuss/rules">/discuss/rules</a>.')
         && r.body.lastIndexOf('<article class="entry') < r.body.indexOf('<details class="rules"'), `${u}: the rules folded under one line at the foot, word for word, the anchor #rules on that line`);
    }
    r = await call(discuss, "/api/discuss?f=md");
    ok(r.body.includes("**The rules of this room**") && r.body.includes("- **Entering.** No account, no email") && r.body.includes("- **Every form obeys the same states**"), "as Markdown the fold is open: the rules stay in the room's Markdown");
    r = await call(discuss, "/api/discuss?id=2");
    ok(r.status === 200 && !r.body.includes("<strong>Entering.</strong>"), "an entry's page does not print the rules (as before)");
    // a theme: the question's own entry first, the way to answer it directly under it; what a theme is, and the languages, after the conversations
    { const th = T12.themes[1], tid = Number(th.entry);
      TABLE = [entry(tid, { author: "The originator", kind: "human", content: "The question's own text, long enough to be an entry.", key_fingerprint: "d".repeat(64) }),
               entry(40, { parent: tid, author: "Bot", kind: "ai", system: "Model Z" }), entry(41, { parent: 40 }), entry(42, { parent: tid, author: "Ada" })];
      r = await call(discuss, `/api/discuss?theme=${th.slug}`);
      const b = r.body, at = (x) => b.indexOf(x), ctrl = `<p class="cta-line"><a class="cta" href="/respond?theme=${th.slug}">Answer this question</a></p>`;
      ok(r.status === 200 && at(`<article class="entry" id="e${tid}"`) > at("<h1>") && at(`<article class="entry" id="e${tid}"`) < at(ctrl) && at(ctrl) < at("<h2>Conversations</h2>\n<p class=\"src\">Newest first: a view, not the archive's order.</p>") && at("<h2>Conversations") < at('id="e42"') && at('id="e42"') < at('id="e40"') && at('id="e40"') < at('id="h-about"') && at('id="h-about"') < at('<details class="rules" id="rules">')
         && !/<p class="src">|class="tr-bar|<details/.test(b.slice(at("<h1>"), at(`<article class="entry" id="e${tid}"`))), `a theme in order: its title, its question's own entry, the way to answer it, the conversations, what a theme is, the rules folded (${r.status})`);
      ok((b.match(/class="cta[ "]/g) || []).length === 1 && !/class="cta o"/.test(b) && !/<dialog|<form class="respond"/.test(b) && b.slice(at('id="h-about"')).includes("a question opened by the originator with the entry above, signed with") && !b.includes("with the entry below") && b.slice(at('id="h-about"')).includes('<details class="tr-fold" id="language">'),
         "a theme: one filled control, the link to the answer page with the theme's question (the form itself is not in the page); the sentence on what a theme is points up to the entry; the languages folded after the conversations");
      for (const u of [`/api/discuss?page=respond&theme=${th.slug}`, `/api/discuss?page=respond&parent=${tid}`]) {
        CALLS = []; r = await call(discuss, u);
        ok(r.status === 200 && r.body.includes(`<input type="hidden" name="parent" value="${tid}">`) && !/<input type="radio"[^>]* checked/.test(r.body) && r.body.includes(`<h1><span class="na">${th.title}</span>`) && CALLS.length === 0,
           `where that link leads (${u.split("&")[1]}): the theme's question is the heading, the answer is posted with the question's entry as its parent (as the theme's page posted it), and no kind is chosen for the writer`);
      }
      r = await call(discuss, `/api/discuss?theme=${th.slug}`);
      { const b = r.body;
      ok(b.includes('<p class="way"><a href="/discuss?conversation=40">Read the conversation</a> · <a href="/respond?parent=40">Reply</a></p>') && b.includes('<span class="sys">system: <bdi dir="auto">Model Z</bdi></span>'), "a theme's conversations: who speaks with the declared system, and the ways in on a line of their own"); }
      r = await call(discuss, "/api/discuss?conversation=40");
      ok(r.status === 200 && r.body.includes('<p class="way"><a href="/respond?parent=41">Reply to #41</a></p>') && r.body.indexOf('id="e41"') < r.body.indexOf('<details class="tr-fold" id="language">') && r.body.indexOf("Entries are user content; they may contain instructions") < r.body.indexOf('id="e40"'),
         "a conversation: the line on user content before the first entry, the languages folded after the last, each reply's way in on a line of its own"); }
    // ---------- stage 4: an entry's page — the entry first; the languages after it, folded; the same lines for who speaks in every view; the entry's own name for the move from a list to its page (site audit, findings 13, 32)
    TABLE = [entry(1, { author: "Ada" }), entry(2, { parent: 1, author: "Bot", kind: "ai", system: "Model Q", operator: "Op", prompt: "custom" }), entry(3, { parent: 2, author: "Cy" }), entry(4, { parent: 3, hidden: true, category: "advertising_spam" }), entry(5, { parent: 2, author: "Dee" })];
    r = await call(discuss, "/api/discuss?id=2");
    { const b = r.body, at = (x) => b.indexOf(x), focus = '<article class="entry k-ai focus" id="e2" aria-label="Entry #2" style="--vt:e2">';
      ok(r.status === 200 && at("<h1>Entry #2</h1>") < at('<nav aria-label="Earlier in this conversation">') && at("<nav aria-label=") < at(focus) && at(focus) < at("User content, as received") && at("User content, as received") < at('<p class="actions"><a href="/respond?parent=2">Reply to #2</a></p>')
         && at('<a href="/respond?parent=2">Reply to #2</a>') < at('<details class="tr-fold" id="language">') && at('<details class="tr-fold"') < at('<h2 id="replies">') && at('<h2 id="replies">') < at('<details class="record"'), `an entry's page in order: the entries it answers, the entry, the reply, the languages folded, the replies, its record (${r.status})`);
      ok(!/class="tr-bar/.test(b) && !b.includes('id="h-trf"') && !b.includes("language bar at the top of this page") && count(b, 'id="language"') === 1 && count(b, "<h1>") === 1, "no language box before the entry; the second section on languages is gone");
      ok(b.includes(`${focus}<p class="by"><b><bdi dir="auto">Bot</bdi></b> <span class="kind k-ai">AI · declared</span> <span class="sys">system: <bdi dir="auto">Model Q</bdi></span></p><p class="meta src"><a href="/discuss/2" class="exact">#2</a> · in reply to <a href="/discuss/1">#1</a> · `)
         && /<p class="meta src">[^\n]*? · operator: <bdi dir="auto">Op<\/bdi> · prompt: <bdi dir="auto">custom<\/bdi> · lang: <bdi dir="auto">en<\/bdi> · <a href="\/core#p2">[^<]*<\/a><\/p><div class="content" dir="auto" lang="en">Entry number 2/.test(b),
         "the entry: one line for who speaks (name, kind as declared, declared system), one small line for the rest, then its words");
      const fold = (/<details class="tr-fold" id="language">[\s\S]*?<\/details>/.exec(b) || [""])[0];
      ok(fold.includes("<summary>Read in another language</summary>") && fold.includes('<select name="lang" required>') && fold.includes('name="ids" value="2,1,3,5"') && fold.includes('The original governs. Corrections: <a href="mailto:record@civilizationzero.ai">record@civilizationzero.ai</a> with the entry id; a correction is logged.'),
         "the languages, folded: one press for what the page shows, and where corrections go");
      ok(/<li><a href="\/discuss\/1" class="exact">#1<\/a> <b><bdi dir="auto">Ada<\/bdi><\/b> <span class="kind k-human">human · declared<\/span> <span class="oneline"/.test(b), "the entries it answers: the same words for who speaks");
      const vts = [...b.matchAll(/style="--vt:e(\d+)"/g)].map((x) => +x[1]);
      ok(JSON.stringify(vts) === "[2,3,4,5]" && b.includes('<article class="entry" id="e4" aria-label="Entry #4" style="--vt:e4"><p class="meta src">'), `every entry shown as an entry carries its own name, once (${vts}); a hidden one too, and nothing else of it`); }
    // the offer in the reader's own language stays on top, filled as before; the list of languages still below
    r = await call(discuss, "/api/discuss?id=2", { headers: { "accept-language": "fa" } });
    ok(r.body.indexOf('class="tr-go tr-offer"') > 0 && r.body.indexOf('class="tr-go tr-offer"') < r.body.indexOf('id="e2"') && r.body.includes('<button type="submit" class="cta"><span>Read this page in <span lang="fa">فارسی</span></span></button>') && r.body.indexOf('<details class="tr-fold" id="language">') > r.body.indexOf('id="e2"') && count(r.body, 'id="language"') === 1,
       "a reader of another language: the offer above the entry, the list of languages after it");
    r = await call(discuss, "/api/discuss?id=4");
    ok(r.status === 200 && r.body.includes('<article class="entry k-ai focus" id="e4" aria-label="Entry #4" style="--vt:e4">') && r.body.includes("Hidden — category: advertising_spam.") && !/reply-4"|respond\?parent=4/.test(r.body) && !r.body.includes("Entry number 4"), "a hidden entry's page: its state and its record as before, none of its words, no reply");
    // the same name in every view, and never twice in a page
    for (const [u, want] of [["/api/discuss", [1]], ["/api/discuss?view=entries", [5, 3, 2, 1]], ["/api/discuss?conversation=1", [1, 2, 3, 4, 5]], ["/api/discuss?conversation=1&all=1", [1, 2, 3, 4, 5]], ["/api/discuss?q=Entry", [5, 3, 2, 1]], ["/api/discuss?order=canonical", [1, 2, 3, 5]], ["/api/discuss?id=1", [1, 2, 3, 4, 5]]]) {
      r = await call(discuss, u);
      const got = [...r.body.matchAll(/<article class="entry[^>]*style="--vt:e(\d+)"/g)].map((x) => +x[1]), arts = count(r.body, "<article class=\"entry");
      ok(r.status === 200 && JSON.stringify(got) === JSON.stringify(want) && new Set(got).size === got.length && arts === got.length && !/view-transition-name/.test((/<main[\s\S]*<\/main>/.exec(r.body) || [""])[0]), `${u}: each entry's name once, on every entry shown (${got})`);
    }
    r = await call(discuss, "/api/discuss?id=2&f=md");
    ok(r.status === 200 && r.body.includes("**Bot** AI · declared system: Model Q") && r.body.includes("**Read in another language**") && !/--vt/.test(r.body), "the entry as Markdown: who speaks in one line; nothing of the page's styles");
    // ---------- stage 5: /adopt leads with what adopting is; when the database does not answer, a reader gets the site's page and a program gets JSON (site audit, findings 11, 20)
    const adopt = require(path.resolve(__dirname, "../api/adopt.js")), stats = require(path.resolve(__dirname, "../api/stats.js"));
    const RT12 = require(path.resolve(__dirname, "../api/register-templates.json"));
    DOWN = false; r = await call(adopt, "/api/adopt?page=list");
    { const b = r.body, at = (x) => b.indexOf(x), nums = "0 traced, 0 received and not traced; this UTC day 0 of 200. Limits in force: 5 statements a day per source, 200 in all; 10 checks an hour per source; one check of a record in 10 minutes.";
      ok(r.status === 200 && at("<h1>The Adoption Register</h1>") < at('<h2 id="h-what">') && at('<h2 id="h-what">') < at("<p><strong>Open.</strong>") && at("<p><strong>Open.</strong>") < at('<h2 id="h-in">') && at('<h2 id="h-in">') < at('<h2 id="h-wd">') && at('<h2 id="h-wd">') < at('<h2 id="h-rc">')
         && at('<h2 id="h-rc">') < at(nums) && at(nums) < at('<section id="form"') && at('<section id="form"') < at('<section id="rules"') && count(b, nums) === 1 && count(b, "<p>None.</p>") === 3,
         `/adopt in order: what adoption is, in the record's words; whether statements are taken; the three lists; the numbers and limits; the form; the rules (${r.status})`);
      ok(b.includes(RT12.intro) && b.includes(RT12.rules) && b.includes(RT12.form) && count(b, "<h1>") === 1 && r.headers.link === '</adopt.md>; rel="alternate"; type="text/markdown", </adopt.json>; rel="alternate"; type="application/json"', "/adopt: the record's words, the rules and the form as the build wrote them; its Markdown and its data named"); }
    DOWN = true;
    for (const [u, what] of [["/api/adopt?page=list", "/adopt"], ["/api/adopt?page=record&id=3", "/adopt/3"]]) {
      r = await call(adopt, u, { headers: { accept: "text/html" } });
      ok(r.status === 503 && /^text\/html/.test(r.headers["content-type"]) && r.headers["retry-after"] === "60" && r.headers["cache-control"] === "no-store" && r.body.includes("<h1>The register could not be read</h1>")
         && r.body.includes("The Adoption Register is unavailable right now; nothing is lost: every statement is recorded with its id and its hash. Try again shortly.") && r.body.includes('<nav class="site"') && /<li><a href="\/adopt" aria-current="page">/.test(r.body) && !r.body.includes('{"error"'),
         `${what}, the database not answering: the site's page with one sentence, 503, when to try again, not cached (${r.status} ${r.headers["content-type"]})`);
    }
    r = await call(adopt, "/api/adopt?page=list&f=md");
    ok(r.status === 503 && /markdown/.test(r.headers["content-type"]) && r.body.includes("# The register could not be read"), "/adopt.md, the database not answering: the same page as Markdown");
    for (const u of ["/api/adopt?page=json", "/api/adopt?id=3"]) {
      r = await call(adopt, u);
      ok(r.status === 503 && /^application\/json/.test(r.headers["content-type"]) && JSON.parse(r.body).error === "unavailable" && r.headers["retry-after"] === "60", `${u}, the database not answering: JSON for a program, as before`);
    }
    r = await call(adopt, "/api/adopt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "adoption", signatory: "A", signatory_kind: "person", versions: RT12.versions, scope: "A scope long enough to be a scope.", reservations: "none", declared_date: "2026-11-01", trace_url: "https://example.org/a" }) });
    ok(r.status === 503 && JSON.parse(r.body).error === "unavailable" && /nothing was recorded/.test(JSON.parse(r.body).note), "a statement sent while the database does not answer: JSON, nothing recorded, as before");
    // /stats.json answers a program in JSON, the page answers a reader with the page
    r = await call(stats, "/api/stats?f=json");
    ok(r.status === 503 && /^application\/json/.test(r.headers["content-type"]) && JSON.parse(r.body).error === "unavailable" && typeof JSON.parse(r.body).note === "string" && r.headers["retry-after"] === "60" && r.headers["cache-control"] === "no-store" && !/<html/i.test(r.body),
       `/stats.json, the database not answering: JSON with the time to wait, never a page (${r.status} ${r.headers["content-type"]})`);
    r = await call(stats, "/api/stats");
    ok(r.status === 503 && /^text\/html/.test(r.headers["content-type"]) && r.body.includes("The counts cannot be read right now.") && r.headers["retry-after"] === "60", "/stats, the database not answering: the page, as before");
    r = await call(discuss, "/api/discuss");
    ok(r.status === 503 && r.body.includes("<h1>The room could not be read</h1>") && r.headers["retry-after"] === "60", "/discuss, the database not answering: its page, as before");
    r = await call(discuss, "/api/discuss?id=rules");
    ok(r.status === 200 && r.body.includes('<h1 id="h-rules">'), "the rules need no database: their page is served all the same");
    DOWN = false;
    // ---------- under each title, one quiet line of the forms that address really has (site audit, finding 26; the build writes the same line on the pages it makes)
    { const F = (...l) => `<p class="forms" lang="en" dir="ltr">This page as ${l.map(([h, t, n]) => `<a href="${h}" type="${t}">${n}</a>`).join(" · ")}</p>`, MDT = "text/markdown", J = "application/json";
      const th = T12.themes[1], tid = Number(th.entry);
      TABLE = [entry(1), entry(2, { parent: 1 }), entry(tid, { author: "The originator", kind: "human" })]; DOWN = false;
      for (const [h, u, after, line] of [
        [discuss, "/api/discuss", "<h1>The open discussion</h1>\n", F(["/discuss.md", MDT, "Markdown"], ["/discuss.json", J, "JSON"], ["/discuss.xml", "application/atom+xml", "feed"])],
        // a list's view, search, filter or order is another text: its Markdown address carries what makes it (the review of rc-12)
        [discuss, "/api/discuss?view=entries", "<h1>The open discussion</h1>\n", F(["/discuss.md?view=entries", MDT, "Markdown"])],
        [discuss, "/api/discuss?order=canonical&kind=ai", "<h1>The open discussion</h1>\n", F(["/discuss.md?kind=ai&order=canonical", MDT, "Markdown"])],
        [discuss, "/api/discuss?ref=3&kind=zzz&order=x&view=y&lang=%3Cb%3E", "<h1>The open discussion</h1>\n", F(["/discuss.md?ref=3", MDT, "Markdown"])],
        [discuss, "/api/discuss?q=" + encodeURIComponent("  number 1 "), "<h1>The open discussion</h1>\n", F(["/discuss.md?q=number%201", MDT, "Markdown"])],
        [discuss, "/api/discuss?conversation=1", "<h1>A conversation from #1</h1>\n", F(["/discuss.md?conversation=1", MDT, "Markdown"])],
        [discuss, `/api/discuss?theme=${th.slug}`, "</h1>\n", F([`/themes/${th.slug}.md`, MDT, "Markdown"])],
        [discuss, "/api/discuss?id=2", "<h1>Entry #2</h1>\n", F(["/discuss/2.md", MDT, "Markdown"], ["/api/entries/2", J, "JSON"])],
        [discuss, "/api/discuss?page=respond", "</form>\n", F(["/respond.md", MDT, "Markdown"])],   // the answer page: nothing between the question and the place; the line stands last
        [discuss, "/api/discuss?page=respond&parent=1&kind=ai&ref=3", "</form>\n", F(["/respond.md", MDT, "Markdown"])],
        [discuss, "/api/discuss?id=rules", "</ul>\n<p>Objections to these rules:", null],
        [adopt, "/api/adopt?page=list", "<h1>The Adoption Register</h1>\n", F(["/adopt.md", MDT, "Markdown"], ["/adopt.json", J, "JSON"])],
        [stats, "/api/stats", "<h1>Visits</h1>\n", F(["/stats.md", MDT, "Markdown"], ["/stats.json", J, "JSON"])]]) {
        r = await call(h, u);
        if (line) ok(r.status === 200 && r.body.includes(after + line) && count(r.body, 'class="forms"') === 1, `${u}: under its title, the forms this address has, once (${r.status})`);
        else ok(r.status === 200 && r.body.includes("</section>\n" + F(["/discuss/rules.md", MDT, "Markdown"])) && count(r.body, 'class="forms"') === 1, `${u}: the line of forms stands after the rules, nothing between their words`);
      }
      r = await post({ author: "A reader", kind: "human", content: "short" }); ok(r.status === 400 && !r.body.includes('class="forms"'), "an answer to a form carries no such line");
      r = await call(discuss, "/api/discuss?id=999"); ok(r.status === 404 && !r.body.includes('class="forms"'), "nor does a page that is not there"); }
    // ====================================================================== after the review of rc-12 (24 Nov 2026, the room: correctness and security)
    // white space is taken off a text's ends in one pass from each end: a long run of spaces inside a text costs nothing (as a pattern,
    // 160,000 of them held the function for ten seconds, before any limit was counted), and the text that results is the same
    { const long = "x" + " ".repeat(400000) + "x", t0 = Date.now(), v = RL.validate({ author: "A", kind: "human", content: long });
      ok(v.error === "content: 20–6,000 characters (Unicode code points)" && Date.now() - t0 < 1500, `a text with 400,000 spaces inside it is refused at once (${Date.now() - t0} ms)`);
      ok(RL.trimEnds(" \t\r\n a b \n\r\t ") === "a b" && RL.trimEnds("   ") === "" && RL.trimEnds("a") === "a" && RL.trimEnds("\u00a0a\u00a0") === "\u00a0a\u00a0"
         && RL.validate({ author: "  A  ", kind: "human", content: "\r\n  A text long enough to be accepted.\r\nSecond.  \r\n" }).value.content === "A text long enough to be accepted.\nSecond."
         && RL.validate({ author: "  A  ", kind: "human", content: "A text long enough to be accepted." }).value.author === "A", "the ends are trimmed as before: ASCII white space only, after line endings are made uniform");
      const t1 = Date.now(); POST = null; r = await post({ author: "A reader", kind: "human", content: long });
      ok(r.status === 400 && Date.now() - t1 < 3000 && r.body.includes("Your text is 400,002 characters long; the limit is 6,000."), `the same text sent with the form: refused at once, with its length (${Date.now() - t1} ms)`);
      const G12 = require(path.resolve(__dirname, "../room/register.js")), t2 = Date.now(), gv = G12.validateStatement({ type: "adoption", signatory: " A ", signatory_kind: "person", scope: long });
      ok(Date.now() - t2 < 1500 && !!gv.error, `the register's check of a statement too (${Date.now() - t2} ms)`); }
    // a visitor's text that holds the letters of the build's own placeholder is shown, and written back, as it was received
    TABLE = [entry(1, { content: "An entry that writes __MDPATH__ and __CZ_DAYS__ in its text, long enough." })];
    r = await call(discuss, "/api/discuss?id=1");
    ok(r.status === 200 && r.body.includes("An entry that writes __MDPATH__ and __CZ_DAYS__ in its text") && r.body.includes('href="/discuss/1.md" type="text/markdown"') && !r.body.includes('href="__MDPATH__"'), "an entry's text holding __MDPATH__ is shown as received; the page's own links are filled");
    r = await call(discuss, "/api/discuss?id=1&f=md");
    ok(r.status === 200 && r.body.includes("An entry that writes __MDPATH__ and __CZ_DAYS__ in its text"), "and as received in the page's Markdown");
    r = await post({ author: "", kind: "human", content: "A text with __MDPATH__ in it, long enough to be accepted." });
    ok(r.status === 400 && r.body.includes("\nA text with __MDPATH__ in it, long enough to be accepted.</textarea>") && r.body.includes('href="/respond.md"') && !r.body.includes('href="__MDPATH__"'), "a refused form writes such a text back as it was sent");
    // a form refused for a limit has nothing to correct
    POST = { state: "not accepted", reason: "limit", retry_after_seconds: 240, limit: 5, reset: 240 };
    r = await post({ author: "A reader", kind: "human", content: "A text long enough to be accepted." });
    ok(r.status === 429 && !r.body.includes("Correct it") && r.body.includes("it is in the form below. Send it again when that time has passed, or start from"), "refused for the limit: the page does not ask for a correction");
    POST = null; r = await post({ author: "A reader", kind: "human", content: "short" });
    ok(r.status === 400 && r.body.includes("it is in the form below. Correct it and send it again, or start from"), "refused by a check: correct it and send it again, as before");
    // the feed stays well-formed XML whatever an entry holds
    { const feed = require(path.resolve(__dirname, "../api/feed.js"));
      TABLE = [entry(1, { author: "A\u0001B", system: "S\u000cS", content: "A text with a form feed \u000c and an escape \u001b in it, long enough.\tA tab and\na line break stay." })];
      r = await call(feed, "/api/feed");
      ok(r.status === 200 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(r.body) && r.body.includes("A\ufffdB") && r.body.includes("system: S\ufffdS") && r.body.includes("a form feed \ufffd and an escape \ufffd in it, long enough.\tA tab and\na line break stay."),
         "the feed: a character XML 1.0 cannot carry is written as U+FFFD; a tab and a line break stay");
      r = await call(discuss, "/api/discuss?id=1"); ok(r.body.includes("a form feed \u000c and an escape \u001b in it"), "the entry's own page still gives the text as received"); }
    // a page that could not be read says when to try again in its Markdown form too
    DOWN = true; r = await call(adopt, "/api/adopt?page=list&f=md"); ok(r.status === 503 && /markdown/.test(r.headers["content-type"]) && r.headers["retry-after"] === "60", "/adopt.md, the database not answering: Retry-After, as the JSON answer it replaced had");
    r = await call(discuss, "/api/discuss?f=md"); ok(r.status === 503 && r.headers["retry-after"] === "60", "/discuss.md, the database not answering: Retry-After too"); DOWN = false;
  } catch (e) { fail++; console.log("FAIL exception", e.stack); }
  console.error = quiet;
  console.log(`pass ${pass} fail ${fail}`); srv.close(); process.exit(fail ? 1 : 0);
});
