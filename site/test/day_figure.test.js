// A figure for every day (rc-12, CZ 1455). One figure, three writers: the reference implementation of rc-10 (its answers for nine days
// are kept in fixtures/day-figure.json), site/figure.py (the build's) and room/figure.js (the functions'). All three give the same
// positions and the same bytes — for days 0, 1, 1454, 1455, 1456, 1461 and 100000, and for two days before Day 0, where the rule is the same
// with the mathematical modulo: no position is negative. The frame the build writes for /calendar (room/cz-bar.json, dayfigure) is
// the first page's own; filled by room/figure.js it is a whole figure with its one sentence. Where api/page.js writes the figure into
// the converter's result (its dayFigure), the result of a conversion carries the figure of the day converted.
// Run: node --test site/test/day_figure.test.js
process.env.CZ_SALT = process.env.CZ_SALT || "x".repeat(40);
const test = require("node:test"), assert = require("node:assert"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const SITE = path.join(__dirname, "..");
process.chdir(SITE);
const FIG = require("../room/figure.js"), CZ = require("../room/cztime.js");
const FX = require("./fixtures/day-figure.json"), BAR = require("../room/cz-bar.json"), HOME = require("../api/home-templates.json");
const SHA = crypto.createHash("sha256").update(fs.readFileSync(path.join(SITE, "..", "record", "CZ-CORE-1.0.txt"))).digest("hex");
const K = FIG.constants(SHA), DAYS = [0, 1, 1454, 1455, 1456, 1461, 100000, -1, -1997];
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the reference of rc-10, site/figure.py and room/figure.js: the same positions and the same bytes for nine days", () => {
  assert.equal(FX.core_sha256, SHA, "the fixture was computed from this Core");
  assert.deepEqual(FX.days.map((d) => d.day), DAYS);
  const js = DAYS.map((d) => ({ day: d, positions: FIG.positions(d, K), rings: FIG.rings(d, K) }));
  const py = execFileSync("python3", [path.join(SITE, "figure.py"), SHA, ...DAYS.map(String)], { encoding: "utf8" }).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(js, FX.days, "room/figure.js gives what the reference gave");
  assert.deepEqual(py, FX.days, "site/figure.py gives what the reference gave");
  // the places as the first page writes them with the figure (rc-14): the reference's positions, each in three digits, ring 0 first
  for (const x of FX.days) assert.deepEqual(FIG.places(x.day, K), x.positions.map((p) => String(p).padStart(3, "0")), `day ${x.day}: the sixteen places`);
  assert.equal(FIG.places(1455, K).join(" "), "092 166 071 082 149 239 114 163 136 001 053 214 071 208 082 002");
  assert.equal(FIG.places(1456, K).join(" "), "004 130 168 120 200 045 022 188 070 061 158 094 296 300 128 077");
});

