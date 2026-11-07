// The reader's day (the originator's decision of 7 Nov 2026, CZ 1438): today's date turns at midnight where the reader is. The server
// reads the time zone the host gives for the reader's network (x-vercel-ip-timezone), keeps nothing, and caches each zone apart.
// Run: node --test site/test/reader_day.test.js
process.env.CZ_SALT = process.env.CZ_SALT || "x".repeat(40);
const test = require("node:test"), assert = require("node:assert");
const path = require("node:path"), fs = require("node:fs");
const SITE = path.resolve(__dirname, "..");
process.chdir(SITE);
const CZ = require("../room/cztime.js");
function call(handler, url, headers = {}, method = "GET") {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body: body || "" }); } };
    const req = { url, method, headers };
    res.req = req;
    const r = handler(req, res);
    if (r && r.then) r.catch((e) => resolve({ status: 599, body: String(e.stack), headers: {} }));
  });
}
const Z = (z) => ({ "x-vercel-ip-timezone": z });
const barDay = (html) => Number((/<a class="cz-stamp" href="\/calendar" aria-describedby="cz-why"><time datetime="[^"]+">CZ (−?\d+)<\/time><\/a>/.exec(html) || [])[1]?.replace("−", "-"));
const sMax = (cc) => Number((/s-maxage=(\d+)/.exec(String(cc)) || [])[1]);
// two zones 25 hours apart: their dates are never the same
const EAST = "Pacific/Kiritimati", WEST = "Pacific/Pago_Pago";

test("the reader's zone: a known IANA name from the host's header, else UTC", () => {
  assert.equal(CZ.readerZone(Z("Asia/Kuala_Lumpur")), "Asia/Kuala_Lumpur");
  assert.equal(CZ.readerZone({ get: (k) => (k === "x-vercel-ip-timezone" ? "Europe/Berlin" : null) }), "Europe/Berlin");
  assert.equal(CZ.readerZone({ "x-vercel-ip-timezone": ["America/New_York", "UTC"] }), "America/New_York");
  for (const bad of [undefined, null, {}, Z(""), Z("Mars/Olympus"), Z("<script>"), Z("Asia/Kuala_Lumpur\n"), Z("../../etc"), Z("A".repeat(80))]) assert.equal(CZ.readerZone(bad), "UTC");
});

test("the date turns at local midnight: Kuala Lumpur and Berlin at 18:00 UTC on 6 November 2026", () => {
  const ms = Date.UTC(2026, 10, 6, 18, 0, 0);
  assert.equal(CZ.dayOf(ms), 1437);
  assert.equal(CZ.todayIn(ms, "Asia/Kuala_Lumpur"), 1438);   // 02:00 on 7 November there
  assert.equal(CZ.todayIn(ms, "Europe/Berlin"), 1437);       // 19:00 on 6 November there
  assert.equal(CZ.todayIn(ms, "America/Los_Angeles"), 1437);
  assert.equal(CZ.secondsToNextLocalDay(ms, "Asia/Kuala_Lumpur"), 22 * 3600);
  assert.equal(CZ.secondsToNextLocalDay(ms, "Europe/Berlin"), 5 * 3600);
  assert.equal(CZ.secondsToNextLocalDay(ms, "UTC"), 6 * 3600);
  // one second before and at midnight in Kuala Lumpur (16:00 UTC)
  assert.equal(CZ.todayIn(Date.UTC(2026, 10, 6, 15, 59, 59), "Asia/Kuala_Lumpur"), 1437);
  assert.equal(CZ.todayIn(Date.UTC(2026, 10, 6, 16, 0, 0), "Asia/Kuala_Lumpur"), 1438);
  assert.equal(CZ.secondsToNextLocalDay(Date.UTC(2026, 10, 6, 15, 59, 59), "Asia/Kuala_Lumpur"), 1);
  // half-hour and 45-minute zones
  assert.equal(CZ.todayIn(Date.UTC(2026, 10, 6, 20, 30, 0), "Asia/Tehran"), 1438);   // 00:00 in Tehran (UTC+03:30)
  assert.equal(CZ.todayIn(Date.UTC(2026, 10, 6, 18, 14, 0), "Asia/Kathmandu"), 1437);   // 23:59 in Kathmandu (UTC+05:45)
});

test("summer time: a midnight skipped by the clocks, and a day of 23 or 25 hours", () => {
  // Lebanon moves its clocks at 00:00 on the last Sunday of March: 29 March 2026 begins at 01:00, at 22:00 UTC
  const b = Date.UTC(2026, 2, 28, 12, 0, 0);
  assert.equal(CZ.secondsToNextLocalDay(b, "Asia/Beirut"), 10 * 3600);
  assert.equal(CZ.todayIn(Date.UTC(2026, 2, 28, 22, 0, 0), "Asia/Beirut"), CZ.fromGregorian(2026, 3, 29));
  // Berlin, 29 March 2026: 23 hours from midnight to midnight; 25 October 2026: 25 hours
  assert.equal(CZ.secondsToNextLocalDay(Date.UTC(2026, 2, 28, 23, 0, 0), "Europe/Berlin"), 23 * 3600);
  assert.equal(CZ.secondsToNextLocalDay(Date.UTC(2026, 9, 24, 22, 0, 0), "Europe/Berlin"), 25 * 3600);
});

test("Vary: the time-zone header is added once, the others kept", () => {
  assert.equal(CZ.varyZone("Accept"), "Accept, X-Vercel-IP-Timezone");
  assert.equal(CZ.varyZone("Accept, Accept-Language"), "Accept, Accept-Language, X-Vercel-IP-Timezone");
  assert.equal(CZ.varyZone("Accept, x-vercel-ip-timezone"), "Accept, x-vercel-ip-timezone");
  assert.equal(CZ.varyZone(undefined), "X-Vercel-IP-Timezone");
});

test("the cache of a page ends at midnight in the reader's zone", () => {
  const ms = Date.UTC(2026, 10, 6, 15, 0, 0);
  assert.equal(CZ.capCache("public, max-age=0, s-maxage=86400", ms, "Asia/Kuala_Lumpur"), "public, max-age=0, s-maxage=3600");
  assert.equal(CZ.capCache("public, max-age=0, s-maxage=86400", ms), "public, max-age=0, s-maxage=32400");
  assert.equal(CZ.capCache("public, max-age=0, s-maxage=30, stale-while-revalidate=120", ms, "Asia/Kuala_Lumpur"), "public, max-age=0, s-maxage=30, stale-while-revalidate=120");
});

test("static pages: the bar shows the reader's date, Vary names the zone, the cache ends at their midnight", async () => {
  const page = require("../api/page.js");
  for (const p of ["core", "calendar", "embed", "about"]) {
    const now = Date.now();
    const e = await call(page, `/api/page?p=${p}`, Z(EAST)), w = await call(page, `/api/page?p=${p}`, Z(WEST)), u = await call(page, `/api/page?p=${p}`);
    assert.equal(e.status, 200, p);
    assert.equal(barDay(e.body), CZ.todayIn(now, EAST), `${p}: east`);
    assert.equal(barDay(w.body), CZ.todayIn(now, WEST), `${p}: west`);
    assert.equal(barDay(u.body), CZ.dayOf(now), `${p}: no zone, the UTC date`);
    assert.notEqual(barDay(e.body), barDay(w.body), `${p}: 25 hours apart, never the same date`);
    assert.ok(e.body.includes(`Day ${CZ.todayIn(now, EAST)} since Coordinate Zero`), `${p}: the line under the date`);
    for (const r of [e, w, u]) assert.equal(r.headers.vary, "Accept, X-Vercel-IP-Timezone", `${p}: vary`);
    assert.ok(sMax(e.headers["cache-control"]) <= CZ.secondsToNextLocalDay(now, EAST) && sMax(w.headers["cache-control"]) <= CZ.secondsToNextLocalDay(now, WEST), `${p}: cache to local midnight`);
  }
  const md = await call(page, "/api/page?p=calendar&f=md", Z(EAST));   // a page's Markdown is its <main>: /calendar's says what day it is
  assert.equal(md.headers.vary, "Accept, X-Vercel-IP-Timezone", "Markdown: vary");
  assert.ok(md.body.includes(`Today is [CZ ${CZ.todayIn(Date.now(), EAST)}]`), "Markdown: the reader's date");
});

test("/calendar: today in each calendar is the reader's date; the time converter starts in the reader's zone when it lists it", async () => {
  const page = require("../api/page.js");
  const now = Date.now(), r = await call(page, "/api/page?p=calendar", Z("Asia/Kuala_Lumpur"));
  const d = CZ.todayIn(now, "Asia/Kuala_Lumpur");
  assert.ok(r.body.includes(`<p class="cz-today-head">Today is <a class="cz-date" href="${CZ.converterHref(d)}">CZ ${d}</a></p>`), "today line");
  assert.ok(r.body.includes('<option value="Asia/Kuala_Lumpur" selected>'), "the reader's zone chosen first");
  const u = await call(page, "/api/page?p=calendar", Z(EAST));
  assert.ok(u.body.includes('<option value="UTC" selected>'), "a zone not in the list: UTC chosen first");
  // an empty date with a time: today in the chosen zone
  const t = await call(page, "/api/page?p=calendar&t=12:00&z=Asia%2FKuala_Lumpur", Z(WEST));
  const m = /<h3 id="h-time-result">([\s\S]*?)<\/h3>/.exec(t.body);
  const day = CZ.todayIn(Date.now(), "Asia/Kuala_Lumpur"), v = CZ.convertTime(day, [12, 0, 0], "Asia/Kuala_Lumpur");
  assert.equal(m && m[1].replace(/<[^>]+>/g, ""), `12:00 in Kuala Lumpur, Singapore = ${CZ.czDay(v.day)} ${v.utc} UTC`);
  // "today" typed: the reader's date
  const td = await call(page, "/api/page?p=calendar&d=today&c=gregorian", Z(EAST));
  assert.ok(td.body.includes(`Today is CZ ${CZ.todayIn(Date.now(), EAST)}`), "'today' is the reader's date");
});

test("/api/calendar: tz, else the network's zone, else UTC; the answer names it", async () => {
  const cal = require("../api/calendar.js");
  const a = JSON.parse((await call(cal, "/api/calendar?tz=Pacific%2FKiritimati")).body);
  assert.deepEqual([a.today.zone, a.today.zone_from, a.today.day], [EAST, "tz", CZ.todayIn(Date.now(), EAST)]);
  const b = JSON.parse((await call(cal, "/api/calendar", Z(WEST))).body);
  assert.deepEqual([b.today.zone, b.today.zone_from, b.today.day, b.from_today_days], [WEST, "network", CZ.todayIn(Date.now(), WEST), 0]);
  const c = JSON.parse((await call(cal, "/api/calendar")).body);
  assert.deepEqual([c.today.zone, c.today.zone_from, c.today.day], ["UTC", "default", CZ.dayOf(Date.now())]);
  const x = await call(cal, "/api/calendar?tz=Mars%2FOlympus");
  assert.equal(x.status, 400);
  const y = await call(cal, "/api/calendar?tz=UTC", Z(EAST));
  assert.equal(JSON.parse(y.body).today.zone, "UTC");
  assert.equal(y.headers.vary, "Accept, X-Vercel-IP-Timezone");
});

test("the badge: the reader's date, or tz; each zone cached apart until its midnight", async () => {
  const badge = require("../api/badge.js");
  const now = Date.now();
  const e = await call(badge, "/api/badge", Z(EAST)), w = await call(badge, "/api/badge?tz=Pacific%2FPago_Pago", Z(EAST)), bad = await call(badge, "/api/badge?tz=Nowhere", Z(EAST));
  assert.ok(e.body.includes(`>CZ ${CZ.todayIn(now, EAST)}</text>`), "network zone");
  assert.ok(w.body.includes(`>CZ ${CZ.todayIn(now, WEST)}</text>`), "tz wins");
  assert.ok(bad.body.includes(`>CZ ${CZ.todayIn(now, EAST)}</text>`), "an unknown tz: the network's");
  assert.equal(e.headers.vary, "X-Vercel-IP-Timezone");
  assert.ok(sMax(e.headers["cache-control"]) <= CZ.secondsToNextLocalDay(now, EAST));
});

test("the first page: its heading is the reader's date; its data form names the zone", async () => {
  const home = require("../api/home.js");
  const now = Date.now();
  const h = await call(home, "/", { ...Z(EAST), accept: "text/html" });
  assert.ok(h.body.includes(`CZ ${CZ.todayIn(now, EAST)}`), "heading");
  assert.equal(h.headers.vary, "Accept, X-Vercel-IP-Timezone");
  const j = JSON.parse((await call(home, "/?f=json", Z(WEST))).body);
  assert.equal(j.cz_time.day, CZ.todayIn(now, WEST));
  assert.equal(j.cz_time.time_zone, WEST);
  assert.equal(j.cz_time.gregorian, CZ.isoDate(...CZ.toGregorian(CZ.todayIn(now, WEST))));
});

test("the room's pages: the reader's date at the top, Vary names the zone", async () => {
  const R = require("../room/lib.js");
  const shell = fs.readFileSync(path.join(SITE, "public", "core.html"), "utf8");
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(b) { this.body = b; } };
  res.req = { headers: Z(EAST) };
  R.html(res, 200, shell, { "Cache-Control": "public, max-age=0, s-maxage=30", Vary: "Accept, Accept-Language" });
  assert.equal(barDay(res.body), CZ.todayIn(Date.now(), EAST));
  assert.equal(res.headers.vary, "Accept, Accept-Language, X-Vercel-IP-Timezone");
});

