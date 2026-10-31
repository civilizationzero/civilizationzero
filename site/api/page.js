// The site's static pages (site/public/*.html, written by site/build.py), served with today's date in CZ time at the top: the
// originator's decision of 30 October 2026 (CZ 1430) made CZ time the basis of the site's dates, on every page. The files are
// bundled with this function (vercel.json, includeFiles) and read once per instance; the build leaves a fallback where the date
// goes (<!--cz-now--> … <!--/cz-now-->), which room/cztime.js replaces. The CDN keeps each page until the next 00:00 UTC, when
// the date turns. /calendar also gets, in its place (<!--cz-cal--> … <!--/cz-cal-->), today in every calendar, the converter
// with what was typed, and the conversion.
const fs = require("node:fs");
const path = require("node:path");
const CZ = require("../room/cztime.js");
const crypto = require("node:crypto");
// The same policy as the room's pages: nothing loads from elsewhere, no page can frame these, forms post here only. The one inline script
// on the site (/ask: a copy button) is allowed by its own hash, computed here from the file served, so that it cannot drift.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const scriptHashes = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
const cspFor = (html) => { const h = scriptHashes(html); return h.length ? `${CSP}; script-src ${h.join(" ")}` : CSP; };
// the page's title says what was converted, or what was wrong, so that a tab and a screen reader say it too
const plainText = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
function resultTitle(html) {
  const err = /<p class="pending" role="alert" id="(?:result|time-result)">([\s\S]*?)<\/p>/.exec(html);
  if (err) return `Error: ${plainText(err[1]).slice(0, 90)} · CZ time`;
  const t = /<h3 id="h-time-result">([\s\S]*?)<\/h3>/.exec(html) || /<h3 id="h-result">([\s\S]*?)<\/h3>/.exec(html);
  return t ? `${plainText(t[1]).slice(0, 90)} · CZ time` : null;
}

const PAGES = /^(core(\.[a-z]{2,3}(-[A-Za-z0-9]{1,8})?)?|record|objections|ask|machine|about|archive|calendar|civilization-zero-infographic|press)$/;
const files = new Map();
function read(name) {
  if (files.has(name)) return files.get(name);
  let html = null;
  for (const dir of [path.join(process.cwd(), "public"), path.join(__dirname, "..", "public")]) {
    try { html = fs.readFileSync(path.join(dir, `${name}.html`), "utf8"); break; } catch { /* the next place */ }
  }
  if (html !== null) files.set(name, html);
  return html;
}

const esc = CZ.escHtml;
const plural = (n, w) => `${CZ.fmtInt(n)} ${w}${Math.abs(n) === 1 ? "" : "s"}`;
function since(D) {   // "1430 days after Coordinate Zero": CZ time counts only days (the originator's decision of 30 Oct 2026)
  if (D === 0) return "Coordinate Zero itself";
  const n = Math.abs(D);
  return `${n} day${n === 1 ? "" : "s"} ${D < 0 ? "before" : "after"} Coordinate Zero`;
}
const fromToday = (n) => (n === 0 ? "today" : n > 0 ? `in ${plural(n, "day")}` : `${plural(-n, "day")} ago`);
const num = (n) => (n < 0 ? `−${-n}` : String(n));   // a day number as printed: no separators, a true minus
// each calendar in its own script (the originator's decision of 30 Oct 2026): Persian for the Solar Hijri, Arabic for the Lunar Hijri
const fa = (x) => `<bdi class="cz-native" lang="fa" dir="rtl">${esc(x)}</bdi>`;
const ar = (x) => `<bdi class="cz-native" lang="ar" dir="rtl">${esc(x)}</bdi>`;
const NAME = { "solar-hijri": fa("هجری شمسی"), "lunar-hijri": ar("التقويم الهجري") };
const nativeOf = (r) => (r.calendar === "solar-hijri" ? fa(r.native) : r.calendar === "lunar-hijri" ? ar(r.native) : esc(r.native));
const lunarCell = (lh) => `<bdi class="cz-native" lang="ar" dir="rtl">${esc(lh.native_long)} <span class="src">(${lh.method === "umm-al-qura" ? "أم القرى" : "الحساب الجدولي، تقريبي"})</span></bdi>`;
const czLink = (D, text) => `<a class="cz-date" href="${CZ.converterHref(D)}">${esc(text)}</a>`;

