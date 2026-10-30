// The site's static pages (site/public/*.html, written by site/build.py), served with today's date in CZ time at the top: the
// originator's decision of 30 October 2026 (CZ+3:334) made CZ time the basis of the site's dates, on every page. The files are
// bundled with this function (vercel.json, includeFiles) and read once per instance; the build leaves a fallback where the date
// goes (<!--cz-now--> … <!--/cz-now-->), which room/cztime.js replaces. The CDN keeps each page until the next 00:00 UTC, when
// the date turns. /calendar also gets, in its place (<!--cz-cal--> … <!--/cz-cal-->), today in every calendar, the converter
// with what was typed, and the conversion.
const fs = require("node:fs");
const path = require("node:path");
const CZ = require("../room/cztime.js");

const PAGES = /^(core(\.[a-z]{2,3}(-[A-Za-z0-9]{1,8})?)?|record|objections|ask|machine|about|archive|calendar)$/;
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

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n, w) => `${CZ.fmtInt(n)} ${w}${Math.abs(n) === 1 ? "" : "s"}`;
function since(p) {   // "3 years and 334 days after Coordinate Zero"
  if (p.sign > 0 && p.year === 0 && p.day === 0) return "Coordinate Zero itself";
  const amount = p.year && p.day ? `${plural(p.year, "year")} and ${plural(p.day, "day")}` : p.year ? plural(p.year, "year") : plural(p.day, "day");
  return `${amount} ${p.sign < 0 ? "before" : "after"} Coordinate Zero`;
}
const num = (n) => (n < 0 ? `\u2212${-n}` : String(n));   // a day number as printed: no separators, a true minus
const fromToday = (n) => (n === 0 ? "today" : n > 0 ? `in ${plural(n, "day")}` : `${plural(-n, "day")} ago`);
const fa = (x) => `<bdi class="cz-native" lang="fa" dir="rtl">${esc(x)}</bdi>`;
const ar = (x) => `<bdi class="cz-native" lang="ar" dir="rtl">${esc(x)}</bdi>`;

function result(r, today) {
  const x = CZ.describe(r.day), p = CZ.parts(r.day), g = x.gregorian, sh = x.solar_hijri, lh = x.lunar_hijri;
  const rows = [
    ["CZ time", `<strong>${esc(x.cz.stamp)}</strong> — ${esc(since(p))} · day <data value="${r.day}">${esc(CZ.fmtInt(r.day))}</data> · <code>${esc(x.cz.machine)}</code>`],
    ["Weekday", esc(x.weekday)],
    ["Gregorian", g.year >= 1 && g.year <= 9999 ? `<time datetime="${g.date}">${esc(g.text)}</time>` : esc(g.text)],
    ["Solar Hijri", sh ? `${esc(sh.text)} · ${fa(sh.native)}` : "— <span class=\"src\">(outside the years converted here, 1 to 3177 SH)</span>"],
    ["Lunar Hijri", lh ? `${esc(lh.text)} · ${ar(lh.native)} <span class="src">(${lh.method === "umm-al-qura" ? "Umm al-Qura" : "tabular calendar, an approximation"})</span>`
      : "— <span class=\"src\">(before the Hijri era)</span>"],
    ["Julian", esc(x.julian.text)],
    ["Day numbers", `Julian Day Number ${num(x.jdn)} · Modified Julian Date ${num(x.mjd)} · Unix day ${num(x.unix_day)}`],
    ["From today", esc(fromToday(r.day - today))],
  ];
  const data = `/api/calendar?d=${encodeURIComponent(x.cz.machine)}&c=cz`;
  const head = r.today ? `Today is ${x.cz.stamp}` : r.read === x.cz.stamp ? `${x.cz.stamp} is ${x.weekday}, ${g.text}` : `${r.read} is ${x.cz.stamp}`;
  return `<section id="result" aria-labelledby="h-result"><h2 id="h-result">${esc(head)}</h2>
<table class="cz-result">${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("")}</table>
<p class="src">This day as data: <a href="${esc(data)}">${esc(data)}</a></p></section>`;
}

function calendarBlock(q, ms) {
  const T = CZ.barTemplates(), today = CZ.dayOf(ms), t = CZ.describe(today);
  const d = String(q.get("d") ?? "").slice(0, 80), c = q.get("c") || "gregorian";
  const cal = CZ.CALENDARS.includes(c) ? c : "gregorian";
  const line = `<p class="cz-today">Today is <strong><time datetime="${t.gregorian.date}">${esc(t.cz.stamp)}</time></strong>: ${esc(t.weekday)}, ${esc(t.gregorian.text)} · `
    + `${esc(t.solar_hijri.text)} (${fa(t.solar_hijri.native)}) · ${esc(t.lunar_hijri.text)} (${ar(t.lunar_hijri.native)}).</p>`;
  const form = typeof T.calform === "string" ? CZ.fillTemplate(T.calform, CZ.fields(ms), cal, esc(d)) : "";
  let out = "";
  if (d.trim()) {
    const r = CZ.parse(d, cal, ms);
    out = r.ok ? result(r, today) : `<p class="pending" role="alert" id="result">${esc(r.error)}</p>`;
  }
  return `${line}\n${form}\n${out}`;
}

const CAL_RE = /<!--cz-cal-->[\s\S]*?<!--\/cz-cal-->/;
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
  const query = p === "calendar" && (url.searchParams.has("d") || url.searchParams.has("c"));
  if (p === "calendar" && status === 200) out = out.replace(CAL_RE, () => `<!--cz-cal-->${calendarBlock(url.searchParams, now)}<!--/cz-cal-->`);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${CZ.secondsToNextDay(now)}`);
  if (query || status === 404) res.setHeader("X-Robots-Tag", "noindex");   // a conversion is a view, not a page to index
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(req.method === "HEAD" ? "" : out);
};
module.exports.calendarBlock = calendarBlock;
