// The visit counter (middleware.js) and the public counts (/stats). Run: node site/test/visits.test.mjs
// middleware.js is loaded as an ES module (Vercel bundles it); the database is stubbed (global fetch). Nothing leaves the machine.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here = dirname(fileURLToPath(import.meta.url)), SITE = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "czmw-")); writeFileSync(join(tmp, "mw.mjs"), readFileSync(join(SITE, "middleware.js")));
const M = await import(join(tmp, "mw.mjs"));
// the links /ask offers are a switch (build.py, ASK_OPEN_LINKS → api/ask-open.json, "offered"; middleware.js, ASK_OFFERED). Whatever the
// switch says in this commit, both states are tested: M3 is the same middleware with all three links offered, M0 with none (RC 2)
const OFFERED_NOW = JSON.parse(readFileSync(join(SITE, "api/ask-open.json"), "utf8")).offered;
const mwWith = async (names, file) => { const src = readFileSync(join(SITE, "middleware.js"), "utf8"), line = /^export const ASK_OFFERED = \[[^\]\n]*\];$/m;
  if (!line.test(src)) throw new Error("middleware.js: no ASK_OFFERED line"); writeFileSync(join(tmp, file), src.replace(line, `export const ASK_OFFERED = ${JSON.stringify(names)};`)); return import(join(tmp, file)); };
const M3 = await mwWith(["chatgpt", "claude", "perplexity"], "mw3.mjs"), M0 = await mwWith([], "mw0.mjs");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
ok(JSON.stringify(M.ASK_OFFERED) === JSON.stringify(OFFERED_NOW) && M3.ASK_OFFERED.length === 3 && M0.ASK_OFFERED.length === 0, `the middleware counts presses on the links /ask offers, and no others: ${JSON.stringify(M.ASK_OFFERED)} and ${JSON.stringify(OFFERED_NOW)}`);
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
for (const [ua, want] of [[CHROME, "human"], [IPHONE, "human"], ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "human"],
  ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "google"], ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "anthropic-training"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "openai-user"], ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "meta-preview"],
  ["Twitterbot/1.0", "x"], ["Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)", "link-preview"], ["WhatsApp/2.23.20.0", "link-preview"],
  ["curl/8.5.0", "script"], ["Python-urllib/3.12", "script"], ["node", "script"], ["", "script"], ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36", "script"],
  ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "seo"], ["Mozilla/5.0 (compatible; SomeNewBot/0.1)", "other-bot"]])
  ok(M.agentOf(ua) === want, `agent ${JSON.stringify(ua.slice(0, 50))} → ${M.agentOf(ua)} want ${want}`);
// the AI companies' agents by purpose (CZ 1447): each user agent as its company's page gives it (middleware.js names the pages, read
// 16 Nov 2026). Anthropic publishes the tokens only, not whole strings: the Claude-User and Claude-SearchBot strings here are shaped
// like ClaudeBot's, so they test the token, not a string seen in the wild
for (const [ua, want] of [
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot", "openai-training"],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot", "openai-search"],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; robots.txt; +https://openai.com/searchbot", "openai-search"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-AdsBot/1.0; +https://openai.com/adsbot", "openai-other"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "anthropic-user"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)", "anthropic-search"],
  ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-Agent/1.0) Chrome/154.0.0.0 Safari/537.36", "anthropic-agent"],
  ["anthropic-ai", "anthropic-other"],
  ["Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "perplexity-search"],
  ["Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "perplexity-user"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)", "mistral-user"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-Index/1.0; +https://docs.mistral.ai/robots)", "mistral-search"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-Training/1.0; +https://docs.mistral.ai/robots)", "mistral-training"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1) Chrome/W.X.Y.Z Safari/537.36", "amazon-training"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-SearchBot/0.1) Chrome/W.X.Y.Z Safari/537.36", "amazon-search"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-User/0.1) Chrome/W.X.Y.Z Safari/537.36", "amazon-user"],
  ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-training"], ["meta-webindexer/1.1", "meta-search"],
  ["meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-user"], ["meta-externalads/1.1", "meta-other"], ["facebookexternalhit/1.1", "meta-preview"],
  ["DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", "duckduckgo-search"], ["DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)", "duckduckgo-assist"],
  ["Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)", "google"]])
  ok(M.agentOf(ua) === want, `agent by purpose ${JSON.stringify(ua.slice(0, 60))} → ${M.agentOf(ua)} want ${want}`);
for (const [p, want] of [["/", "/"], ["/core/", "/core"], ["/core.fa", "/core.fa"], ["/discuss/12", "/discuss/12"], ["//core", "/core"], ["/%3Cscript%3E", "(other)"], ["/" + "a".repeat(200), "(other)"], ["/themes/can-an-ai-say-no", "/themes/can-an-ai-say-no"]])
  ok(M.pathKey(p) === want, `path ${p.slice(0, 30)} → ${M.pathKey(p)}`);
