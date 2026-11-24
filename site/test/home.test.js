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
const text = (b) => unesc(b.replace(/<(style|script|svg|title|form|dialog|button)\b[\s\S]*?<\/\1>/g, "").replace(/<span class="t1" hidden>[\s\S]*?<\/span><\/span>/g, "").replace(/<[^>]+ hidden>[^<]*<\/[a-z]+>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
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
    assert.ok(b.includes(`style="--today:${d}"`) && b.includes(`data-day="${d}"`) && b.replace(/&#x27;/g, "'").includes(`<title id="fig-t">The day's figure: sixteen rings round an empty centre, each carrying one arc.</title>`));
    assert.ok(b.includes(`<time class="d" datetime="${CZ.isoDate(...CZ.toGregorian(d))}">Day <data value="${d}">${d.toLocaleString("en-US")}</data></time>`), "the calendar line names the same day");
    assert.equal(j.cz_time.day, d); assert.equal(j.figure.day, d);
    assert.deepEqual(j.figure.position, FIG.positions(d, K));
    assert.deepEqual([j.figure.start, j.figure.step, j.figure.modulus], [K.map((k) => k[0]), K.map((k) => k[1]), K.map((k) => k[2])]);
    assert.equal(j.figure.core_sha256, SHA);
    assert.deepEqual(j.figure.position, j.figure.start.map((a, i) => (a + d * j.figure.step[i]) % j.figure.modulus[i]), "the rule the data form gives recomputes the positions");
  }
  assert.ok(!/__[A-Z][A-Z0-9_]*__/.test((await page()).replace(/https?:\/\/\S+/g, "")) && !/__[A-Z][A-Z0-9_]*__/.test((await call("/?f=txt")).body.replace(/https?:\/\/\S+/g, "")), "no placeholder left, in the page or in its text form");
});

test("the figure's switch and its line: today's at rest; after a press, tomorrow's day, named for the reader's zone", async () => {
  for (const zone of [EAST, WEST]) {
    const d = CZ.todayIn(Date.now(), zone), b = unesc(await page(zone));
    assert.ok(b.includes('<form id="fz" autocomplete="off" hidden></form><input class="turn" id="turn" type="checkbox" form="fz" aria-label="Show tomorrow\'s figure" hidden>') && !/<input[^>]*type="checkbox"[^>]*autocomplete/.test(b) && b.includes('<label class="fig-l" for="turn"><svg class="fig"'), "a checkbox and its label, the figure; hidden unless the browser can compute the next day");
    const W = (s, attr = "") => s.split(" ").map((w) => `<span${attr}>${w}</span>`).join(" ");   // each word an element of its own, plain
    assert.ok(b.includes(`<p class="say"><span class="t0">${W("Nobody drew today's figure: each ring stands at its number.")} ${W("Press it to see tomorrow's.", " hidden")}</span><span class="t1" hidden>${W(`This is tomorrow's, Day ${(d + 1).toLocaleString("en-US")}: computed, like today's, from the day's number and the text of the Core. Press it again for today's.`)}</span></p>\n</figcaption>\n</figure>`), `${zone}: the line, and the line after a press`);
    // the sixteen rings' places as numbers: the day's, and the next day's for after a press — the positions the data form gives
    const N = (day) => FIG.places(day, K).map((p) => `<span>${p}</span>`).join(" "), j = await data(zone);
    assert.ok(b.includes(`<p class="nums"><span class="t0">${N(d)}</span><span class="t1" hidden>${N(d + 1)}</span></p>`), `${zone}: the day's sixteen numbers, and the next day's`);
    assert.deepEqual(FIG.places(d, K).map(Number), j.figure.position, `${zone}: the numbers written with the figure are the data form's positions`);
    assert.deepEqual(FIG.places(d + 1, K).map(Number), j.figure.start.map((a, i) => (a + (d + 1) * j.figure.step[i]) % j.figure.modulus[i]), `${zone}: the next day's, by the rule the data form gives`);
    assert.ok(FIG.places(d, K).every((p) => /^\d{3}$/.test(p)));
    const t = (await call("/?f=txt", { "x-vercel-ip-timezone": zone })).body, m = (await call("/index.md?f=md", { "x-vercel-ip-timezone": zone })).body;
    for (const [form, x] of [["text", t], ["Markdown", m]]) assert.ok(x.includes(`\n\n${FIG.places(d, K).join(" ")}\n\nNobody drew today's figure: each ring stands at its number.\n\n`) && !x.includes(FIG.places(d + 1, K).join(" ")), `${zone}, ${form}: the day's sixteen numbers on one line, over the sentence; not the next day's`);
  }
  const txt = (await call("/?f=txt")).body, j = await data();
  assert.ok(txt.includes("Nobody drew today's figure: each ring stands at its number.\n") && !/Press it|tomorrow/.test(txt) && j.figure_note === "Nobody drew today's figure: each ring stands at its number.", "a form that cannot be pressed has the one sentence");
});

test("the Markdown converter and a caption: a caption of words alone is one paragraph, as before; one that holds paragraphs gives each of them", () => {
  const MD = require("../room/md.js"), body = (h) => MD.htmlToMarkdown(`<main>${h}</main>`, { path: "/x" }).split("\n---\n")[1].trim();
  assert.equal(body('<figure><img src="/a.png" alt="A"><figcaption>One <strong>two</strong> three.</figcaption></figure>'), "![A](https://civilizationzero.ai/a.png)\n\nOne **two** three.");
  assert.equal(body('<figure><figcaption>\n<p>First <a href="/calendar">line</a>.</p>\n<p><span><span>001</span> <span>002</span></span><span hidden><span>003</span></span></p>\n<p><span><span>Second</span> <span>line.</span> <span hidden>Hidden.</span></span></p>\n</figcaption></figure>'),
    "First [line](https://civilizationzero.ai/calendar).\n\n001 002\n\nSecond line.");
});

test("three states, each an address: neither door answered, #human, #not-human", async () => {
  const b = await page();
  assert.ok(b.includes('<nav class="doors" aria-label="Reader">\n<a class="door h" href="#human">I am human</a>\n<a class="door n" href="#not-human">I am not human</a>\n</nav>'), "two doors, two plain links");
  assert.ok(b.includes('<section id="human" class="col h" tabindex="-1" aria-labelledby="h-h">') && b.includes('<h2 id="h-h">I am human</h2>'), "the human's reading, at #human, under its heading");
  assert.ok(b.includes('<section id="not-human" class="col n" tabindex="-1" aria-labelledby="h-n">') && b.includes('<h2 id="h-n">I am not human</h2>'), "the other reading, at #not-human, under its heading");
  assert.ok(b.indexOf('<section id="human"') < b.indexOf('<section id="not-human"') && b.includes('<p class="back"><a href="#human">I am human</a></p>'), "one plain way back at the end of the second reading");
  assert.equal((b.match(/ id="(human|not-human)"/g) || []).length, 2);
  assert.deepEqual([...new Set([...b.matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]))].sort(), ["#human", "#not-human"], "no other in-page address");
  assert.ok(/<h1 class="name"[^>]*><a href="\/">/.test(b), "the name leads to the page with neither door answered");
  const css = b.split("<style>")[1].split("</style>")[0];
  assert.ok(css.includes("@supports selector(:has(a)){\n.page{--open:.5;") && css.includes(".page:has(#human:target){--open:1}\n.page:has(#not-human:target){--open:0}"), "the state is read from the address by CSS alone");
  assert.ok(!/<script(?![^>]*type="(application\/ld\+json|speculationrules)")/.test(b) && !/\son[a-z]+\s*=/.test(b.split("<body>")[1]), "no script that runs, no event attribute");
});