function rows(list) { return `<table class="cz-result">${list.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("")}</table>`; }
function dateResult(r, today) {
  const x = CZ.describe(r.day), g = x.gregorian, sh = x.solar_hijri, lh = x.lunar_hijri;
  const head = r.today ? `Today is ${esc(x.cz.date)}` : r.calendar === "cz" ? `${esc(r.native)} is ${esc(`${x.weekday}, ${g.text}`)}` : `${nativeOf(r)} = ${esc(x.cz.date)}`;
  const data = `/api/calendar?d=${encodeURIComponent(x.cz.machine)}&c=cz`;
  return `<section id="result" aria-labelledby="h-result"><h3 id="h-result">${head}</h3>
${rows([
    ["CZ", `<strong><data value="${r.day}">${esc(x.cz.date)}</data></strong> — ${esc(since(r.day))} · machine form <code>${esc(x.cz.machine)}</code>`],
    ["Gregorian", g.year >= 1 && g.year <= 9999 ? `<time datetime="${g.date}">${esc(`${x.weekday}, ${g.text}`)}</time>` : esc(`${x.weekday}, ${g.text}`)],
    [NAME["solar-hijri"], sh ? fa(sh.native_long) : "—"],
    [NAME["lunar-hijri"], lh ? lunarCell(lh) : "—"],
    ["Julian", esc(`${x.weekday}, ${x.julian.text}`)],
    ["Day numbers", `Julian Day Number ${num(x.jdn)} · Modified Julian Date ${num(x.mjd)} · Unix day ${num(x.unix_day)}`],
    ["From today", esc(fromToday(r.day - today))],
  ])}
<p class="src">This day as data: <a href="${esc(data)}">${esc(data)}</a></p></section>`;
}

// the date converter (#convert): today in each calendar, one to a line, the form, and the conversion
function calendarBlock(q, ms) {
  const T = CZ.barTemplates(), today = CZ.dayOf(ms), t = CZ.describe(today);
  const d = String(q.get("d") ?? "").slice(0, 80), c = q.get("c") || "gregorian", cal = CZ.CALENDARS.includes(c) ? c : "gregorian";
  const timeAsked = String(q.get("t") ?? "").trim() !== "";
  const line = `<p class="cz-today-head">Today is ${czLink(today, t.cz.date)}</p><ul class="cz-today"><li><time datetime="${t.gregorian.date}">${esc(`${t.weekday}, ${t.gregorian.text}`)}</time></li>`
    + `<li>${fa(t.solar_hijri.native_long)}</li><li>${lunarCell(t.lunar_hijri)}</li></ul>`;
  const form = typeof T.calform === "string" ? CZ.fillTemplate(T.calform, CZ.fields(ms), cal, timeAsked ? "" : esc(d)) : "";
  let out = "";
  if (d.trim() && !timeAsked) {
    const r = CZ.parse(d, cal, ms);
    out = r.ok ? dateResult(r, today) : `<p class="pending" role="alert" id="result">${esc(r.error)}</p>`;
  }
  return `${line}\n${form}\n${out}`;
}