// only the site's own addresses are keys: nothing a client types becomes a row, or a link, on /stats (review B of RC 1)
for (const p of ["/this-site-is-a-fraud-call-0123456789", "/wp-login.php", "/Core", "/core.md.bak", "/core/x", "/discuss/x", "/discuss/12/x", "/themes", "/themes/A", "/adopt/x", "/404", "/index", "/api", "/ask/open", "/x", "/core.toolong", "/.env",
  "/core.zz", "/core.en", "/core.zh", "/core.zh-hans", "/core.FA", "/core.fa-x", "/core.md", "/core.txt", "/themes/this-site-is-a-fraud", "/themes/can-an-ai-say-no-2", "/themes/x1", "/coreXfa", "/discuss/1234567890123",
  // entry and record numbers as the site gives them: no leading zero, at most six digits (reviews A and B of RC 2)
  "/discuss/007", "/discuss/01", "/adopt/007", "/discuss/0", "/discuss/60123456789", "/adopt/60123456789", "/discuss/1000000", "/adopt/1000000"])
  ok(M.pathKey(p) === "(other)", `not an address of the site: ${p} → ${M.pathKey(p)}`);
for (const p of ["/", "/core", "/record", "/objections", "/ask", "/machine", "/about", "/archive", "/calendar", "/press", "/how-it-is-built", "/embed", "/stats", "/discuss", "/respond", "/adopt", "/admin", "/civilization-zero-infographic",
  "/civilization-zero-evidence-atlas", "/civilization-zero-images", "/core.fa", "/core.zh-Hans", "/discuss/137", "/adopt/1", "/themes/can-an-ai-say-no", "/discuss/136", "/adopt/136", "/discuss/7", "/discuss/999999"])
  ok(M.pathKey(p) === p, `an address of the site is its own key: ${p} → ${M.pathKey(p)}`);
// by name, not by form: every language the Core has as a page and every theme the room lists is a key, as a page and as Markdown, and no other is
{ const langs = readdirSync(join(SITE, "public")).map((f) => (/^core\.([^.]+)\.html$/.exec(f) || [])[1]).filter(Boolean), themes = JSON.parse(readFileSync(join(SITE, "api/discuss-templates.json"), "utf8")).themes.map((t) => t.slug);
  ok(langs.length >= 20 && langs.every((l) => M.pathKey(`/core.${l}`) === `/core.${l}` && M.entranceKey(`/core.${l}.md`) === `/core.${l.toLowerCase()}.md`), `every language of the Core is a key (${langs.length})`);
  ok(themes.length >= 7 && themes.every((t) => M.pathKey(`/themes/${t}`) === `/themes/${t}` && M.entranceKey(`/themes/${t}.md`) === `/themes/${t}.md`), `every theme of the room is a key (${themes.length})`);
  const pages = readdirSync(join(SITE, "public")).filter((f) => /\.html$/.test(f) && f !== "404.html").map((f) => "/" + f.slice(0, -5));
  ok(pages.length >= 34 && pages.every((p) => M.pathKey(p) === p && M.entranceKey(p + ".md") === (p + ".md").toLowerCase()), `every page the build makes is a key, as a page and as Markdown (${pages.length})`); }
for (const p of ["/themes/this-site-is-a-fraud.md", "/core.zz.md", "/core.xx-abcdefgh.md", "/admin.md", "/404.md", "/made-up.md"])
  ok(M.entranceKey(p) === "(other)", `not a Markdown address of the site: ${p} → ${M.entranceKey(p)}`);
for (const [r, want] of [["https://x.com/czrecord/status/1", "x.com"], ["https://www.google.com/", "google.com"], ["https://civilizationzero.ai/core", ""], ["https://www.civilizationzero.ai/", ""], ["https://civilization-zero-abc-sharifmatrix.vercel.app/", ""], ["not a url", ""], ["", ""]])
  ok(M.refHost(r) === want, `referer ${r} → ${M.refHost(r)}`);
