// CZ time: api/page.js, api/calendar.js and the room's dates, called directly (no network). Every static page gets today's date at
// the top with links to the two converters (no form there); /calendar converts dates in each calendar's own script, and times through
// time zones; what is typed is echoed escaped; the JSON API; dates are the day count. Run: node site/test/cztime_functions.test.js
process.env.CZ_SALT = "x".repeat(40);
const SITE = require("path").resolve(__dirname, "..");
process.chdir(SITE);
const CZ = require(SITE + "/room/cztime.js");
function call(handler, url, headers = {}, method = "GET") {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body: body || "" }); } };
    const r = handler({ url, method, headers }, res);
    if (r && r.then) r.catch((e) => resolve({ status: 599, body: String(e.stack) }));
  });
}
const text = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
(async () => {
  const page = require(SITE + "/api/page.js"), cal = require(SITE + "/api/calendar.js");
  const today = CZ.dayOf(Date.now());
  for (const p of ["core", "core.fa", "core.ar", "core.zh-Hans", "record", "objections", "ask", "machine", "about", "archive", "calendar"]) {
    const r = await call(page, `/api/page?p=${p}`);
    ok(r.status === 200, p + " status " + r.status);
    const bar = (/<aside class="cz-now"[\s\S]*?<\/aside>/.exec(r.body) || [""])[0];
    ok(bar.includes(`<a class="cz-stamp" href="/calendar" aria-describedby="cz-why"><time datetime="${CZ.isoDate(...CZ.toGregorian(today))}">CZ ${today}</time></a>`), p + " live date");
    ok(!bar.includes("<form") && bar.includes('href="/calendar#convert"') && bar.includes('href="/calendar#time"')
       && bar.includes(`<p class="cz-why" id="cz-why">Day ${today} since Coordinate Zero, <span class="nw">30 November 2022</span></p>`) && !/\b[Yy]ears?\b|UTC/.test(text(bar)), p + " the bar: links, the reason (the day count only), no form");
    ok(!r.body.includes("__CZ_") && !r.body.includes('<a class="cz-stamp" href="https://civilizationzero.ai/calendar">CZ time</a>'), p + " placeholders or fallback left");
    ok(/s-maxage=\d+/.test(r.headers["cache-control"]), p + " cache");
    ok(!/CZ[+−]\d+:\d{3}/.test(text(r.body).replace(/year and day[^.]*\./gi, "")) || p === "calendar", p + " no year:day stamp printed as a date");
    if (p === "calendar") ok(r.body.includes('id="cal-d"') && r.body.includes('id="tim-d"') && r.body.includes('id="tim-z"') && r.body.includes("Today is"), "calendar: both converters and today");
    if (p === "about") ok(/<a class="cz-date" href="\/calendar\?d=CZ%2B1428"><time datetime="2026-10-28">CZ 1428<\/time><\/a>/.test(r.body), "about: dates are CZ links");
  }
  const nf = await call(page, "/api/page?p=../secret"); ok(nf.status === 404 && nf.body.includes("Not found"), "404 for bad p");
  const post = await call(page, "/api/page?p=core", {}, "POST"); ok(post.status === 405, "405 for POST");
  // the date converter, each calendar in its own script
  const cases = [
    ["1405-08-08", "solar-hijri", "۸ آبان ۱۴۰۵ = CZ 1430"], ["۱۴۰۵/۰۸/۰۸", "solar-hijri", "۸ آبان ۱۴۰۵ = CZ 1430"], ["8 Aban 1405", "gregorian", "۸ آبان ۱۴۰۵ = CZ 1430"],
    ["۸ آبان ۱۴۰۵", "gregorian", "۸ آبان ۱۴۰۵ = CZ 1430"], ["1448-05-19", "lunar-hijri", "١٩ جمادى الأولى ١٤٤٨ هـ = CZ 1430"], ["١٩ جمادى الأولى ١٤٤٨", "lunar-hijri", "= CZ 1430"],
    ["2026-10-30", "gregorian", "30 October 2026 = CZ 1430"], ["30/10/2026", "gregorian", "= CZ 1430"], ["10/30/2026", "gregorian", "= CZ 1430"], ["Oct 30, 2026", "gregorian", "= CZ 1430"],
    ["2026-10-17", "julian", "17 October 2026 (Julian) = CZ 1430"], ["CZ 1430", "gregorian", "CZ 1430 is Friday, 30 October 2026"], ["CZ+1430", "cz", "CZ 1430 is Friday"],
    ["1430", "cz", "CZ 1430 is Friday"], ["CZ −1997", "cz", "CZ −1997 is Monday, 12 June 2017"], ["-1997", "cz", "CZ −1997 is"], ["CZ+3:334", "gregorian", "CZ 1430 is Friday"],
    ["CZ 1430:15.20", "gregorian", "CZ 1430 15:20 UTC is Friday"], ["2017-06-12", "gregorian", "= CZ −1997"], ["1969-07-20", "gregorian", "= CZ −19491"], ["2022-11-29", "gregorian", "= CZ −1"],
    ["500-03-01 BCE", "gregorian", "BCE = CZ"], ["today", "gregorian", `Today is CZ ${today}`], ["2026-11-30", "gregorian", "= CZ 1461"],
    // eight digits, as a phone's number pad makes people type them (the originator's report of 30 Oct 2026: 19790306 was refused)
    ["19790306", "gregorian", "6 March 1979 = CZ −15975"], ["06031979", "gregorian", "6 March 1979 = CZ −15975"], ["13571215", "solar-hijri", "۱۵ اسفند ۱۳۵۷ = CZ −15975"],
    ["۱۳۵۷۱۲۱۵", "solar-hijri", "۱۵ اسفند ۱۳۵۷ = CZ −15975"], ["20261030", "gregorian", "30 October 2026 = CZ 1430"], ["1979/03/06", "gregorian", "= CZ −15975"],
  ];
  for (const [d, c, want] of cases) {
    const r = await call(page, `/api/page?p=calendar&d=${encodeURIComponent(d)}&c=${c}`);
    const m = /<h3 id="h-result">([\s\S]*?)<\/h3>/.exec(r.body);
    ok(r.status === 200 && m && text(m[1]).includes(want), `convert ${d} (${c}) -> ${m && text(m[1])} want ${want}`);
    ok(r.headers["x-robots-tag"] === "noindex", "noindex on a conversion");
  }
  const t1 = await call(page, `/api/page?p=calendar&d=1405-08-08&c=solar-hijri`);
  const tb = (/<table class="cz-result">[\s\S]*?<\/table>/.exec(t1.body) || [""])[0];
  ok(tb.includes('<th scope="row"><bdi class="cz-native" lang="fa" dir="rtl">هجری شمسی</bdi></th><td><bdi class="cz-native" lang="fa" dir="rtl">جمعه ۸ آبان ۱۴۰۵</bdi>')
     && tb.includes('<bdi class="cz-native" lang="ar" dir="rtl">التقويم الهجري</bdi>') && tb.includes("الجمعة ١٩ جمادى الأولى ١٤٤٨ هـ") && tb.includes("أم القرى")
     && !/Solar Hijri|Lunar Hijri|Aban|Jumada/.test(tb), "each calendar only in its own script in the result");
  // only days are counted: the CZ row gives the count of days, no years
  const czRow = (b) => text((/<tr><th scope="row">CZ<\/th><td>([\s\S]*?)<\/td><\/tr>/.exec(b) || ["", ""])[1]);
  ok(czRow(tb) === "CZ 1430 — 1430 days after Coordinate Zero · machine form CZ+1430", "result CZ row, days only: " + czRow(tb));
  const tn = (await call(page, `/api/page?p=calendar&d=2017-06-12&c=gregorian`)).body, t0 = (await call(page, `/api/page?p=calendar&d=CZ%200&c=cz`)).body, t1d = (await call(page, `/api/page?p=calendar&d=2022-12-01&c=gregorian`)).body;
  ok(czRow(tn) === "CZ −1997 — 1997 days before Coordinate Zero · machine form CZ-1997" && czRow(t0) === "CZ 0 — Coordinate Zero itself · machine form CZ+0"
     && czRow(t1d) === "CZ 1 — 1 day after Coordinate Zero · machine form CZ+1", "result CZ row before, at and just after zero: " + [czRow(tn), czRow(t0), czRow(t1d)].join(" | "));
  const bad = [["2026-02-30", "gregorian", "has 28 days"], ["1405-13-01", "solar-hijri", "no month 13"], ["foo", "gregorian", "not a month"], ["CZ+3:366", "cz", "not a day"],
               ["5/10/26", "gregorian", "year in full"], ["<script>alert(1)</script>", "gregorian", "not a month"], ["2026-10", "gregorian", "year-month-day"], ["99999-01-01", "gregorian", "range"]];
  for (const [d, c] of bad) {
    const r = await call(page, `/api/page?p=calendar&d=${encodeURIComponent(d)}&c=${c}`);
    const m = /<p class="pending" role="alert" id="result">([^<]*)<\/p>/.exec(r.body);
    ok(m && !r.body.includes("<script>alert"), `error for ${d}: ${m && m[1]}`);
  }
  const x = await call(page, `/api/page?p=calendar&d=${encodeURIComponent('"><b>x')}&c=gregorian`);
  ok(x.body.includes('value="&quot;&gt;&lt;b&gt;x"') && !x.body.includes('"><b>x'), "echo escaped");
  // the time converter
  const tc = [["2026-10-30", "gregorian", "13:30", "Asia/Tehran", "13:30 in Tehran = CZ 1430 10:00:00 UTC"], ["2026-10-30", "gregorian", "01:30", "Asia/Tehran", "01:30 in Tehran = CZ 1429 22:00:00 UTC"],
              ["۱۴۰۵/۰۸/۰۸", "solar-hijri", "۱۳:۳۰", "Asia/Tehran", "13:30 in Tehran = CZ 1430 10:00:00 UTC"], ["1969-07-20", "gregorian", "16:17:40", "America/New_York", "16:17:40 in New York = CZ −19491 20:17:40 UTC"],
              ["2026-10-30", "gregorian", "08:00", "Asia/Kuala_Lumpur", "08:00 in Kuala Lumpur, Singapore = CZ 1430 00:00:00 UTC"], ["", "gregorian", "12:00", "UTC", `12:00 in UTC = CZ ${today} 12:00:00 UTC`],
              ["2026-10-30", "gregorian", "12:00", "Mars/Olympus", "12:00 in Mars/Olympus"],
              ["2026-10-30", "gregorian", "1330", "Asia/Tehran", "13:30 in Tehran = CZ 1430 10:00:00 UTC"], ["2026-10-30", "gregorian", "1:30 pm", "Asia/Tehran", "13:30 in Tehran = CZ 1430 10:00:00 UTC"],
              ["19790306", "gregorian", "08:00", "Asia/Tehran", "08:00 in Tehran = CZ −15975 04:30:00 UTC"]];
  for (const [d, c, t, z, want] of tc) {
    const r = await call(page, `/api/page?p=calendar&d=${encodeURIComponent(d)}&c=${c}&t=${encodeURIComponent(t)}&z=${encodeURIComponent(z)}`);
    const m = /<h3 id="h-time-result">([\s\S]*?)<\/h3>/.exec(r.body);
    if (z === "Mars/Olympus") ok(m && text(m[1]).startsWith("12:00 in UTC"), `an unknown zone is read as UTC: ${m && text(m[1])}`);
    else ok(m && text(m[1]) === want, `time ${d} ${t} ${z} -> ${m && text(m[1])} want ${want}`);
    ok(!/<h3 id="h-result">/.test(r.body), "a time conversion shows no date result");
  }
  const tday = await call(page, `/api/page?p=calendar&d=2026-10-30&c=gregorian&t=01:30&z=Asia%2FTehran`);
  ok(tday.body.includes("In UTC this moment falls on the day before"), "the CZ day differs from the local date: said");
  ok(text(tday.body).includes("begins at 03:30, Tehran time"), "where a CZ day begins, locally");
  const tbad = await call(page, `/api/page?p=calendar&t=25:00&z=UTC`); ok(/role="alert" id="time-result">A time of day is written HH:MM/.test(tbad.body), "a bad time: said");
  // summer time: a wall time that did not exist is refused; one that came twice gives both moments (audit CZ01)
  const tgap = await call(page, `/api/page?p=calendar&d=2026-03-08&t=02:30&z=America%2FNew_York`);
  ok(/role="alert" id="time-result">02:30 did not happen on that day in this time zone: the clocks were moved forward, from UTC−05:00 to UTC−04:00/.test(tgap.body) && !/h-time-result/.test(tgap.body), "a time in the spring gap: refused");
  const tfold = await call(page, `/api/page?p=calendar&d=2026-11-01&t=01:30&z=America%2FNew_York`), mf = /<h3 id="h-time-result">([\s\S]*?)<\/h3>/.exec(tfold.body);
  ok(mf && text(mf[1]) === "01:30 in New York = CZ 1432 05:30:00 UTC" && text(tfold.body).includes("01:30 came twice that day in New York, because the clocks were moved back: the first time (UTC−04:00) is shown above; the second, at UTC−05:00, is CZ 1432 06:30:00 UTC."), "a time in the autumn overlap: both moments");
  ok(/<tr><th[^>]*>01:30 again<\/th><td><strong><a[^>]*>CZ 1432 06:30:00 UTC<\/a><\/strong> <span class="src">\(UTC−05:00, after the clocks went back\)<\/span><\/td><\/tr>/.test(tfold.body.replace(/<time[^>]*>|<\/time>/g, "")), "the second moment has its own row, with its offset");
  for (const [y, mo, d, h, mi, z] of [[2026, 3, 29, 2, 30, "Europe/Berlin"], [2026, 3, 8, 2, 0, "America/New_York"], [2011, 12, 30, 12, 0, "Pacific/Apia"]])
    ok(CZ.convertTime(CZ.fromGregorian(y, mo, d), [h, mi, 0], z).ok === false, `gap ${z} ${y}-${mo}-${d} ${h}:${mi}`);
  for (const [y, mo, d, h, mi, z, n] of [[2026, 10, 25, 2, 30, "Europe/Berlin", 2], [2026, 3, 8, 3, 0, "America/New_York", 1], [2026, 3, 8, 1, 59, "America/New_York", 1], [2026, 11, 1, 2, 0, "America/New_York", 1], [2026, 3, 21, 0, 0, "Asia/Tehran", 1]]) {
    const v = CZ.convertTime(CZ.fromGregorian(y, mo, d), [h, mi, 0], z), back = new Date(v.utc_ms + v.offset * 60000);
    ok(v.ok && 1 + (v.also ? v.also.length : 0) === n && back.getUTCHours() === h && back.getUTCMinutes() === mi, `round trip ${z} ${y}-${mo}-${d} ${h}:${mi}`);
  }
  // leap days and day crossings through the converter (regression)
  for (const [d, t, z, want] of [["2024-02-29", "12:00", "Europe/Berlin", "12:00 in Berlin, Paris, Rome = CZ 456 11:00:00 UTC"], ["2028-02-29", "23:30", "America/New_York", "23:30 in New York = CZ 1918 04:30:00 UTC"],
                                  ["2025-03-01", "00:15", "Asia/Tehran", "00:15 in Tehran = CZ 821 20:45:00 UTC"]]) {
    const r = await call(page, `/api/page?p=calendar&d=${d}&c=gregorian&t=${encodeURIComponent(t)}&z=${encodeURIComponent(z)}`), m = /<h3 id="h-time-result">([\s\S]*?)<\/h3>/.exec(r.body);
    ok(m && text(m[1]) === want, `leap/crossing ${d} ${t} ${z} -> ${m && text(m[1])} want ${want}`);
  }
  const tsel = await call(page, `/api/page?p=calendar&d=2026-10-30&t=13:30&z=Asia%2FTehran`); ok(tsel.body.includes('<option value="Asia/Tehran" selected>Tehran</option>'), "the zone stays chosen");
  // the JSON API
  const j = await call(cal, "/api/calendar?d=1405-08-08&c=solar-hijri"); const o = JSON.parse(j.body);
  ok(j.status === 200 && o.cz.date === "CZ 1430" && o.cz.machine === "CZ+1430" && o.cz.year_day === "CZ+3:334" && o.cz.day === 1430 && o.gregorian.date === "2026-10-30"
     && o.lunar_hijri.method === "umm-al-qura" && o.jdn === 2461344 && o.weekday === "Friday" && o.solar_hijri.native_long === "جمعه ۸ آبان ۱۴۰۵", "api conversion");
  const j0 = JSON.parse((await call(cal, "/api/calendar")).body); ok(j0.input === null && j0.today.day === j0.cz.day && j0.from_today_days === 0 && j0.today.date === `CZ ${today}`, "api today");
  const jb = await call(cal, "/api/calendar?d=2026-02-30"); ok(jb.status === 400 && JSON.parse(jb.body).error.includes("28 days"), "api 400");
  const jc = await call(cal, "/api/calendar?d=2026-01-01&c=mayan"); ok(jc.status === 400, "api bad c");
  const jn = JSON.parse((await call(cal, "/api/calendar?d=CZ-1997&c=cz")).body); ok(jn.cz.date === "CZ −1997" && jn.cz.machine === "CZ-1997" && jn.cz.year_day === "CZ-5:171", "api negative");
  const jo = JSON.parse((await call(cal, "/api/calendar?d=0600-01-01")).body); ok(jo.lunar_hijri === null && jo.solar_hijri === null, "api before both Hijri eras");
  // the room's dates and the register's: the day count, the time in UTC, a link to the converter
  ok(CZ.whenHtml("2026-10-29T18:46:18.123456+00:00") === '<a class="cz-date" href="/calendar?d=CZ%2B1429"><time datetime="2026-10-29T18:46Z">CZ 1429 18:46 UTC</time></a>', "a moment in a post");
  ok(CZ.whenHtml("2026-10-29T18:46:18Z", { seconds: true }).includes(">CZ 1429 18:46:18 UTC<") && CZ.whenHtml("2026-11-30").includes(">CZ 1461<"), "with seconds; a day");
  ok(CZ.whenHtml("not a date<") === "not a date&lt;", "anything else, escaped");
  console.log(`pass ${pass} fail ${fail}`); process.exitCode = fail ? 1 : 0;
})();
