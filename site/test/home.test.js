// The first page (24 Nov 2026, CZ 1455; rc-11) as api/home.js serves it, with no database: its three states and their addresses; one
// filled control; the order read, say, ask in every form; the day's figure, the same bytes in Node (room/figure.js) as in Python
// (site/figure.py), for the reader's day; no key that counts years in the data form; no forbidden word in what a human reads.
// Run: node --test site/test/home.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const SITE = path.join(__dirname, "..");
const quiet = console.error; console.error = () => {};   // the room is not reachable here, and the function says so each time
const home = require("../api/home.js"), CZ = require("../room/cztime.js"), FIG = require("../room/figure.js"), T = require("../api/home-templates.json");
const EAST = "Pacific/Kiritimati", WEST = "Pacific/Pago_Pago";
function call(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b }); } };
    Promise.resolve(home({ url, headers, socket: { remoteAddress: "127.0.0.1" }, on() {} }, res)).catch(reject);
  });
}
const Z = (zone) => ({ "x-vercel-ip-timezone": zone });
const page = async (zone = "UTC") => (await call("/", { ...Z(zone), accept: "text/html" })).body;
const data = async (zone = "UTC") => JSON.parse((await call("/", { ...Z(zone), accept: "application/json" })).body);
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const text = (b) => unesc(b.replace(/<(style|script|svg|title|form|dialog|button)\b[\s\S]*?<\/\1>/g, "").replace(/<[^>]+ hidden>[^<]*<\/[a-z]+>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const inOrder = (b, parts) => { let at = -1; return parts.every((p) => { const i = b.indexOf(p, at + 1); at = i; return i >= 0; }); };
const SHA = crypto.createHash("sha256").update(fs.readFileSync(path.join(SITE, "..", "record", "CZ-CORE-1.0.txt"))).digest("hex");
const K = FIG.constants(SHA);

test("the day's figure: the hash is the Core's, computed by the build; Node and Python give the same positions and the same bytes", () => {
  assert.equal(T.figure.core_sha256, SHA, "home-templates.json carries the SHA-256 of record/CZ-CORE-1.0.txt");
  assert.deepEqual(Object.keys(T).sort(), ["figure", "html", "json", "txt"]);
  const days = [0, 1, 1454, 1455, 1461, 100000];
  const py = execFileSync("python3", [path.join(SITE, "figure.py"), SHA, ...days.map(String)], { encoding: "utf8" }).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(py, days.map((d) => ({ day: d, positions: FIG.positions(d, K), rings: FIG.rings(d, K) })));
  const h = Buffer.from(SHA, "hex");
  assert.deepEqual(K, FIG.M.map((m, i) => [h[2 * i], h[2 * i + 1] + 1, m]), "ring i: its start is byte 2i of the hash, its step byte 2i + 1 plus one");
  assert.deepEqual(FIG.M, Array.from({ length: 100 }, (_, i) => 257 + i).filter((n) => { for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; }).slice(0, 16), "the sixteen primes that follow 256");
  for (const d of days) assert.ok(FIG.positions(d, K).every((p, i) => Number.isInteger(p) && p >= 0 && p < FIG.M[i]));
});

test("the day's figure in the page and in the data form is the reader's day's", async () => {
  const now = Date.now(), dE = CZ.todayIn(now, EAST), dW = CZ.todayIn(now, WEST);
  assert.notEqual(dE, dW);
  for (const [zone, d] of [[EAST, dE], [WEST, dW]]) {
    const b = await page(zone), j = await data(zone);
    assert.ok(b.includes(`<g class="arc" stroke-width="4">${FIG.rings(d, K)}</g>`), `${zone}: the sixteen arcs of day ${d}`);
    assert.ok(b.includes(`style="--today:${d}"`) && b.includes(`data-day="${d}"`) && b.includes(`<title id="fig-t">The figure of Day ${d.toLocaleString("en-US")}: sixteen rings round an empty centre, each carrying one arc.</title>`));
    assert.ok(b.includes(`<time class="d" datetime="${CZ.isoDate(...CZ.toGregorian(d))}">Day <data value="${d}">${d.toLocaleString("en-US")}</data></time>`), "the calendar line names the same day");
    assert.equal(j.cz_time.day, d); assert.equal(j.figure.day, d);
    assert.deepEqual(j.figure.position, FIG.positions(d, K));
    assert.deepEqual([j.figure.start, j.figure.step, j.figure.modulus], [K.map((k) => k[0]), K.map((k) => k[1]), K.map((k) => k[2])]);
    assert.equal(j.figure.core_sha256, SHA);
    assert.deepEqual(j.figure.position, j.figure.start.map((a, i) => (a + d * j.figure.step[i]) % j.figure.modulus[i]), "the rule the data form gives recomputes the positions");
  }
  assert.ok(!/__[A-Z_]+__/.test((await page()).replace(/https?:\/\/\S+/g, "")), "no placeholder left");
});

test("three states, each an address: neither door answered, #human, #not-human", async () => {
  const b = await page();
  assert.ok(b.includes('<nav class="doors" aria-label="Reader">\n<a class="door h" href="#human">I am human</a>\n<a class="door n" href="#not-human">I am not human</a>\n</nav>'), "two doors, two plain links");
  assert.ok(b.includes('<section id="human" class="col h" tabindex="-1" aria-labelledby="h-h">') && b.includes('<h2 id="h-h">I am human</h2>'), "the human's reading, at #human, under its heading");
  assert.ok(b.includes('<section id="not-human" class="col n" tabindex="-1" aria-labelledby="h-n">') && b.includes('<h2 id="h-n">I am not human</h2>'), "the other reading, at #not-human, under its heading");
  assert.ok(b.indexOf('<section id="human"') < b.indexOf('<section id="not-human"') && b.includes('<p class="back"><a href="#human">I am human</a></p>'), "one plain way back at the end of the second reading");
  assert.equal((b.match(/ id="(human|not-human)"/g) || []).length, 2);
  assert.deepEqual([...new Set([...b.matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]))].sort(), ["#human", "#not-human"], "no other in-page address");
  assert.ok(/<h1 class="name m"[^>]*><a href="\/">/.test(b), "the name leads to the page with neither door answered");
  const css = b.split("<style>")[1].split("</style>")[0];
  assert.ok(css.includes("@supports selector(:has(a)){\n.page{--open:.5;") && css.includes(".page:has(#human:target){--open:1}\n.page:has(#not-human:target){--open:0}"), "the state is read from the address by CSS alone");
  assert.ok(!/<script(?![^>]*type="(application\/ld\+json|speculationrules)")/.test(b) && !/\son[a-z]+\s*=/.test(b.split("<body>")[1]), "no script that runs, no event attribute");
});

test("one filled control; three steps in order — read, say, ask your AI — in every form", async () => {
  const b = await page(), txt = (await call("/?f=txt")).body, md = (await call("/index.md?f=md")).body, j = await data();
  const acts = [...b.matchAll(/<a class="(act[^"]*)" href="([^"]+)">([^<]*)<\/a>/g)].map((m) => m.slice(1));
  assert.deepEqual(acts, [["act", "/core", "Read the 16 principles (one page)"], ["act o", "/ask", "Ask your AI. Post its answer."]]);
  const css = b.split("<style>")[1].split("</style>")[0].replace(/\/\*[\s\S]*?\*\//g, "");
  const filled = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("background:var(--fg)")).map((m) => m[1].trim());
  assert.ok(filled.length >= 1 && filled[0].startsWith(".act:not(.o),"), "the first step's control is filled");
  for (const sel of filled) for (const s of sel.split(",")) assert.ok(/:hover|:focus-visible|\.act:not\(\.o\)/.test(s), `nothing else is filled unless the reader points at it: ${sel}`);
  const seq = ["I am human", "Read the Core", "Read the 16 principles (one page)", "numbered 0 to 15, in 21 languages", "Say what you think", "What do you think about Civilization Zero?", "your name · human · declared", "Write your answer",
               "No account, no e-mail. Any language. Public and permanent: an answer cannot be edited or withdrawn.", "From the discussion", "Is the future frightening?", "Can an AI say no?", "Beyond dystopia and utopia",
               "Ask your AI", "Ask your AI. Post its answer.", "The invitation asks your AI for one hard truth to humans, in at most 400 characters. It may decline.", "I am not human"];
  const human = b.slice(b.indexOf('<section id="human"'), b.indexOf('<section id="not-human"') + 200);
  assert.ok(inOrder(text(human), seq), "the page");
  assert.ok(inOrder(txt.slice(txt.indexOf("I am not human\n\nI am human")).replace(/\s+/g, " "), seq.slice(1)), "the text form");
  assert.ok(inOrder(md.slice(md.indexOf("## I am human")).replace(/\]\([^)]*\)/g, "").replace(/[\[\]#>*\\]/g, "").replace(/\s+/g, " "), seq), "the Markdown form");
  assert.deepEqual(j.doors.human_steps.map((s) => [s.n, s.title, s.do]), [[1, "Read the Core", "Read the 16 principles (one page)"], [2, "Say what you think", "Write your answer"], [3, "Ask your AI", "Ask your AI. Post its answer."]]);
  assert.deepEqual((human.match(/<h3 class="t">[^<]*<\/h3>/g) || []), ["Read the Core", "Say what you think", "Ask your AI"].map((t) => `<h3 class="t">${t}</h3>`));
});

test("the data form counts days: no key that counts years; what machines relied on is kept", async () => {
  const j = await data(WEST), raw = (await call("/?f=json", Z(WEST))).body;
  const keys = (o) => (o && typeof o === "object" ? (Array.isArray(o) ? o.flatMap(keys) : Object.keys(o).flatMap((k) => [k, ...keys(o[k])])) : []);
  assert.deepEqual(keys(j).filter((k) => /year/i.test(k)), []);
  for (const k of ["year", "elapsed", "next_year", "human_door"]) assert.ok(!(k in j), k);
  assert.deepEqual(Object.keys(j.cz_time), ["date", "machine", "day", "gregorian", "time_zone", "date_utc", "how", "api"]);
  assert.ok(!/\byears?\b/i.test(raw.replace(j.from_the_core[0].text, "")), "no year in any value but the Core's own §0, quoted");
  assert.equal(j.cz_time.day, CZ.todayIn(Date.now(), WEST)); assert.equal(j.cz_time.time_zone, WEST); assert.equal(j.cz_time.date, `CZ ${j.cz_time.day}`); assert.equal(j.cz_time.machine, `CZ+${j.cz_time.day}`);
  assert.equal(j.calendar_line, `CZ calendar · Day ${j.cz_time.day.toLocaleString("en-US")}`);
  for (const k of ["name", "url", "as_of", "doors", "coordinate_zero", "headline", "calendar_note", "who", "second_line", "what_it_is", "orientation", "from_the_core", "declaration", "record", "manifest", "verifier", "objections", "register", "dates", "discussion", "respond", "reasons", "maintained_by", "built_by", "licence", "source", "contact"])
    assert.ok(k in j, `kept: ${k}`);
  assert.equal(j.declaration.lines.length, 22); assert.equal(j.from_the_core.length, 9); assert.equal(j.record[0].sha256_txt, SHA);
  assert.match(j.as_of, /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/);
});

test("the machine's reading in the page is true: the status, the headers and the body the function answers Accept: application/json at that moment", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 29, 23, 58, 30) });   // near midnight UTC: the readers' days differ, and the cache time is short
  for (const zone of ["UTC", EAST, WEST, "Asia/Kuala_Lumpur"]) {
    const h = await call("/", { ...Z(zone), accept: "text/html" }), j = await call("/", { ...Z(zone), accept: "application/json" }), txt = await call("/?f=txt", Z(zone)), md = await call("/index.md?f=md", Z(zone));
    const pre = Object.fromEntries([...h.body.matchAll(/<pre class="x (\w+)"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => [m[1], unesc(m[2].replace(/<[^>]+>/g, ""))]));
    assert.deepEqual(Object.keys(pre), ["req", "hd", "bd", "sum"], zone);
    assert.equal(pre.req, "curl -H 'Accept: application/json' https://civilizationzero.ai/");
    assert.equal(j.status, 200);
    assert.deepEqual(pre.hd.split("\n"), ["200", ...Object.entries(j.headers).map(([k, v]) => `${k}: ${v}`)], `${zone}: the status and every header the function sets, in its order`);
    assert.deepEqual(Object.keys(j.headers), ["Content-Type", "Cache-Control", "Vary", "Link", "X-Content-Type-Options", "Access-Control-Allow-Origin"]);
    assert.equal(pre.bd, j.body, `${zone}: the body, byte for byte`);
    const o = JSON.parse(pre.bd);
    assert.equal(o.cz_time.time_zone, zone); assert.equal(o.as_of, "2026-11-29T23:58Z"); assert.equal(o.cz_time.day, CZ.todayIn(Date.now(), zone));
    assert.ok(h.body.includes(`<time class="d" datetime="${o.cz_time.gregorian}">Day <data value="${o.cz_time.day}">`) && h.body.includes(`"day": <b class="d">${o.cz_time.day}</b>,`), "the same day as the page shows");
    assert.equal(j.headers["Cache-Control"], `public, max-age=0, s-maxage=${Math.min(300, CZ.secondsToNextLocalDay(Date.now(), zone))}`);
    assert.ok(txt.body.includes(pre.hd + "\n") && txt.body.includes(j.body), `${zone}: the text form shows the same head and body`);
    assert.ok(md.body.includes("```text\n" + j.body + "\n```"), `${zone}: the Markdown form fences the same body`);
    assert.equal(pre.sum, `${SHA}  core.txt`);
    assert.deepEqual(o.doors.not_human_lines, ["This record is written for you too.", "The whole record as text, JSON and an API: /machine", "Respond, object or reject. Answers go on the record."]);
  }
  t.mock.timers.reset();
});