test("a day before Day 0: the same rule with the mathematical modulo — every position in 0 … modulus − 1, a day's step apart from the next day's", () => {
  const h = Buffer.from(SHA, "hex");
  for (const d of [-1, -2, -1997, -19491, -365242, -1000000]) {
    const p = FIG.positions(d, K), q = FIG.positions(d + 1, K);
    p.forEach((x, i) => {
      assert.ok(Number.isInteger(x) && x >= 0 && x < FIG.M[i], `day ${d}, ring ${i}: ${x}`);
      assert.equal((x + h[2 * i + 1] + 1) % FIG.M[i], q[i], `day ${d}, ring ${i}: one step to day ${d + 1}`);
    });
    assert.equal((FIG.rings(d, K).match(/stroke-dashoffset="-?\d+"/g) || []).length, 16);
    assert.ok(!/stroke-dashoffset="\d/.test(FIG.rings(d, K).replace(/stroke-dashoffset="0"/g, "")), `day ${d}: each arc begins at a position that is not negative`);
  }
  assert.deepEqual(FIG.positions(0, K), [...Array(16)].map((_, i) => h[2 * i]), "Day 0: each ring at its own byte of the hash");
});

test("the frame for /calendar (room/cz-bar.json, dayfigure): the first page's geometry and tracks, the Core's hash, one sentence", () => {
  const f = BAR.dayfigure;
  assert.deepEqual(Object.keys(f).sort(), ["core_sha256", "html"]);
  assert.equal(f.core_sha256, SHA, "the Core's SHA-256, as the build computed it from the Core's bytes");
  assert.equal(f.core_sha256, HOME.figure.core_sha256, "the same hash the first page's figure is computed from");
  assert.ok(f.html.includes(`<g class="trk" stroke-width="1">${FIG.tracks()}</g><g class="arc" stroke-width="4">__FIG_RINGS__</g>`) && HOME.html.includes(`<g class="trk" stroke-width="1">${FIG.tracks()}</g><g class="arc" stroke-width="4">__FIG_RINGS__</g>`), "the first page's tracks and the place for the arcs");
  assert.equal((f.html.match(/__FIG_RINGS__/g) || []).length, 1);
  assert.equal((f.html.match(/__FIG_DAY__/g) || []).length, 2);
  assert.equal(unesc(/<figcaption>(.*?)<\/figcaption>/.exec(f.html)[1]), "Day __FIG_DAY__'s figure: computed from the day's number and the text of the Core.");
  assert.ok(!/<script|\son\w+=|href=|src=/.test(f.html), "nothing that runs and nothing that loads");
});

test("api/page.js, where it writes the figure (dayFigure): a conversion's result carries the figure of the day converted", async () => {
  const page = require("../api/page.js");
  assert.equal(typeof page.dayFigure, "function", "api/page.js writes the figure");
  const call = (url) => new Promise((resolve) => { const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(b) { resolve({ status: this.statusCode, body: b || "" }); } }; page({ url, method: "GET", headers: {} }, res); });
  for (const [q, day, shown] of [["d=2026-10-30&c=gregorian", 1430, "1,430"], ["d=CZ%201461&c=cz", 1461, "1,461"], ["d=CZ%20-1997&c=cz", -1997, "−1,997"], ["d=2022-11-30&c=gregorian", 0, "0"], ["d=1969-07-20&c=gregorian", -19491, "−19,491"]]) {
    const r = await call(`/api/page?p=calendar&${q}`);
    const m = /<h3 id="h-result">[\s\S]*?<\/h3>\n(<figure class="dayfig">[\s\S]*?<\/figure>)\n<table class="cz-result">/.exec(r.body);
    assert.ok(r.status === 200 && m, `${q}: the figure stands under the result's heading, before the table`);
    assert.equal(m[1], BAR.dayfigure.html.replace("__FIG_RINGS__", FIG.rings(day, K)).replace(/__FIG_DAY__/g, shown), `${q}: the figure of day ${day}`);
    assert.ok(unesc(m[1]).includes(`<figcaption>Day ${shown}'s figure: computed from the day's number and the text of the Core.</figcaption>`), `${q}: the sentence names the day as prose writes it`);
    assert.ok(!r.body.includes("__FIG_"), `${q}: no placeholder left`);
  }
  const plain = await call("/api/page?p=calendar"), bad = await call("/api/page?p=calendar&d=not-a-date&c=gregorian");
  assert.ok(!plain.body.includes('class="dayfig"') && !bad.body.includes('class="dayfig"'), "no figure without a day converted");
  assert.equal(page.dayFigure(1455), BAR.dayfigure.html.replace("__FIG_RINGS__", FIG.rings(1455, K)).replace(/__FIG_DAY__/g, CZ.fmtInt(1455)));
});

// ---- the sixteen (/civilization-zero-images, rc-16): the places stand by their rings' numbers that day, written in that order
test("the sixteen: the order of a day — lowest number first, a tie inner ring first", () => {
  const page = require("../api/page.js");
  assert.deepEqual(page.sixteenOrder(["005", "003", "003", "001"]), [3, 1, 2, 0]);
  assert.deepEqual(page.sixteenOrder(Array(16).fill("000")), [...Array(16).keys()], "all equal: ring order");
  const K16 = FIG.constants(require("../room/cz-bar.json").dayfigure.core_sha256);
  assert.deepEqual(FIG.places(1455, K16), "092 166 071 082 149 239 114 163 136 001 053 214 071 208 082 002".split(" "), "Day 1455's numbers, ring 0 first");
  assert.deepEqual(page.sixteenOrder(FIG.places(1455, K16)), [9, 15, 10, 2, 12, 3, 14, 0, 6, 8, 4, 7, 1, 13, 11, 5], "Day 1455: rings 2 and 12 both stand at 071, ring 2 first; so 3 and 14 at 082");
});

