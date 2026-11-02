// The visit counter (middleware.js) and the public counts (/stats). Run: node site/test/visits.test.mjs
// middleware.js is loaded as an ES module (Vercel bundles it); the database is stubbed (global fetch). Nothing leaves the machine.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here = dirname(fileURLToPath(import.meta.url)), SITE = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "czmw-")); writeFileSync(join(tmp, "mw.mjs"), readFileSync(join(SITE, "middleware.js")));
const M = await import(join(tmp, "mw.mjs"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
for (const [ua, want] of [[CHROME, "human"], [IPHONE, "human"], ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "human"],
  ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "google"], ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "anthropic"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "openai"], ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "meta"],
  ["Twitterbot/1.0", "x"], ["Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)", "link-preview"], ["WhatsApp/2.23.20.0", "link-preview"],
  ["curl/8.5.0", "script"], ["Python-urllib/3.12", "script"], ["node", "script"], ["", "script"], ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36", "script"],
  ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "seo"], ["Mozilla/5.0 (compatible; SomeNewBot/0.1)", "other-bot"]])
  ok(M.agentOf(ua) === want, `agent ${JSON.stringify(ua.slice(0, 50))} → ${M.agentOf(ua)} want ${want}`);
for (const [p, want] of [["/", "/"], ["/core/", "/core"], ["/core.fa", "/core.fa"], ["/discuss/12", "/discuss/12"], ["//core", "/core"], ["/%3Cscript%3E", "(other)"], ["/" + "a".repeat(200), "(other)"], ["/themes/can-an-ai-say-no", "/themes/can-an-ai-say-no"]])
  ok(M.pathKey(p) === want, `path ${p.slice(0, 30)} → ${M.pathKey(p)}`);
for (const [r, want] of [["https://x.com/czrecord/status/1", "x.com"], ["https://www.google.com/", "google.com"], ["https://civilizationzero.ai/core", ""], ["https://www.civilizationzero.ai/", ""], ["https://civilization-zero-abc-sharifmatrix.vercel.app/", ""], ["not a url", ""], ["", ""]])
  ok(M.refHost(r) === want, `referer ${r} → ${M.refHost(r)}`);