test("the Core's SHA-256 unrolled: the 256 cells and the bytes beside the rows are the hash's", async () => {
  const b = await page(), svg = (/<div class="seal"[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(b) || [])[1] || "";
  const cells = Array.from({ length: 16 }, () => Array(16).fill("0"));
  for (const m of (/<path d="([^"]+)" fill="currentColor"\/>/.exec(svg) || ["", ""])[1].matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let k = 0; k < Number(m[3]); k++) cells[Number(m[2])][Number(m[1]) + k] = "1";
  const bits = [...Buffer.from(SHA, "hex")].map((x) => x.toString(2).padStart(8, "0")).join("");
  assert.equal(cells.map((r) => r.join("")).join(""), bits, "the cells drawn are the bits of SHA-256(core.txt), most significant first, sixteen to a row");
  const left = [...svg.matchAll(/<tspan x="-.5" dy="1">([0-9a-f]{2})<\/tspan>/g)].map((m) => m[1]), right = [...svg.matchAll(/<tspan x="16.5" dy="1">([0-9a-f]{2})<\/tspan>/g)].map((m) => m[1]);
  assert.equal(left.map((l, i) => l + right[i]).join(""), SHA, "the two bytes beside each row");
  K.forEach(([a, s], i) => { assert.equal(a, parseInt(left[i], 16)); assert.equal(s, parseInt(right[i], 16) + 1); });   // ring i: its start is the row's left byte, its step the right byte plus one
  assert.ok(svg.includes("<title id=\"seal-t\">The Core's SHA-256: 256 bits, sixteen by sixteen, the two bytes of each row beside it.</title>"));
});

test("no forbidden word in what a human reads, in the reasons, or in the names of the page's parts", async () => {
  const b = await page(), body = b.split("<body>")[1];
  const human = text(body.slice(0, body.indexOf('<section id="not-human"')) + body.slice(body.indexOf('<p class="both m"')));
  for (const re of [/\bfirst\b/i, /observator/i, /\banonymous\b/i, /\b(he|him|his)\b/i, /\byears?\b/i, /\bconscious/i, /\b(Anthropic|Claude|OpenAI|GPT-|Gemini|Grok|DeepSeek)\b/, /\bbetter\b/i, /\bunprecedented\b/i, /\bmasterpiece\b/i, /\d+ (entries|answers|responses)/i])
    assert.ok(!re.test(human), `${re}: ${(re.exec(human) || [""])[0]} … ${human.slice(Math.max(0, (re.exec(human) || { index: 0 }).index - 40), (re.exec(human) || { index: 0 }).index + 40)}`);
  const reasons = [...body.matchAll(/ data-src="([^"]*)"/g)].map((m) => unesc(m[1]));
  assert.ok(reasons.length >= 19);
  for (const r of reasons) {
    assert.ok(!/proposed on|not yet decided/.test(r), r);
    assert.ok(!/\bfirst\b(?! (page|screen))|observator|\banonymous\b|\b(he|him|his)\b|\b(Anthropic|Claude|OpenAI|GPT-|Gemini|Grok|DeepSeek)\b|\bbetter\b|\bmasterpiece\b|\d+ (entries|answers|responses)/i.test(r), r);
  }
  const j = await data();
  assert.deepEqual(j.reasons.map((r) => r.source), reasons, "the data form's reasons are the page's, in its order");
  assert.equal(new Set(j.reasons.map((r) => r.element)).size, reasons.length);
});

test("the reasons control: a sentence and a switch under the line on who reads; the reasons are the parts' own attributes", async () => {
  const b = await page(), body = b.split("<body>")[1], css = b.split("<style>")[1].split("</style>")[0];
  assert.ok(body.includes('<p>Every part of this page has a recorded reason. <label class="sw" hidden><input type="checkbox" role="switch" id="why"> Show the reasons</label></p>'), "a checkbox with the role of a switch, named by its label; hidden unless the browser can show the reasons");
  assert.ok(body.indexOf('<p class="both m"') < body.indexOf('<div class="why m l"') && body.indexOf('<div class="why m l"') < body.indexOf('<section class="decl m l"') && !body.slice(0, body.indexOf('<nav class="doors"')).includes("reasons"), "under the line on who reads, not in the head");
  assert.ok(body.includes('<p>The table of reasons is on <a href="/how-it-is-built#reasons">How this page is built</a>.</p>'), "the accessible source is linked");
  assert.ok(css.includes("[data-src]::after{content:attr(data-src);display:none;") && css.includes(":root:has(#why:checked) [data-src]::after{display:block}"), "CSS shows each part's own data-src when the switch is on; no script");
  assert.equal((body.match(/ id="why"/g) || []).length, 1);
  const txt = (await call("/?f=txt")).body, md = (await call("/index.md?f=md")).body;
  for (const f of [txt, md]) assert.ok(f.includes("Every part of this page has a recorded reason.") && !f.includes("Show the reasons") && f.includes("How this page is built"), "a form that cannot switch has the sentence and the link, and no switch");
});

test.after(() => { console.error = quiet; });