// the time converter (#time): a local date and time in a time zone, to CZ time (a CZ day is a UTC day)
function timeBlock(q, ms) {
  const T = CZ.barTemplates(), zones = Array.isArray(T.zones) ? T.zones : [["UTC", "UTC"]];
  const d = String(q.get("d") ?? "").slice(0, 80), c = q.get("c") || "gregorian", cal = CZ.CALENDARS.includes(c) ? c : "gregorian";
  const tq = String(q.get("t") ?? "").slice(0, 12), zq = String(q.get("z") ?? "UTC");
  const zi = Math.max(0, zones.findIndex(([z]) => z === zq));
  const zone = CZ.validZone(zq) ? zq : "UTC", zoneName = (zones.find(([z]) => z === zone) || [zone, zone])[1];
  const extra = { TVALUE: tq.trim() ? esc(d) : "", TTIME: esc(tq) };
  zones.forEach((_, i) => { extra[`Z${i}`] = i === zi ? " selected" : ""; });
  const form = typeof T.timeform === "string" ? CZ.fillTemplate(T.timeform, CZ.fields(ms), cal, "", extra) : "";
  if (!tq.trim()) return form;
  const time = CZ.parseTime(tq);
  if (!time) return `${form}\n<p class="pending" role="alert" id="time-result">A time of day is written HH:MM in 24 hours, for example 13:30.</p>`;
  const r = d.trim() ? CZ.parse(d, cal, ms) : { ok: true, day: CZ.dayOf(ms), calendar: cal, native: "today", today: true };
  if (!r.ok) return `${form}\n<p class="pending" role="alert" id="time-result">${esc(r.error)}</p>`;
  const v = CZ.convertTime(r.day, time, zone);
  if (!v.ok) return `${form}\n<p class="pending" role="alert" id="time-result">${esc(v.error)}</p>`;
  const x = CZ.describe(r.day), stampUTC = `${CZ.czDay(v.day)} ${v.utc} UTC`, start = CZ.dayStartLocal(v.day, zone);
  const localDate = r.calendar === "solar-hijri" ? fa(x.solar_hijri ? x.solar_hijri.native_long : r.native) : r.calendar === "lunar-hijri" && x.lunar_hijri ? lunarCell(x.lunar_hijri)
    : esc(`${x.weekday}, ${r.calendar === "julian" ? `${x.julian.text} (Julian)` : x.gregorian.text}`);
  const differs = v.day !== r.day ? `<p class="src">In UTC this moment falls on ${v.day < r.day ? "the day before" : "the next day"}: the CZ day is ${czLink(v.day, CZ.czDay(v.day))}.</p>` : "";
  const twice = v.also && v.also.length ? `<p class="src" id="time-twice">${esc(v.local.time)} came twice that day in ${esc(zoneName)}, because the clocks were moved back: the first time (${esc(CZ.offsetText(v.offset))}) is shown above; the second, at ${esc(CZ.offsetText(v.also[0].offset))}, is ${czLink(v.also[0].day, `${CZ.czDay(v.also[0].day)} ${v.also[0].utc} UTC`)}.</p>` : "";
  return `${form}\n<section id="time-result" aria-labelledby="h-time-result"><h3 id="h-time-result">${esc(v.local.time)} in ${esc(zoneName)} = ${esc(stampUTC)}</h3>
${rows([
    ["CZ", `<strong>${czLink(v.day, stampUTC)}</strong>`],
    [`In ${esc(zoneName)}`, `${localDate} · ${esc(v.local.time)} <span class="src">(${esc(CZ.offsetText(v.offset))})</span>`],
    ["The CZ day there", `begins at ${esc(start.time)}${start.before ? " the evening before" : ""}, ${esc(zoneName)} time (${esc(CZ.offsetText(start.offset))}): 00:00 UTC`],
  ])}${differs}${twice}</section>`;
}

const CAL_RE = /<!--cz-cal-->[\s\S]*?<!--\/cz-cal-->/;
const TIME_RE = /<!--cz-time-->[\s\S]*?<!--\/cz-time-->/;
module.exports = (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.statusCode = 405; res.setHeader("Allow", "GET, HEAD"); res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Method not allowed\n");
  }
  const url = new URL(req.url, "http://x");
  const p = url.searchParams.get("p") || "";
  let status = 200, html = PAGES.test(p) ? read(p) : null;
  if (html === null) { status = 404; html = read("404") || "<!doctype html><title>Not found</title><p>Nothing is published at this address.</p>\n"; }
  const now = Date.now();
  let out = CZ.fillBar(html, now);
  const query = p === "calendar" && ["d", "c", "t", "z"].some((k) => url.searchParams.has(k));
  if (p === "calendar" && status === 200) {
    out = out.replace(CAL_RE, () => `<!--cz-cal-->${calendarBlock(url.searchParams, now)}<!--/cz-cal-->`)
             .replace(TIME_RE, () => `<!--cz-time-->${timeBlock(url.searchParams, now)}<!--/cz-time-->`);
  }
  if (query && status === 200) { const t = resultTitle(out); if (t) out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${CZ.escHtml(t)}</title>`); }
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", cspFor(out));
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${CZ.secondsToNextDay(now)}`);
  if (query || status === 404) res.setHeader("X-Robots-Tag", "noindex");   // a conversion is a view, not a page to index
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(req.method === "HEAD" ? "" : out);
};
module.exports.calendarBlock = calendarBlock;
module.exports.timeBlock = timeBlock;