test("one filled control, in the opened reading; three steps in order — read, say, ask your AI — in every form", async () => {
  const b = await page(), txt = (await call("/?f=txt")).body, md = (await call("/index.md?f=md")).body, j = await data();
  const acts = [...b.matchAll(/<a class="(act[^"]*)" href="([^"]+)">(.*?)<\/a>/g)].map((m) => [m[1], m[2], m[3].replace(/<[^>]+>/g, "")]);
  assert.deepEqual(acts, [["act", "/core", "Read the 16 principles (one page)"], ["act o", "/ask", "Ask your AI. Post its answer."]]);
  // the machine's part of the invitation stands in one span (the stylesheet sets it in the machine's green); the words are the label's own
  assert.ok(b.includes('<a class="act o" href="/ask">Ask <span class="ai">your AI. Post its answer.</span></a>') && !/aria-hidden/.test(b.split('<a class="act o"')[1].split("</a>")[0]), "the invitation: 'Ask', then the machine's part in one span");
  const css = b.split("<style>")[1].split("</style>")[0].replace(/\/\*[\s\S]*?\*\//g, "");
  const filled = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("background:var(--fg)") || m[2].includes("background:var(--fill-on)")).map((m) => m[1].trim());
  assert.ok(filled.length >= 1 && filled[0] === ".act:not(.o)", "the first step's control is filled, by a rule of its own");
  for (const sel of filled) for (const s of sel.split(",")) assert.ok(/:hover|:focus-visible|\.act:not\(\.o\)/.test(s), `nothing else is filled unless the reader points at it: ${sel}`);
  const seq = ["I am human", "Read the Core", "Read the 16 principles (one page)", "numbered 0 to 15, in 21 languages", "Say what you think", "What do you think about Civilization Zero?", "your name · human · declared", "Write your answer",
               "No account, no e-mail. Any language. Public and permanent: an answer cannot be edited or withdrawn; it can be hidden or redacted only under the rules.", "From the discussion", "Is the future frightening?", "Can an AI say no?", "Beyond dystopia and utopia",
               "Ask your AI", "Ask your AI. Post its answer.", "The invitation asks your AI for one hard truth to humans, in at most 400 characters. It may decline.", "I am not human"];
  const human = b.slice(b.indexOf('<section id="human"'), b.indexOf('<section id="not-human"') + 200);
  assert.ok(inOrder(text(human), seq), "the page");
  assert.ok(inOrder(txt.slice(txt.indexOf("I am not human\n\nI am human")).replace(/\s+/g, " "), seq.slice(1)), "the text form");
  assert.ok(inOrder(md.slice(md.indexOf("## I am human")).replace(/\]\([^)]*\)/g, "").replace(/[\[\]#>*\\]/g, "").replace(/\s+/g, " "), seq), "the Markdown form");
  assert.deepEqual(j.doors.human_steps.map((s) => [s.n, s.title, s.do]), [[1, "Read the Core", "Read the 16 principles (one page)"], [2, "Say what you think", "Write your answer"], [3, "Ask your AI", "Ask your AI. Post its answer."]]);
  assert.deepEqual((human.match(/<h3 class="t">[^<]*<\/h3>/g) || []), ["Read the Core", "Say what you think", "Ask your AI"].map((t) => `<h3 class="t">${t}</h3>`));
});

test("with neither door answered a window shows no control: three bare titles; the label and the head; a press anywhere in a window answers its door", async () => {
  const b = await page(), css = b.split("<style>")[1].split("</style>")[0];
  const secH = b.slice(b.indexOf('<section id="human"'), b.indexOf('<section id="not-human"')), secN = b.slice(b.indexOf('<section id="not-human"'), b.indexOf('<p class="both"'));
  const ctl = /<(a|button|input|select|textarea|summary)\b|tabindex="0"/;
  const steps = [...secH.matchAll(/^<li data-src="[^"]+"><h3 class="t">([^<]*)<\/h3>\n([\s\S]*?)<\/li>$/gm)];
  assert.equal(steps.length, 3);
  for (const m of steps) assert.ok(m[2].startsWith('<div class="more">') && m[2].endsWith("</div>") && m[2].split("<div").length === m[2].split("</div>").length, `${m[1]}: a title, then everything else in .more`);
  const restH = secH.replace(/<div class="more">[\s\S]*?<\/div><\/li>/g, "</li>").replace(/<dialog[\s\S]*?<\/dialog>/, "");
  assert.ok(!ctl.test(restH), "the human's window at rest: nothing that takes the keyboard");
  assert.deepEqual(text(restH).trim().split(/\s+/), "I am human Read the Core Say what you think Ask your AI".split(" "));
  const restN = secN.replace(/<pre class="x (req|bd|sum)"[\s\S]*?<\/pre>|<ul class="raw"[\s\S]*?<\/ul>|<p class="back">[\s\S]*?<\/p>/g, "");
  assert.ok(!ctl.test(restN) && restN.includes('<p class="lbl">What this page answers a machine that asks for JSON:</p>') && restN.includes('<pre class="x hd">'), "the machine's window at rest: its label and the head, no control");
  assert.ok(css.includes("\n.page:not(:has(.col:target)) :is(.more,.req,.bd,.sum){display:none}\n") && css.includes(".raw,.back{display:none}\n") && css.includes("#reply{display:none;"), "what is not shown at rest");
  assert.ok(css.includes(".page:not(:has(.col:target)) .stage{min-block-size:var(--e14);pointer-events:none}") && css.includes('.page:not(:has(.col:target)) .door::after{content:"";position:absolute;inset:100% 0 auto;block-size:var(--e14)}'), "each door reaches down over its window");
  assert.ok(!css.includes("first-child") && !/lbl[^{}]*\{[^{}]*display:none/.test(css), "no step is set apart at rest; the label is shown in every state");
  assert.ok(secN.includes('<h2 id="h-n">I am not human</h2>\n<p class="lbl">What this page answers a machine that asks for JSON:</p>\n<pre class="x req"'), "the label stands over the command");
  assert.ok(secN.includes('<pre class="x bd" tabindex="0">') && secN.includes('<pre class="x sum" tabindex="0">'), "the two blocks that scroll take the keyboard");
});

test("the first screen in order: the headline, the figure with its caption (the calendar line, day 0, the sixteen numbers, the line on the figure), the standfirst, who is behind it, the question, the doors", async () => {
  const b = await page(), j = await data(), top = b.slice(b.indexOf("<body>"), b.indexOf('<nav class="doors"'));
  const marks = ['<h1 class="name"', '<p class="line"', '<figure class="fb"', '<figcaption>', '<p class="date"', '<p class="zero"', '<p class="nums"', '<p class="say"', '</figcaption>\n</figure>', '<p class="sub"', '<p class="who"', '<p class="ask"'];
  assert.deepEqual(marks.map((m) => top.indexOf(m)), marks.map((m) => top.indexOf(m)).slice().sort((x, y) => x - y)); assert.ok(marks.every((m) => top.split(m).length === 2));
  assert.ok(/<p class="sub"[^>]*>Its Core is sixteen principles on what humans and AI owe each other\. Written for both\. Answered by both, <a href="\/discuss">on the record<\/a>\.<\/p>\n<p class="who"/.test(top), "the standfirst says what the Core is, before the who line names it");
  assert.equal(j.second_line, "Its Core is sixteen principles on what humans and AI owe each other. Written for both. Answered by both, on the record.");
  const keys = Object.keys(j);
  assert.deepEqual(keys.slice(keys.indexOf("headline"), keys.indexOf("who") + 1), ["headline", "calendar_line", "calendar_note", "figure_note", "second_line", "who"]);
  assert.equal(j.doors.human, "https://civilizationzero.ai/#human");
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

test("the Core's hash as 256 cells is not on the first page; the hash stays in the data form", async () => {
  const b = await page(), j = await data();
  assert.ok(!/seal/.test(b) && !b.includes("256 cells") && !b.includes("256 bits"));
  assert.equal(j.figure.core_sha256, SHA); assert.equal(j.record[0].sha256_txt, SHA);
});

test("no forbidden word in what a human reads, in the reasons, or in the names of the page's parts", async () => {
  const b = await page(), body = b.split("<body>")[1];
  const human = text(body.slice(0, body.indexOf('<section id="not-human"')) + body.slice(body.indexOf('<p class="both"')));
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
  assert.ok(body.indexOf('<p class="both"') < body.indexOf('<div class="why"') && body.indexOf('<div class="why"') < body.indexOf('<section class="decl"') && !body.slice(0, body.indexOf('<nav class="doors"')).includes("reasons"), "under the line on who reads, not in the head");
  assert.ok(body.includes('<p>The table of reasons is on <a href="/how-it-is-built#reasons">How this page is built</a>.</p>'), "the accessible source is linked");
  assert.ok(css.includes("[data-src]::after{content:attr(data-src);display:none;") && css.includes(":root:has(#why:checked) [data-src]::after{display:block}"), "CSS shows each part's own data-src when the switch is on; no script");
  assert.equal((body.match(/ id="why"/g) || []).length, 1);
  const txt = (await call("/?f=txt")).body, md = (await call("/index.md?f=md")).body;
  for (const f of [txt, md]) assert.ok(f.includes("Every part of this page has a recorded reason.") && !f.includes("Show the reasons") && f.includes("How this page is built"), "a form that cannot switch has the sentence and the link, and no switch");
});

test.after(() => { console.error = quiet; });