const req = (path, headers = {}, method = "GET") => new Request("https://civilizationzero.ai" + path, { method, headers });
let v = M.visitOf(req("/core?x=1", { "user-agent": CHROME, accept: "text/html,application/xhtml+xml", referer: "https://t.co/abc", "x-vercel-ip-country": "my", "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
ok(v && v.p_path === "/core" && v.p_agent === "human" && v.p_ref === "t.co" && v.p_country === "MY" && v.p_ip === "" && v.p_ua === "", "a browser's page view: path without query, referring domain, country, and, since CZ 1433, no address and no user agent " + JSON.stringify(v));
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "text/html", "sec-purpose": "prefetch" })) === null, "a prefetch is not a view");
// stage 5 (CZ 1433): the site's own speculation rule fetches a page as the reader presses its link; tagged "cz", it is the visit
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "text/html", "sec-purpose": "prefetch", "sec-speculation-tags": '"cz"' })) !== null, "this site's own press-prefetch (tag \"cz\") is a view");
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "text/html", "sec-purpose": "prefetch", "sec-speculation-tags": 'null, "cdn-rule"' })) === null, "another rule's prefetch is not a view");
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "text/html", "sec-purpose": "prefetch;prerender", "sec-speculation-tags": '"cz"' })) === null, "a prerender is never a view, even tagged");
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "application/json" })) === null, "a browser asking for JSON is not a page view");
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "text/html" }, "HEAD")) === null, "HEAD is not a view");
v = M.visitOf(req("/", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", accept: "*/*", referer: "https://example.com/", "x-real-ip": "66.249.66.1" }));
ok(v && v.p_agent === "google" && v.p_ip === "" && v.p_ua === "" && v.p_ref === "" && v.p_country === "", "a crawler: counted by kind only, no address, no referrer");
// the middleware itself: always lets the request through, and sends the count after the response
const sent = []; globalThis.fetch = async (url, opt) => { sent.push({ url, body: JSON.parse(opt.body) }); return new Response("null"); };
process.env.SUPABASE_URL = "https://db.example"; process.env.SUPABASE_ANON_KEY = "k"; process.env.CZ_ADMIN_TOKEN = "t";
const waits = []; const ctx = { waitUntil: (p) => waits.push(p) };
let r = M.default(req("/press", { "user-agent": IPHONE, accept: "text/html", "x-real-ip": "198.51.100.7" }), ctx); await Promise.all(waits);
ok(r.headers.get("x-middleware-next") === "1" && r.body === null, "the middleware lets the request through");
ok(sent.length === 1 && sent[0].url === "https://db.example/rest/v1/rpc/cz_count" && sent[0].body.p_path === "/press" && sent[0].body.p_token === "t" && sent[0].body.p_ip === "" && sent[0].body.p_ua === "", "one count sent, after the response");
globalThis.fetch = async () => { throw new Error("database down"); };
waits.length = 0; r = M.default(req("/", { "user-agent": CHROME, accept: "text/html" }), ctx); await Promise.all(waits);
ok(r.headers.get("x-middleware-next") === "1", "a database that fails never fails the page");
r = M.default({ method: "GET", headers: null, url: "::" }, ctx);
ok(r.headers.get("x-middleware-next") === "1", "a malformed request still goes on");
// the matcher keeps files and APIs out
const re = new RegExp("^" + M.config.matcher[0].replace("/((?!", "/(?:(?!").replace(/\)\.\*\)$/, ").*)") + "$");
for (const [p, want] of [["/", true], ["/core", true], ["/core.fa", true], ["/discuss/3", true], ["/stats", true], ["/core.txt", false], ["/og.png", false], ["/api/entries", false], ["/.well-known/security.txt", false], ["/archive/cz-bundle-1.0.1.tar", false], ["/sitemap.xml", false], ["/stats.json", false], ["/favicon.ico", false]])
  ok(re.test(p) === want, `matcher ${p} → ${re.test(p)}`);
// how machines come in (v12, CZ 1433): their own matcher patterns, their own count, by kind of client only
const reMd = new RegExp("^" + M.config.matcher[1].replace("/(.*", "/(?:.*") + "$"), reTxt = new RegExp("^" + M.config.matcher[2].replace("/(", "/(?:") + "$");
for (const [p, want] of [["/core.md", true], ["/discuss/7.md", true], ["/index.md", true], ["/llms.txt", true], ["/core.txt", true], ["/record.txt", true], ["/robots.txt", false], ["/core", false], ["/core.fa.txt", false]])
  ok((reMd.test(p) || reTxt.test(p)) === want, `matcher (entrances) ${p}`);
for (const [p, want] of [["/core.md", "/core.md"], ["/discuss/7.md", "/discuss/{id}.md"], ["/adopt/3.md", "/adopt/{id}.md"], ["/themes/can-an-ai-say-no.md", "/themes/can-an-ai-say-no.md"], ["/llms.txt", "/llms.txt"], ["/core", null], ["/robots.txt", null], ["/%3C.md", "(other)"], ["/api/x.md", "(other)"], ["/LLMS.TXT", "/llms.txt"], ["/core.md/", "/core.md"], ["/core.fa.md", "/core.fa.md"], ["/stats.md", "/stats.md"], ["/discuss/x.md", "(other)"]])
  ok(M.entranceKey(p) === want, `entrance key ${p} → ${M.entranceKey(p)}`);
v = M.visitOf(req("/discuss/12.md", { "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "x-real-ip": "1.2.3.4", referer: "https://a.example/" }));
ok(v && v.entrance === true && v.p_path === "/discuss/{id}.md" && v.p_agent === "anthropic" && Object.keys(v).sort().join() === "entrance,p_agent,p_path", "an entrance: address and kind, nothing else");
ok(M.visitOf(req("/llms.txt", { "user-agent": CHROME })).p_agent === "human", "a browser reading llms.txt: an entrance by a browser");
ok(M.visitOf(req("/core.md", { "user-agent": CHROME, "sec-purpose": "prefetch" })) === null, "a prefetch of a Markdown address is not an entrance");
sent.length = 0; globalThis.fetch = async (url, opt) => { sent.push({ url, body: JSON.parse(opt.body) }); return new Response("null"); };
waits.length = 0; M.default(req("/core.md", { "user-agent": "curl/8.5.0" }), ctx); await Promise.all(waits);
ok(sent.length === 1 && sent[0].url === "https://db.example/rest/v1/rpc/cz_count_entrance" && sent[0].body.p_path === "/core.md" && sent[0].body.p_agent === "script" && !("entrance" in sent[0].body), "an entrance goes to cz_count_entrance");
// /stats renders the counts (mock database)
const require = createRequire(import.meta.url);
process.env.CZ_SALT = "x".repeat(40);
const stats = { first_day: "2026-11-01", visitors_counted_until: "2026-11-02T10:23Z", entrances_since: "2026-11-02", entrances: [{ path: "/core.md", agent: "anthropic", n: 4 }, { path: "/llms.txt", agent: "human", n: 1 }, { path: "<x>", agent: "script", n: 1 }], days: [{ day: "2026-11-02", views: 12, visitors: 5, automated: 40 }, { day: "2026-11-01", views: 30, visitors: 9, automated: 100 }],
  pages: [{ key: "/", n: 20 }, { key: "/core", n: 7 }, { key: "(other)", n: 1 }], refs: [{ key: "x.com", n: 3 }, { key: "<b>evil.com", n: 1 }], countries: [{ key: "MY", n: 9 }], automated: [{ key: "google", n: 30 }, { key: "script", n: 50 }] };
globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("cz_visit_stats") ? stats : null), { status: 200 });
process.env.SUPABASE_URL = "https://db.example";
const page = require(join(SITE, "api/stats.js"));
const call = (url) => new Promise((resolve) => { const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, end(b) { resolve({ s: this.statusCode, h: this.h, b: String(b || "") }); } }; page({ url, method: "GET", headers: {} }, res); });
let o = await call("/api/stats");
ok(o.s === 200 && /<h1>Visits<\/h1>/.test(o.b) && o.b.includes('<td class="num">30</td>') && o.b.includes("x.com") && o.b.includes("&lt;b&gt;evil.com") && !o.b.includes("<b>evil.com") && o.b.includes("Scripts and checks") && /s-maxage=300/.test(o.h["cache-control"]), "the page shows the counts, escaped, cached five minutes");
o = await call("/api/stats?f=json"); const j = JSON.parse(o.b);
ok(o.s === 200 && j.days.length === 2 && j.first_day === "2026-11-01" && /without cookies or identifiers/.test(j.what), "/stats.json");
o = await call("/api/stats?x=1"); ok(o.s === 400, "/stats refuses parameters");
o = await call("/api/stats");
ok(o.b.includes('<p id="visitors">Until ') && o.b.includes("the originator stopped it") && o.b.includes('5 <span class="src">(until 10:23 UTC)</span>'), "/stats: the visitors' count marked as stopped, the last day partial");
ok(o.b.includes('<h2 id="h-entrances">How machines come in</h2>') && o.b.includes("<code>/core.md</code></td><td>Anthropic (Claude)</td>") && o.b.includes("<td>Browsers</td>") && o.b.includes("<code>&lt;x&gt;</code>"), "/stats: machines' entrances, escaped");
ok(/visitors_counted_until/.test(j.what) && /entrances/.test(j.what), "/stats.json says what the new fields are");
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