test("the sixteen: the page function writes the places in the day's order, each with its number, and the day's unit", () => {
  const page = require("../api/page.js"), fs = require("node:fs"), path = require("node:path");
  const built = fs.readFileSync(path.join(__dirname, "..", "public", "civilization-zero-images.html"), "utf8");
  const places = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "sixteen.json"), "utf8")).places;
  const K16 = FIG.constants(require("../room/cz-bar.json").dayfigure.core_sha256);
  assert.equal(places.length, 16); assert.equal(new Set(places.filter(Boolean).map((p) => p.sentence)).size, places.filter(Boolean).length, "every held place its own sentence");
  for (const p of places.filter(Boolean)) for (const f of [`cz-16-${p.file}.jpg`, `cz-16-${p.file}-540.jpg`]) assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", f)), f);
  // as built: ring order, no number, no word of today
  assert.deepEqual([...built.matchAll(/<li id="p(\d+)">/g)].map((m) => +m[1]), [...Array(16).keys()]);
  assert.ok(built.includes("The places stand here in the order of their rings, the innermost first.") && !/today/.test(built.slice(built.indexOf("<main"), built.indexOf("</main>"))) && (built.match(/<b><\/b>/g) || []).length === 16);
  let openFirst = null;
  for (const day of [0, 1, 1454, 1455, 1456, 1461, 100000, -3]) {
    const out = page.sixteen(built, day), nums = FIG.places(day, K16);
    const li = [...out.matchAll(/<li id="p(\d+)"><figure[^>]*><figcaption><b>(\d{3})<\/b>/g)].map((m) => [+m[1], m[2]]);
    assert.equal(li.length, 16, `day ${day}: sixteen places`);
    assert.deepEqual(li.map(([k]) => k).slice().sort((a, b) => a - b), [...Array(16).keys()], `day ${day}: every place once`);
    for (const [k, n] of li) assert.equal(n, nums[k], `day ${day}: place ${k} carries its ring's number`);
    for (let i = 1; i < 16; i++) assert.ok(+li[i - 1][1] < +li[i][1] || (li[i - 1][1] === li[i][1] && li[i - 1][0] < li[i][0]), `day ${day}: ascending, a tie inner ring first`);
    const unit = /<!--cz-16u-->([\s\S]*?)<!--\/cz-16u-->/.exec(out)[1];
    assert.deepEqual([...unit.matchAll(/<a href="#p(\d+)">(\d{3})<\/a>/g)].map((m) => [+m[1], m[2]]), li, `day ${day}: the unit's numbers are the places, in their order, each a link to its place`);
    assert.ok(unit.includes(`<g class="arc" stroke-width="4">${FIG.rings(day, K16)}</g>`) && unit.includes(`<b class="d">Day ${day < 0 ? "−" + (-day).toLocaleString("en-US") : day.toLocaleString("en-US")}</b>`) || day < 0, `day ${day}: the day's figure and the day`);
    assert.ok(unit.replace(/<[^>]+>/g, "").includes("Nobody set today's order: each place stands by its ring's number, lowest first. Tomorrow the numbers will be different.") && out.includes(`aria-label="The sixteen places, in today's order"`));
    const imgs = [...out.matchAll(/<img [^>]*>/g)].map((m) => / loading="lazy"/.test(m[0]));
    assert.deepEqual(imgs, imgs.map((_, i) => i >= 2), `day ${day}: the first two frames are asked for at once, the others when they come near`);
    assert.equal(out.replace(/<!--cz-16-->[\s\S]*?<!--\/cz-16-->/, "").replace(/<!--cz-16u-->[\s\S]*?<!--\/cz-16u-->/, ""), built.replace(/<!--cz-16-->[\s\S]*?<!--\/cz-16-->/, "").replace(/<!--cz-16u-->[\s\S]*?<!--\/cz-16u-->/, ""), `day ${day}: nothing else in the page changes`);
    if (openFirst === null && places[li[0][0]] === null) openFirst = day;
  }
  // a day on which an open place stands first: it is written first, an empty frame with its number
  let d = 1455; while (places[page.sixteenOrder(FIG.places(d, K16))[0]] !== null) d += 1;
  const o = page.sixteen(built, d), first = /<li id="p(\d+)">(<figure class="o"><figcaption><b>(\d{3})<\/b> open<\/figcaption><\/figure>)<\/li>/.exec(o);
  assert.ok(first && o.indexOf(first[0]) < o.indexOf("<img ") && first[3] === FIG.places(d, K16)[+first[1]], `day ${d}: an open place stands first`);
  // a day with all sixteen held: every place a frame, fourteen of them asked for when they come near
  const held = built.match(/<li id="p0">[\s\S]*?<\/li>/)[0];
  const full = built.replace(/<li id="p(\d+)"><figure class="o">[\s\S]*?<\/li>/g, (m0, k) => held.replace('id="p0"', `id="p${k}"`));
  const f = page.sixteen(full, 1455);
  assert.equal((f.match(/<img /g) || []).length, 16); assert.equal((f.match(/ loading="lazy"/g) || []).length, 14);
  assert.deepEqual([...f.matchAll(/<li id="p(\d+)">/g)].map((m) => +m[1]), page.sixteenOrder(FIG.places(1455, K16)));
  // a page without the build's markers, or with a place missing, is served as it is
  assert.equal(page.sixteen(built.replace("<!--cz-16-->", ""), 1455), built.replace("<!--cz-16-->", ""));
  assert.equal(page.sixteen(built.replace(/<li id="p7">[\s\S]*?<\/li>/, ""), 1455), built.replace(/<li id="p7">[\s\S]*?<\/li>/, ""));
});