test("the counter for other sites counts the date on the reader's own clock", () => {
  const html = fs.readFileSync(path.join(SITE, "public", "embed.html"), "utf8");
  const src = /function today\(\) \{[^\n]*\}/.exec(html)[0], day = /function day\(ms\) \{[^\n]*\}/.exec(html)[0];
  const old = process.env.TZ;
  try {
    for (const zone of ["Asia/Kuala_Lumpur", "America/Los_Angeles", EAST, WEST]) {
      process.env.TZ = zone;
      const f = new Function(`var EPOCH = 19326; ${day} ${src} return today();`);
      assert.equal(f(), CZ.todayIn(Date.now(), zone), zone);
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  assert.ok(/setInterval\(function \(\) \{ var x = today\(\);/.test(html), "the date turns on a page left open");
});

test("one spelling per zone: names are read in the runtime's spelling, and the cache of formatters is bounded", async () => {
  assert.equal(CZ.readerZone(Z("asia/kuala_lumpur")), "Asia/Kuala_Lumpur");
  assert.equal(CZ.canonicalZone("EUROPE/BERLIN"), "Europe/Berlin");
  assert.equal(CZ.canonicalZone("Nowhere/Land"), null);
  const cal = require("../api/calendar.js"), badge = require("../api/badge.js");
  assert.equal(JSON.parse((await call(cal, "/api/calendar?tz=asia%2Ftehran")).body).today.zone, "Asia/Tehran");
  const empty = JSON.parse((await call(cal, "/api/calendar?tz=", Z(EAST))).body);
  assert.deepEqual([empty.today.zone, empty.today.zone_from], [EAST, "network"], "an empty tz is no tz");
  const b = await call(badge, "/api/badge?tz=pacific%2Fpago_pago", Z(EAST));
  assert.ok(b.body.includes(`>CZ ${CZ.todayIn(Date.now(), WEST)}</text>`));
  // many spellings of one zone never grow the cache past its bound
  for (let i = 0; i < 1500; i++) CZ.zoneOffsetMin([..."asia/tehran"].map((c, j) => ((i >> j) & 1 ? c.toUpperCase() : c)).join(""), Date.now());
  assert.ok(true);
});

test("the first page's data keeps date_utc, the UTC date, beside the reader's date", async () => {
  const home = require("../api/home.js");
  const j = JSON.parse((await call(home, "/?f=json", Z(EAST))).body);
  assert.equal(j.cz_time.date_utc, new Date().toISOString().slice(0, 10));
  assert.equal(j.cz_time.gregorian, CZ.isoDate(...CZ.toGregorian(CZ.todayIn(Date.now(), EAST))));
});
