// CZ time: api/page.js and api/calendar.js called directly (no network): every static page gets the live date, the converter reads
// what people type in the calendars it knows, refuses what it cannot read, escapes what it echoes; the JSON API. Run: node site/test/cztime_functions.test.js
// call the functions directly with mock req/res
process.env.CZ_SALT = "x".repeat(40);
const SITE = require("path").resolve(__dirname, "..");
process.chdir(SITE);
function call(handler, url, headers = {}, method = "GET") {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body: body || "" }); } };
    const r = handler({ url, method, headers }, res);
    if (r && r.then) r.catch((e) => resolve({ status: 599, body: String(e.stack) }));
  });
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
(async () => {
  const page = require(SITE + "/api/page.js"), cal = require(SITE + "/api/calendar.js");
  for (const p of ["core", "core.fa", "core.ar", "core.zh-Hans", "record", "objections", "ask", "machine", "about", "archive", "calendar"]) {
    const r = await call(page, `/api/page?p=${p}`);
    ok(r.status === 200, p + " status " + r.status);
    ok(/<aside class="cz-now"[^>]*><p><a class="cz-stamp" href="\/calendar" aria-describedby="cz-read"><time datetime="\d{4}-\d\d-\d\d">CZ\+\d+:\d{3}<\/time><\/a>/.test(r.body), p + " live stamp");
    ok(!r.body.includes("__CZ_") && !r.body.includes("https://civilizationzero.ai/calendar\">CZ time"), p + " placeholders/fallback left");
    ok(/s-maxage=\d+/.test(r.headers["cache-control"]), p + " cache");
    if (p === "core.fa") ok(r.body.includes('<option value="solar-hijri" selected>'), "fa default solar");
    if (p === "core.ar") ok(r.body.includes('<option value="lunar-hijri" selected>'), "ar default lunar");
    if (p === "core") ok(r.body.includes('<option value="gregorian" selected>'), "en default gregorian");
    if (p === "calendar") ok(!r.body.includes('id="czb-d"') && r.body.includes('id="cal-d"') && r.body.includes("Today is <strong>"), "calendar: noform bar + own form + today");
  }
  const nf = await call(page, "/api/page?p=../secret"); ok(nf.status === 404 && nf.body.includes("Not found"), "404 for bad p");
  const nf2 = await call(page, "/api/page?p=core.xx"); ok(nf2.status === 404, "404 for missing translation");
  const post = await call(page, "/api/page?p=core", {}, "POST"); ok(post.status === 405, "405 for POST");
  const cases = [
    ["1405-08-08", "solar-hijri", "CZ+3:334"], ["۱۴۰۵/۰۸/۰۸", "solar-hijri", "CZ+3:334"], ["8 Aban 1405", "gregorian", "CZ+3:334"], ["۸ آبان ۱۴۰۵", "gregorian", "CZ+3:334"],
    ["1448-05-19", "lunar-hijri", "CZ+3:334"], ["١٩ جمادى الأولى ١٤٤٨", "lunar-hijri", "CZ+3:334"], ["2026-10-30", "gregorian", "CZ+3:334"], ["30/10/2026", "gregorian", "CZ+3:334"],
    ["10/30/2026", "gregorian", "CZ+3:334"], ["Oct 30, 2026", "gregorian", "CZ+3:334"], ["30 October 2026", "gregorian", "CZ+3:334"], ["2026-10-17", "julian", "CZ+3:334"],
    ["CZ+3:334", "gregorian", "CZ+3:334"], ["CZ+1430", "gregorian", "CZ+3:334"], ["1430", "cz", "CZ+3:334"], ["CZ−5:171", "cz", "CZ−5:171"], ["-1997", "cz", "CZ−5:171"],
    ["2017-06-12", "gregorian", "CZ−5:171"], ["1969-07-20", "gregorian", "CZ−53:133"], ["2022-11-29", "gregorian", "CZ−0:001"], ["3:334", "gregorian", "CZ+3:334"],
    ["500-03-01 BCE", "gregorian", null], ["0001-01-01", "gregorian", null], ["today", "gregorian", "CZ+"], ["CZ+4:000", "cz", "CZ+4:000"], ["2026-11-30", "gregorian", "CZ+4:000"],
  ];
  for (const [d, c, want] of cases) {
    const r = await call(page, `/api/page?p=calendar&d=${encodeURIComponent(d)}&c=${c}`);
    const m = /<h2 id="h-result">([^<]*)<\/h2>/.exec(r.body);
    ok(r.status === 200 && m && (want === null || m[1].includes(want)), `convert ${d} (${c}) -> ${m && m[1]} want ${want}`);
    ok(r.headers["x-robots-tag"] === "noindex", "noindex on a conversion");
  }
  const bad = [["2026-02-30", "gregorian", "has 28 days"], ["1405-13-01", "solar-hijri", "no month 13"], ["foo", "gregorian", "not a month"], ["CZ+3:366", "cz", "not a day"],
               ["5/10/26", "gregorian", "year in full"], ["<script>alert(1)</script>", "gregorian", "not a month"], ["2026-10", "gregorian", "year-month-day"], ["99999-01-01", "gregorian", "range"]];
  for (const [d, c, want] of bad) {
    const r = await call(page, `/api/page?p=calendar&d=${encodeURIComponent(d)}&c=${c}`);
    const m = /<p class="pending" role="alert" id="result">([^<]*)<\/p>/.exec(r.body);
    ok(m && !r.body.includes("<script>alert"), `error for ${d}: ${m && m[1]}`);
  }
  // the value typed is echoed escaped in the form
  const x = await call(page, `/api/page?p=calendar&d=${encodeURIComponent('"><b>x')}&c=gregorian`);
  ok(x.body.includes('value="&quot;&gt;&lt;b&gt;x"') && !x.body.includes('"><b>x'), "echo escaped");
  // JSON API
  const j = await call(cal, "/api/calendar?d=1405-08-08&c=solar-hijri");
  const o = JSON.parse(j.body);
  ok(j.status === 200 && o.cz.stamp === "CZ+3:334" && o.cz.day === 1430 && o.gregorian.date === "2026-10-30" && o.lunar_hijri.method === "umm-al-qura" && o.jdn === 2461344 && o.weekday === "Friday", "api conversion");
  const j0 = JSON.parse((await call(cal, "/api/calendar")).body); ok(j0.input === null && j0.today.day === j0.cz.day && j0.from_today_days === 0, "api today");
  const jb = await call(cal, "/api/calendar?d=2026-02-30"); ok(jb.status === 400 && JSON.parse(jb.body).error.includes("28 days"), "api 400");
  const jc = await call(cal, "/api/calendar?d=2026-01-01&c=mayan"); ok(jc.status === 400, "api bad c");
  const jn = JSON.parse((await call(cal, "/api/calendar?d=CZ-1997&c=cz")).body); ok(jn.cz.stamp === "CZ−5:171" && jn.cz.stamp_ascii === "CZ-5:171" && jn.cz.machine === "CZ-1997", "api negative");
  const jo = JSON.parse((await call(cal, "/api/calendar?d=0600-01-01")).body); ok(jo.lunar_hijri === null && jo.solar_hijri === null, "api before both Hijri eras");
  console.log(`pass ${pass} fail ${fail}`); process.exitCode = fail ? 1 : 0;
})();
