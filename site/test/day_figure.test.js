// A figure for every day (rc-12, CZ 1455). One figure, three writers: the reference implementation of rc-10 (its answers for eight days
// are kept in fixtures/day-figure.json), site/figure.py (the build's) and room/figure.js (the functions'). All three give the same
// positions and the same bytes — for days 0, 1, 1454, 1455, 1461 and 100000, and for two days before Day 0, where the rule is the same
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
const K = FIG.constants(SHA), DAYS = [0, 1, 1454, 1455, 1461, 100000, -1, -1997];
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the reference of rc-10, site/figure.py and room/figure.js: the same positions and the same bytes for eight days", () => {
  assert.equal(FX.core_sha256, SHA, "the fixture was computed from this Core");
  assert.deepEqual(FX.days.map((d) => d.day), DAYS);
  const js = DAYS.map((d) => ({ day: d, positions: FIG.positions(d, K), rings: FIG.rings(d, K) }));
  const py = execFileSync("python3", [path.join(SITE, "figure.py"), SHA, ...DAYS.map(String)], { encoding: "utf8" }).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(js, FX.days, "room/figure.js gives what the reference gave");
  assert.deepEqual(py, FX.days, "site/figure.py gives what the reference gave");
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