const req = (path, headers = {}, method = "GET") => new Request("https://civilizationzero.ai" + path, { method, headers });
let v = M.visitOf(req("/core?x=1", { "user-agent": CHROME, accept: "text/html,application/xhtml+xml", referer: "https://t.co/abc", "x-vercel-ip-country": "my", "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
ok(v && v.p_path === "/core" && v.p_agent === "human" && v.p_ref === "t.co" && v.p_country === "MY" && v.p_ip === "" && v.p_ua === "", "a browser's page view: path without query, referring domain, country, and, since CZ 1433, no address and no user agent " + JSON.stringify(v));
v = M.visitOf(req("/this-site-is-a-fraud-call-0123456789", { "user-agent": CHROME, accept: "text/html", referer: "https://t.co/abc" }));
ok(v && v.p_path === "(other)" && v.p_agent === "human", "a made-up address is counted as (other), never under its own name " + JSON.stringify(v));
ok(M.visitOf(req("/core", { "user-agent": CHROME, accept: "text/html", "sec-purpose": "prefetch" })) === null, "a prefetch is not a view");
ok(M.visitOf(req("/discuss/translating?tl=fa&ids=1&ts=1", { "user-agent": CHROME, accept: "text/html" })) === null, "the translation progress page, refreshing itself, is not a view");
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
ok(v && v.entrance === true && v.p_path === "/discuss/{id}.md" && v.p_agent === "anthropic-training" && Object.keys(v).sort().join() === "entrance,p_agent,p_path", "an entrance: address and kind, nothing else");
ok(M.visitOf(req("/llms.txt", { "user-agent": CHROME })).p_agent === "human", "a browser reading llms.txt: an entrance by a browser");
ok(M.visitOf(req("/core.md", { "user-agent": CHROME, "sec-purpose": "prefetch" })) === null, "a prefetch of a Markdown address is not an entrance");
sent.length = 0; globalThis.fetch = async (url, opt) => { sent.push({ url, body: JSON.parse(opt.body) }); return new Response("null"); };
waits.length = 0; M.default(req("/core.md", { "user-agent": "curl/8.5.0" }), ctx); await Promise.all(waits);
ok(sent.length === 1 && sent[0].url === "https://db.example/rest/v1/rpc/cz_count_entrance" && sent[0].body.p_path === "/core.md" && sent[0].body.p_agent === "script" && !("entrance" in sent[0].body), "an entrance goes to cz_count_entrance");
// a press on one of /ask's links to an assistant (CZ 1447): counted by the link's name alone, only a browser's, never a prefetch, never a page view
v = M3.visitOf(req("/ask/open/claude", { "user-agent": IPHONE, accept: "text/html", referer: "https://civilizationzero.ai/ask", "x-vercel-ip-country": "MY", "x-real-ip": "198.51.100.7" }));
ok(v && v.open === true && v.p_name === "claude" && Object.keys(v).sort().join() === "open,p_name", "a press: the link's name, nothing else " + JSON.stringify(v));
// while /ask offers no link, nothing is counted: not as a press, not as a page view (review B of RC 1)
for (const name of ["chatgpt", "claude", "perplexity"])
  ok(M0.visitOf(req(`/ask/open/${name}`, { "user-agent": IPHONE, accept: "text/html", referer: "https://civilizationzero.ai/ask", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin" })) === null, `no link offered: /ask/open/${name} is not counted`);
{ const one = await mwWith(["claude"], "mw1.mjs"), hd = { "user-agent": CHROME, accept: "text/html" };
  ok((one.visitOf(req("/ask/open/claude", hd)) || {}).p_name === "claude" && one.visitOf(req("/ask/open/chatgpt", hd)) === null && one.visitOf(req("/ask/open/perplexity", hd)) === null, "one link offered: only that link's presses are counted"); }
for (const [p, h, why] of [["/ask/open/chatgpt", { "user-agent": CHROME, "sec-purpose": "prefetch" }, "a prefetch"], ["/ask/open/chatgpt", { "user-agent": CHROME, "sec-purpose": "prefetch", "sec-speculation-tags": '"cz"' }, "even the site's own press-prefetch"],
  ["/ask/open/perplexity", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, "a crawler"], ["/ask/open/chatgpt", { "user-agent": "curl/8.5.0" }, "a script"],
  ["/ask/open/gemini", { "user-agent": CHROME }, "a name it does not serve"], ["/ask/open/chatgpt/", { "user-agent": CHROME }, "a trailing slash (redirected, then counted once)"], ["/ask/open", { "user-agent": CHROME }, "no name"],
  ["/ask/open/ChatGPT", { "user-agent": CHROME }, "another case"]])
  ok(M3.visitOf(req(p, h)) === null && M0.visitOf(req(p, h)) === null, `not counted, and not a page view: ${why} (${p})`);
ok(M3.visitOf(req("/ask/open/chatgpt", { "user-agent": CHROME }, "HEAD")) === null, "a HEAD is not a press");
ok(M.visitOf(req("/ask", { "user-agent": CHROME, accept: "text/html" })).p_path === "/ask", "/ask itself is still a page view");
sent.length = 0; waits.length = 0; r = M3.default(req("/ask/open/perplexity", { "user-agent": CHROME, accept: "text/html" }), ctx); await Promise.all(waits);
ok(r.headers.get("x-middleware-next") === "1" && sent.length === 1 && sent[0].url === "https://db.example/rest/v1/rpc/cz_count_ask_open" && JSON.stringify(sent[0].body) === '{"p_name":"perplexity","p_token":"t"}', "a press goes to cz_count_ask_open: the name and the token, nothing else " + JSON.stringify(sent[0] && sent[0].body));
sent.length = 0; waits.length = 0; r = M0.default(req("/ask/open/perplexity", { "user-agent": CHROME, accept: "text/html" }), ctx); await Promise.all(waits);
ok(r.headers.get("x-middleware-next") === "1" && sent.length === 0, "no link offered: the request goes on, and nothing is sent to the database " + JSON.stringify(sent));
// the redirect (api/page.js): to the assistant, with exactly the short invitation in the query, never cached; nothing counted there
const pageFn = createRequire(import.meta.url)(join(SITE, "api/page.js"));
const SHORT = readFileSync(join(SITE, "prompts/cz-short-1.0.txt"), "utf8");
const hit = (url, method = "GET") => new Promise((resolve) => { const res = { statusCode: 200, h: {}, setHeader(k, x) { this.h[k.toLowerCase()] = x; }, getHeader(k) { return this.h[k.toLowerCase()]; }, end(b) { resolve({ s: this.statusCode, h: this.h, b: String(b || "") }); } };
  Promise.resolve(pageFn({ url, method, headers: { accept: "text/html" } }, res)).catch((e) => resolve({ s: 599, h: {}, b: String(e.stack) })); });
sent.length = 0; let o;
// only a link /ask offers is served (review B of RC 1): with none offered, each of the three names is not found; with one, that one only.
// The function reads "offered" at each request, so both states are tried here whatever this commit offers, and its own list is then restored
ok(JSON.stringify(pageFn.OPEN.offered) === JSON.stringify(OFFERED_NOW), "api/page.js serves the links api/ask-open.json offers");
pageFn.OPEN.offered = [];
for (const name of ["chatgpt", "claude", "perplexity"]) { o = await hit(`/api/page?open=${name}`); ok(o.s === 404 && !o.h.location && !/chatgpt\.com|claude\.ai|perplexity\.ai/.test(o.b), `no link offered: /ask/open/${name} is not found, and names no address (${o.s})`); }
o = await hit("/api/page?open=claude", "HEAD"); ok(o.s === 404 && !o.h.location, "no link offered: HEAD is not found either");
pageFn.OPEN.offered = ["claude"];
o = await hit("/api/page?open=claude"); ok(o.s === 302 && (o.h.location || "").startsWith("https://claude.ai/new?q="), "one link offered: that one is served");
o = await hit("/api/page?open=chatgpt"); ok(o.s === 404 && !o.h.location, "one link offered: another of the three is not found");
pageFn.OPEN.offered = ["chatgpt", "claude", "perplexity"];
for (const [name, base] of [["chatgpt", "https://chatgpt.com/?q="], ["claude", "https://claude.ai/new?q="], ["perplexity", "https://www.perplexity.ai/search?q="]]) {
  o = await hit(`/api/page?open=${name}`); const loc = o.h.location || "";
  ok(o.s === 302 && loc.startsWith(base) && decodeURIComponent(loc.slice(base.length)) === SHORT && o.h["cache-control"] === "no-store" && /noindex/.test(o.h["x-robots-tag"] || ""), `/ask/open/${name} → 302 to ${base}…, the short invitation byte for byte, not cached (${o.s} ${loc.slice(0, 60)})`);
  ok(SHORT.length <= 2000 && loc.length < 8000, `/ask/open/${name}: the prompt (${SHORT.length} characters) within the 2,000 the link generators advise; the address ${loc.length} characters`);
}
o = await hit("/api/page?open=chatgpt", "HEAD"); ok(o.s === 302 && o.b === "" && o.h.location === pageFn.OPEN.to.chatgpt, "HEAD: the same redirect, no body");
o = await hit("/api/page?open=evil"); ok(o.s === 404 && !o.h.location, "another name: not found, no redirect");
o = await hit("/api/page?open=__proto__"); ok(o.s === 404 && !o.h.location, "a name from the object's prototype: not found");
o = await hit("/api/page?open=claude", "POST"); ok(o.s === 405, "POST: refused");
ok(sent.length === 0, "the redirect itself sends nothing to the database (the middleware counts)");
// (the three stay offered to the function for the tests below, which try what it refuses even then; the middleware's copies are M3 and M0)
// review 1-2 C (adversarial). 1. ChatGPT agent, OpenAI's hosted browser, sends a plain Chrome user agent and is named only by
// Signature-Agent "https://chatgpt.com" (RFC 9421 signatures; help.openai.com article 11845367): automated, as Claude-Agent is
const SIGNED = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", accept: "text/html",
  "signature-agent": '"https://chatgpt.com"', "signature-input": 'sig1=("@authority" "signature-agent");tag="web-bot-auth"', signature: "sig1=:AA==:", "x-vercel-ip-country": "US", referer: "https://chatgpt.com/" };
v = M.visitOf(req("/core", SIGNED));
ok(v && v.p_agent === "openai-agent" && v.p_ref === "" && v.p_country === "", "ChatGPT agent (Signature-Agent chatgpt.com) is automated, not a browser " + JSON.stringify(v));
ok(M3.visitOf(req("/ask/open/claude", SIGNED)) === null && M.BOT_KINDS.includes("openai-agent"), "ChatGPT agent's press is not counted, as Claude-Agent's is not");
// 2. a press is a top-level navigation: another site's <img>, fetch(), script or iframe aimed at /ask/open/<name>, run by its readers' real browsers, is not
for (const [dest, mode] of [["image", "no-cors"], ["empty", "no-cors"], ["empty", "cors"], ["script", "no-cors"], ["iframe", "navigate"]])
  ok(M3.visitOf(req("/ask/open/claude", { "user-agent": CHROME, accept: "*/*", "sec-fetch-dest": dest, "sec-fetch-mode": mode, "sec-fetch-site": "cross-site", referer: "https://elsewhere.example/" })) === null
     && M3.visitOf(req("/ask/open/claude", { "user-agent": CHROME, accept: "*/*", "sec-fetch-dest": dest, "sec-fetch-mode": mode, "sec-fetch-site": "same-origin" })) === null, `not a press: Sec-Fetch-Dest ${dest}, Sec-Fetch-Mode ${mode}, from another site or from this one`);
ok((M3.visitOf(req("/ask/open/claude", { "user-agent": CHROME, accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin", "sec-fetch-user": "?1" })) || {}).p_name === "claude", "a press: a navigation of the top-level document, from this site's own page");
// 2b. (review B of RC 1) a press is a press on /ask's own link: another site's link, window or redirect to /ask/open/<name> is a
// top-level navigation too, by its readers' real browsers, and is not counted; nor is an address typed or kept as a bookmark
for (const site of ["cross-site", "same-site", "none"])
  ok(M3.visitOf(req("/ask/open/claude", { "user-agent": CHROME, accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": site, "sec-fetch-user": "?1", referer: "https://elsewhere.example/" })) === null, `not a press on /ask's link: Sec-Fetch-Site ${site}`);
// 3. no other spelling of /ask/open/<name> becomes a page view (pathKey collapses slashes and decodes, after the prefix test)
for (const p of ["/ask//open/claude", "//ask/open/claude", "/ask/open%2Fclaude", "/ask/%6Fpen/claude", "/ask%2Fopen%2Fclaude", "/ASK/OPEN/claude"])
  ok(M.visitOf(req(p, { "user-agent": CHROME, accept: "text/html" })) === null && M3.visitOf(req(p, { "user-agent": CHROME, accept: "text/html" })) === null && M0.visitOf(req(p, { "user-agent": CHROME, accept: "text/html" })) === null, `never a page view: ${p}`);
// 4. the redirect has one job: an "open" it does not serve is not found, never the page named by another parameter
o = await hit("/api/page?open=evil&p=ask"); ok(o.s === 404 && !o.h.location, `open=evil&p=ask: not found, not /ask (${o.s})`);
// 5. iMessage's link previews are not Meta's, Telegram's are not X's (both name the others' crawlers in their user agents)
ok(M.agentOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0") === "link-preview", "iMessage's link preview: a link preview, not Meta's");
ok(M.agentOf("TelegramBot (like TwitterBot)") === "link-preview", "Telegram's link preview: not X's");
// 6. a person in an app's browser is a person, so a press there counts (iOS web views carry no "Safari/"; Pinterest's in-app browser is not its crawler)
for (const ua of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/530.0.0.43.109;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/en_US;FBOP/80]",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.37.70 (iPhone15,2; iOS 18_6; en_US; en; scale=3.00; 1179x2556; 812345678)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.1234",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [Pinterest/Android]"])
  ok(M.agentOf(ua) === "human", `a browser in an app: ${ua.slice(-40)} → ${M.agentOf(ua)}`);
ok(M.agentOf("Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)") === "link-preview", "Pinterest's crawler is still a link preview");
// 7. v15's cz_visit_stats lists every automated key the window can hold: the keys counted now, and the five counted together until the split
{ const sql = readFileSync(join(SITE, "room/ask-open-v15.sql"), "utf8"), lim = Number((/kind = 'bot' group by key order by 2 desc, 1 limit (\d+)/.exec(sql) || [])[1]);
  ok(lim >= M.BOT_KINDS.length + 5, `cz_visit_stats lists every automated key: limit ${lim}, keys ${M.BOT_KINDS.length} + 5`); }
// review 1-2 A: one "open" only, so that what is counted is where the reader is sent; another "open" in the query is neither counted nor followed
o = await hit("/api/page?open=chatgpt&open=claude"); ok(o.s === 404 && !o.h.location, `two values of open: not found (${o.s})`);
o = await hit("/api/page?open="); ok(o.s === 404 && !o.h.location, "an empty open: not found");
ok(M3.visitOf(req("/ask/open/claude?open=chatgpt", { "user-agent": CHROME, accept: "text/html" })) === null, "a press whose query names another open is not counted");
ok((M3.visitOf(req("/ask/open/claude?utm_source=x", { "user-agent": CHROME, accept: "text/html" })) || {}).p_name === "claude", "a press with a sharer's tag is counted");
ok((M3.visitOf(req("/ask/open/claude", { "user-agent": CHROME, accept: "text/html" })) || {}).p_name === "claude", "a press from a browser that sends no Sec-Fetch headers (older Safari) is counted");
// ChatGPT agent's other requests: an entrance by kind, a signed agent of another company is an automated client
ok(M.visitOf(req("/core.md", SIGNED)).p_agent === "openai-agent", "ChatGPT agent reading Markdown: an entrance by openai-agent");
ok(M.visitOf(req("/core", { ...SIGNED, "signature-agent": '"https://agent.example"' })).p_agent === "other-bot", "another signed agent with a browser's user agent: an automated client");
// review 1-2 C: a count the database does not keep leaves a line in the host's logs (the function and the status, nothing else)
{ const logged = [], err = console.error; console.error = (...a) => logged.push(a.join(" "));
  globalThis.fetch = async () => new Response('{"code":"PGRST202"}', { status: 404 });
  waits.length = 0; M3.default(req("/ask/open/claude", { "user-agent": CHROME, accept: "text/html" }), ctx); await Promise.all(waits);
  console.error = err;
  ok(logged.length === 1 && logged[0] === "count not kept: cz_count_ask_open answered 404", "a lost count is logged: " + JSON.stringify(logged)); }
// /stats renders the counts (mock database)
const require = createRequire(import.meta.url);
process.env.CZ_SALT = "x".repeat(40);
const stats = { first_day: "2026-11-01", visitors_counted_until: "2026-11-02T10:23Z", entrances_since: "2026-11-02", entrances: [{ path: "/core.md", agent: "anthropic", n: 4 }, { path: "/llms.txt", agent: "human", n: 1 }, { path: "<x>", agent: "script", n: 1 }], days: [{ day: "2026-11-02", views: 12, visitors: 5, automated: 40 }, { day: "2026-11-01", views: 30, visitors: 9, automated: 100 }],
  pages: [{ key: "/", n: 20 }, { key: "/core", n: 7 }, { key: "(other)", n: 1 }], refs: [{ key: "x.com", n: 3 }, { key: "<b>evil.com", n: 1 }], countries: [{ key: "MY", n: 9 }], automated: [{ key: "google", n: 30 }, { key: "script", n: 50 }] };
globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("cz_visit_stats") ? stats : null), { status: 200 });
process.env.SUPABASE_URL = "https://db.example";
pageFn.OPEN.offered = OFFERED_NOW.slice();   // as this commit has it again, before /stats reads the same file
const page = require(join(SITE, "api/stats.js"));
// every key the middleware counts under has a name on /stats, and the keys fit the database's rule for a key (cz_count: [a-z0-9_.-], 40)
for (const k of M.BOT_KINDS) ok(typeof page.BOT_NAMES[k] === "string" && /^[a-z0-9_.-]{1,40}$/.test(k), `/stats names the kind ${k}`);
// the five company keys of before the split: no longer counted; named as counted together until the day the database gives — "until",
// since the deploy day holds both kinds (review 1-2 A, B) — or until the split, while it gives none
for (const k of ["openai", "anthropic", "perplexity", "meta", "duckduckgo"])
  ok(/counted together \(until CZ 1447\)$/.test(page.botName(k, "2026-11-16")) && /counted together \(until the split by purpose\)$/.test(page.botName(k, null)) && !(k in page.BOT_NAMES) && !M.BOT_KINDS.includes(k),
    `the key of before the split, ${k}, is no longer counted and is named as counted together until the split`);
ok(page.botName("__proto__", null) === "__proto__" && page.botName("constructor", "2026-11-16") === "constructor", "a key from the object's prototype is shown as itself");
const call = (url) => new Promise((resolve) => { const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, end(b) { resolve({ s: this.statusCode, h: this.h, b: String(b || "") }); } }; page({ url, method: "GET", headers: {} }, res); });
o = await call("/api/stats");
ok(o.s === 200 && /<h1>Visits<\/h1>/.test(o.b) && o.b.includes('<td class="num">30</td>') && o.b.includes("x.com") && o.b.includes("&lt;b&gt;evil.com") && !o.b.includes("<b>evil.com") && o.b.includes("Scripts and checks") && /s-maxage=300/.test(o.h["cache-control"]), "the page shows the counts, escaped, cached five minutes");
o = await call("/api/stats?f=json"); const j = JSON.parse(o.b);
ok(o.s === 200 && j.days.length === 2 && j.first_day === "2026-11-01" && /without cookies or identifiers/.test(j.what), "/stats.json");
o = await call("/api/stats?x=1"); ok(o.s === 400, "/stats refuses parameters");
o = await call("/api/stats");
ok(o.b.includes('<p id="visitors">Until ') && o.b.includes("the originator stopped it") && o.b.includes('5 <span class="src">(until 10:23 UTC)</span>'), "/stats: the visitors' count marked as stopped, the last day partial");
ok(o.b.includes('<h2 id="h-entrances">How machines come in</h2>') && o.b.includes('<td class="nw"><code>/core.md</code></td><td>Anthropic, all agents counted together (until the split by purpose)</td>') && o.b.includes("<td>Browsers</td>") && o.b.includes("<code>&lt;x&gt;</code>"), "/stats: machines' entrances, escaped");
ok(/visitors_counted_until/.test(j.what) && /entrances/.test(j.what), "/stats.json says what the new fields are");
// before the database has v15 (room/ask-open-v15.sql): no presses to show, and the page says so
ok(/<p class="src" id="by-purpose">The agents of the AI companies that publish one name per purpose are now counted apart/.test(o.b) && !/id="by-purpose">Since/.test(o.b), "/stats: before the database gives the day of the split, the line names none");
// ... while /ask offers a link (build.py, ASK_OPEN_LINKS; api/ask-open.json, offered). With none offered and none counted, /stats has no
// such section, and its first paragraph does not say that presses are counted (reviews A and C of RC 1). Both states are tried,
// whatever this commit offers: the page reads the list at each request
const CLAUSE = "; and so are the presses on the links of /ask that open an assistant", offer = (names) => { page.OFFERED.length = 0; page.OFFERED.push(...names); };
ok(JSON.stringify(page.OFFERED) === JSON.stringify(JSON.parse(readFileSync(join(SITE, "api/ask-open.json"), "utf8")).offered), "/stats reads the links api/ask-open.json offers");
offer([]); o = await call("/api/stats");
ok(o.s === 200 && !o.b.includes('id="h-ask-open"') && !o.b.includes("Opened from /ask in an assistant") && !o.b.includes("counted since <a"), "/stats: no section for the presses while /ask offers no link and none was counted");
ok(!o.b.includes(CLAUSE) && !/press(es)? on the links? of/i.test(o.b) && o.b.includes("the summary for language models, the canonical texts. Counting began on "), "/stats: with no link offered, the first paragraph does not say presses are counted");
o = await call("/api/stats?f=md"); ok(o.s === 200 && !/presses on the links/.test(o.b), "/stats as Markdown: the same");
ok(o.b.includes("Since CZ 1447 only this site's own addresses are counted by name, and anything else asked for is counted as (other); rows from before that day may still show other addresses until they leave the 30 days.") && (await call("/api/stats")).b.includes('<h2 id="h-pages">Pages</h2>\n<p class="src">Since CZ 1447 only this site\'s own addresses are counted by name, and anything else asked for is counted as (other); rows from before that day may still show other addresses until they leave the 30 days.</p>'), "/stats says what the row (other) counts, under Pages (review C of RC 2)");
offer(["claude"]); o = await call("/api/stats");
ok(o.b.includes('<h2 id="h-ask-open">Opened from /ask in an assistant</h2>') && /<h2 id="h-ask-open">[\s\S]*?<p>None yet\.<\/p>/.test(o.b) && !o.b.includes("counted since <a"), "/stats: the presses' section, empty and undated before the database counts them");
ok(o.b.includes(`the canonical texts${CLAUSE}. Counting began on `), "/stats: with a link offered, the first paragraph says the presses are counted");
// a link offered, then taken back: its presses of the last 30 days are still shown, and said
offer([]); stats.ask_open = [{ key: "claude", n: 2 }]; o = await call("/api/stats");
ok(o.b.includes('<h2 id="h-ask-open">Opened from /ask in an assistant</h2>') && o.b.includes("<td>Open in Claude</td><td class=\"num\">2</td>") && o.b.includes(CLAUSE), "/stats: presses counted while a link was offered stay shown after it is taken back");
delete stats.ask_open; offer(["chatgpt", "claude", "perplexity"]);
// the split by purpose (CZ 1447): the new keys named by company and purpose, the old ones as counted together, the day of the split said once
stats.automated.push({ key: "openai-user", n: 7 }, { key: "openai", n: 62 }, { key: "anthropic-agent", n: 2 }, { key: "perplexity-search", n: 3 }, { key: "<made-up>", n: 1 });
stats.entrances.push({ path: "/llms.txt", agent: "openai-search", n: 2 });
stats.ask_open = [{ key: "chatgpt", n: 5 }, { key: "claude", n: 2 }, { key: "<x>", n: 1 }]; stats.ask_open_since = "2026-11-17"; stats.agents_by_purpose_since = "2026-11-16";
o = await call("/api/stats");
ok(o.b.includes("<td>OpenAI: asked by a person (ChatGPT-User)</td><td class=\"num\">7</td>") && o.b.includes("<td>OpenAI, all agents counted together (until CZ 1447)</td><td class=\"num\">62</td>")
   && o.b.includes("<td>Anthropic: a browser Claude drives for a person (Claude-Agent)</td>") && o.b.includes("<td>Perplexity: search (PerplexityBot)</td>") && o.b.includes("<td>&lt;made-up&gt;</td>"), "/stats: the agents by purpose, named; the old keys as counted together; an unknown key escaped");
ok((o.b.match(/id="by-purpose"/g) || []).length === 1 && /<p class="src" id="by-purpose">Since <a class="cz-date" href="[^"]+"><time datetime="2026-11-16">CZ 1447<\/time><\/a> the agents of the AI companies/.test(o.b) && /Until that day each company's were counted together, except Claude-Agent and ChatGPT agent, counted as page views by browsers; Amazonbot and Amzn-SearchBot, counted as other crawlers; and Amzn-User and Mistral's agents, counted as scripts\./.test(o.b)
   && /a browser an AI drives for a person[\s\S]*link previews, AI-assisted answers, other agents\./.test(o.b) && /The same day link previews that name other companies' crawlers/.test(o.b), "/stats: one line dates the split, 16 Nov 2026 (CZ 1447)");
ok(o.b.includes('<td class="nw"><code>/llms.txt</code></td><td>OpenAI: search (OAI-SearchBot)</td>'), "/stats: the entrances name the agents by purpose too");
ok(o.b.includes("<td>Open in ChatGPT</td><td class=\"num\">5</td>") && o.b.includes("<td>Open in Claude</td><td class=\"num\">2</td>") && o.b.includes("<td>&lt;x&gt;</td>") && /counted since <a class="cz-date" href="[^"]+"><time datetime="2026-11-17">/.test(o.b), "/stats: the presses on /ask's links, by link, escaped, with the day counting began");
ok(!/observator/i.test(o.b), "/stats: the forbidden word, in any case (review 1-2 B)");
o = await call("/api/stats?f=json"); const j2 = JSON.parse(o.b);
ok(j2.agents_by_purpose_since === "2026-11-16" && j2.ask_open.length === 3 && /ask_open/.test(j2.what) && /-user: a fetch a person asked for/.test(j2.what), "/stats.json: the split's day, the presses, and what they are");
offer(OFFERED_NOW);
// /how-it-is-built says presses are counted only while /ask offers a link (the row of the table, and the paragraph #ask-open)
{ const built = readFileSync(join(SITE, "public/how-it-is-built.html"), "utf8"), ask = readFileSync(join(SITE, "public/ask.html"), "utf8"), says = /presses on the links of \/ask/.test(built);
  ok(says === (OFFERED_NOW.length > 0) && built.includes('<p id="ask-open">') === (OFFERED_NOW.length > 0) && /AI agents by purpose (?:and presses on the links of \/ask to an assistant )?are counted too \(\/stats says since when\)/.test(built),
     `/how-it-is-built says presses are counted exactly while /ask offers a link (offered: ${OFFERED_NOW.length}; says: ${says})`);
  ok((ask.match(/href="\/ask\/open\//g) || []).length === OFFERED_NOW.length, "/ask has a link for each one offered, and no other"); }
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
