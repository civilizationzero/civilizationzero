// The site's static pages (site/public/*.html, written by site/build.py), served with today's date in CZ time at the top: the
// originator's decision of 30 October 2026 (CZ 1430) made CZ time the basis of the site's dates, on every page. The files are
// bundled with this function (vercel.json, includeFiles) and read once per instance; the build leaves a fallback where the date
// goes (<!--cz-now--> … <!--/cz-now-->), which room/cztime.js replaces. The CDN keeps each page until the next 00:00 UTC, when
// the date turns. /calendar also gets, in its place (<!--cz-cal--> … <!--/cz-cal-->), today in every calendar, the converter
// with what was typed, and the conversion.
const fs = require("node:fs");
const path = require("node:path");
const CZ = require("../room/cztime.js");
const MD = require("../room/md.js");
const { fillWeight } = require("../room/weight.js");
const crypto = require("node:crypto");
// The same policy as the room's pages: nothing loads from elsewhere, no page can frame these, forms post here only. The one inline script
// on the site (/ask: a copy button) is allowed by its own hash, computed here from the file served, so that it cannot drift.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
// the scripts the policy names by hash: the one that runs (/ask) and the speculation rules, which are data (stage 5, CZ 1433); JSON-LD needs none
const scriptHashes = (html) => [...html.matchAll(/<script(?: type="speculationrules")?>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
const cspFor = (html) => { const h = scriptHashes(html); return h.length ? `${CSP}; script-src ${h.join(" ")}` : CSP; };
// the page's title says what was converted, or what was wrong, so that a tab and a screen reader say it too
const plainText = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
function resultTitle(html) {
  const err = /<p class="pending" role="alert" id="(?:result|time-result)">([\s\S]*?)<\/p>/.exec(html);
  if (err) return `Error: ${plainText(err[1]).slice(0, 90)} · CZ time`;
  const t = /<h3 id="h-time-result">([\s\S]*?)<\/h3>/.exec(html) || /<h3 id="h-result">([\s\S]*?)<\/h3>/.exec(html);
  return t ? `${plainText(t[1]).slice(0, 90)} · CZ time` : null;
}

const PAGES = /^(core(\.[a-z]{2,3}(-[A-Za-z0-9]{1,8})?)?|record|objections|ask|machine|about|archive|calendar|civilization-zero-infographic|civilization-zero-images|press|how-it-is-built)$/;
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
    ...(v.also && v.also.length ? [[`${esc(v.local.time)} again`, `<strong>${czLink(v.also[0].day, `${CZ.czDay(v.also[0].day)} ${v.also[0].utc} UTC`)}</strong> <span class="src">(${esc(CZ.offsetText(v.also[0].offset))}, after the clocks went back)</span>`]] : []),
    ["The CZ day there", `begins at ${esc(start.time)}${start.before ? " the evening before" : ""}, ${esc(zoneName)} time (${esc(CZ.offsetText(start.offset))}): 00:00 UTC`],
  ])}${differs}${twice}</section>`;
}

// The Link header of a page as HTML (CZ 1433, item 6): its Markdown first, then what vercel.json says for that address — a function's
// header replaces the one vercel.json gives, so those are repeated here (test/batch_a.test.js holds the two together). The JSON and text
// forms of /core and /record are files, and keep vercel.json's.
const CITE_AS = '<https://doi.org/10.5281/zenodo.23740317>; rel="cite-as"';
const SERVICE = '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"';
const LINKS = {
  core: `</core.txt>; rel="alternate"; type="text/plain", </core.json>; rel="alternate"; type="application/json", ${SERVICE}, ${CITE_AS}`,
  record: `</record.txt>; rel="alternate"; type="text/plain", </record.json>; rel="alternate"; type="application/json", ${SERVICE}, ${CITE_AS}`,
  calendar: `</calendar.json>; rel="alternate"; type="application/json", ${SERVICE}`,
};
const linkFor = (p) => [`<${MD.mdPath(p === "" ? "/" : `/${p}`)}>; rel="alternate"; type="text/markdown"`].concat(LINKS[p] ? [LINKS[p]] : []).join(", ");
// /how-it-is-built says which deployment serves it — the commit Vercel built it from — and what the latest daily check of the live site
// found (site/verify/live-check.mjs, run by the workflow verify-live, its result committed to archive/live-check/latest.json). The
// server reads that file from the repository when it makes the page, at most once in ten minutes per instance; the reader's browser
// loads nothing from there. If it cannot be read, the page says so. (The originator's decision of CZ 1433, item 4.)
const REPO = "https://github.com/civilizationzero/civilizationzero";
const LATEST = "https://raw.githubusercontent.com/civilizationzero/civilizationzero/main/archive/live-check/latest.json";
const DEPLOY_RE = /<!--cz-deploy-->[\s\S]*?<!--\/cz-deploy-->/;
let latest = { at: 0, v: null };
async function latestCheck(now) {
  if (now - latest.at < 600000) return latest.v;   // one read in ten minutes, whatever it found
  try {
    const r = await fetch(LATEST, { headers: { "user-agent": "cz-site/1.0 (+https://civilizationzero.ai/how-it-is-built)" }, signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const v = await r.json();
    if (!v || typeof v.checked_at !== "string" || !Number.isInteger(v.passed) || !Number.isInteger(v.total)) throw new Error("not a result");
    latest = { at: now, v };
  } catch { latest = { at: now, v: latest.v && Date.parse(latest.v.checked_at) > now - 86400000 ? latest.v : null }; }   // a result under a day old stays, with its date
  return latest.v;
}
function deployBlock(v, sha) {
  const commit = /^[0-9a-f]{40}$/.test(sha || "") ? sha : null;
  const here = commit ? `<p id="deployed" data-commit="${commit}">This page is served by the deployment built from commit <a href="${REPO}/commit/${commit}"><code>${commit.slice(0, 7)}</code></a> of the repository.</p>`
    : `<p id="deployed" class="pending">This copy of the page cannot say which deployment serves it.</p>`;
  if (!v) return `${here}\n<p class="pending">The latest daily check could not be read from the repository just now: <a href="${REPO}/tree/main/archive/live-check">the results</a>.</p>`;
  const against = typeof v.commit === "string" && /^[0-9a-f]{7,40}$/.test(v.commit)
    ? (commit && commit.startsWith(v.commit) ? ", against this deployment" : `, against the deployment of commit <a href="${REPO}/commit/${esc(v.commit)}"><code>${esc(v.commit.slice(0, 7))}</code></a>, which served the site then${commit ? "; this page is served by another" : ""}`) : "";
  const failed = Array.isArray(v.failed) && v.failed.length ? ` Failed: ${v.failed.slice(0, 12).map((f) => esc(String(f).slice(0, 160))).join("; ")}.` : "";
  const run = typeof v.run === "string" && v.run.startsWith(`${REPO}/actions/runs/`) ? `<a href="${esc(v.run)}">The run</a> · <a href="${REPO}/blob/main/archive/live-check/latest.json">the result as data</a>`
    : `<a href="${REPO}/blob/main/archive/live-check/latest.json">The result as data</a>`;
  return `${here}\n<p${v.passed === v.total ? "" : ' class="pending"'}>The latest daily check, ${CZ.whenHtml(v.checked_at)}: ${v.passed} of ${v.total} checks passed${against}.${failed} ${run}.</p>`;
}
const CAL_RE = /<!--cz-cal-->[\s\S]*?<!--\/cz-cal-->/;
const TIME_RE = /<!--cz-time-->[\s\S]*?<!--\/cz-time-->/;
module.exports = async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.statusCode = 405; res.setHeader("Allow", "GET, HEAD"); res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Method not allowed\n");
  }
  const url = new URL(req.url, "http://x");
  const p = url.searchParams.get("p") || "";
  let status = 200, html = PAGES.test(p) ? read(p) : null;
  if (html === null) { status = 404; html = read("404") || "<!doctype html><title>Not found</title><p>Nothing is published at this address.</p>\n"; }
  const now = Date.now();
  const csp = cspFor(html);   // from the file as built, before anything from the request is put in (review of CZ 1432)
  let out = CZ.fillBar(html, now);
  const query = p === "calendar" && ["d", "c", "t", "z"].some((k) => url.searchParams.has(k));
  if (p === "calendar" && status === 200) {
    out = out.replace(CAL_RE, () => `<!--cz-cal-->${calendarBlock(url.searchParams, now)}<!--/cz-cal-->`)
             .replace(TIME_RE, () => `<!--cz-time-->${timeBlock(url.searchParams, now)}<!--/cz-time-->`);
  }
  if (query && status === 200) { const t = resultTitle(out); if (t) out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${CZ.escHtml(t)}</title>`); }
  const colophon = p === "how-it-is-built" && status === 200;
  if (colophon) { const v = await latestCheck(now); out = out.replace(DEPLOY_RE, () => `<!--cz-deploy-->${deployBlock(v, process.env.VERCEL_GIT_COMMIT_SHA)}<!--/cz-deploy-->`); }
  // the colophon at most an hour in the cache, so that a new day's check shows the same morning; every other page until 00:00 UTC
  const ttl = colophon ? Math.min(3600, CZ.secondsToNextDay(now)) : CZ.secondsToNextDay(now);
  // the page as Markdown (/core.md, or Accept: text/markdown; vercel.json): its <main> converted, with a front matter (room/md.js)
  if (url.searchParams.get("f") === "md") {
    const pth = p === "" ? "/" : `/${p}`;
    // the Core and the record name the DOI to cite them by in this form too (CZ 1433, item 5): this Link replaces sendMarkdown's, so it repeats the canonical
    const link = ["core", "record"].includes(p) && status === 200 ? { Link: `<https://civilizationzero.ai${pth}>; rel="canonical", ${CITE_AS}` } : {};
    return MD.sendMarkdown(res, status, req.method === "HEAD" ? "" : MD.htmlToMarkdown(out, { path: pth }), pth, "https://civilizationzero.ai", { "Cache-Control": `public, max-age=0, s-maxage=${ttl}`, ...link });
  }
  out = fillWeight(out);   // the line at the foot: this page's weight as it is sent (room/weight.js)
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
  if (query || status === 404) res.setHeader("X-Robots-Tag", "noindex");   // a conversion is a view, not a page to index
  if (status === 200) res.setHeader("Link", linkFor(p));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(req.method === "HEAD" ? "" : out);
};
module.exports.calendarBlock = calendarBlock;
module.exports.timeBlock = timeBlock;
module.exports.linkFor = linkFor;
module.exports.deployBlock = deployBlock;
