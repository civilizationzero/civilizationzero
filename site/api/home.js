// The first page, filled at request time: the year, the count and the as-of time must be right for every
// reader at every moment, with no script on the reader's side (Blueprint 1.3.1 §5.1). Everything else on
// the page is static and comes from site/build.py via home-templates.json.
const T = require("./home-templates.json");
const CZ = require("../room/cztime.js");   // CZ time (the originator's decision of 30 Oct 2026): the page's heading is today's date in it

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MON = MONTHS.map((m) => m.slice(0, 3));   // "31 Oct 2026": the description's date beside its day count (site/build.py, HOME_DESCRIPTION)
const pad = (n) => String(n).padStart(2, "0");
const plural = (n, w) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
// "3 years and 334 days", as site/lib.py's cz_since_text writes it
const sinceText = (y, d) => (y && d ? `${plural(y, "year")} and ${plural(d, "day")}` : y ? plural(y, "year") : plural(d, "day"));

function clock(now) {
  const t = now.getTime();
  let year = 0;
  while (Date.UTC(2022 + year + 1, 10, 30) <= t) year++;
  const anniv = Date.UTC(2022 + year, 10, 30);
  const z = Date.UTC(2022, 10, 30);
  const next = new Date(Date.UTC(2022 + year + 1, 10, 30));
  const days = (a) => Math.floor((t - a) / 86400000);
  const total = days(z);
  const f = CZ.fields(t);
  return {
    "__TOTAL_FMT__": total.toLocaleString("en-US"),
    "__YEAR__": String(year),
    "__DAYS_IN_YEAR__": String(days(anniv)),
    "__TOTAL__": String(total),
    "__NEXT_YEAR__": String(year + 1),
    "__NEXT_ISO__": next.toISOString().slice(0, 10),
    "__NEXT_HUMAN__": `${next.getUTCDate()} ${MONTHS[next.getUTCMonth()]} ${next.getUTCFullYear()}`,
    "__ASOF_ISO__": `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}Z`,
    "__ASOF_HUMAN__": `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`,
    "__CZ_ISO__": f.ISO, "__CZ_STAMP__": f.STAMP, "__CZ_DOYN__": f.DOYN, "__CZ_SINCE__": sinceText(f.p.year, f.p.day),
    "__CZ_TO_NEXT_N__": f.TO_NEXT, "__CZ_TO_NEXT__": plural(Number(f.TO_NEXT), "day"), "__CZ_NEXT_DAY__": f.NEXT_DAY,
    "__UTC_DAY_SHORT__": `${now.getUTCDate()} ${MON[now.getUTCMonth()]} ${now.getUTCFullYear()}`,
  };
}

// The same rule the host applies to every other page (vercel.json, R3-13): a format is chosen only when it is asked for
// without q=0, and HTML wins whenever HTML is acceptable, so a browser always gets the page. "*/*" gets HTML.
const Q0 = String.raw`\s*;\s*q\s*=\s*0(?:\.0{0,3})?\s*(?:,|$)`;
const WANTS = (type) => new RegExp(String.raw`^(?!.*text/html(?!${Q0}))(?!.*${type}${Q0}).*${type}.*`);
const JSON_RE = WANTS("application/json"), TXT_RE = WANTS("text/plain");
const negotiate = (accept) => JSON_RE.test(accept) ? "json" : TXT_RE.test(accept) ? "txt" : "html";

function fill(s, c) {
  for (const k of Object.keys(c)) s = s.split(k).join(c[k]);
  return s;
}

// The room on the first page (Phase 1 of the room's design for readers, 29 Oct 2026): the number of entries in the first screen's line
// and the latest groups after the Core's own lines. Read from the database at request time, within 1.5 seconds; if the database is
// slow or down, the page is served without them (the clock never waits on the room). The room's code is loaded only here.
const ROOM_MS = 1500;
async function room() {
  const R = require("../room/lib.js");
  const [rows, stats] = await Promise.all([R.rpc("cz_home_latest", { p_limit: 30 }), R.rpc("cz_stats", {})]);
  const n = Number(stats && stats.entries);
  return { "__ROOM_COUNT__": Number.isFinite(n) ? ` (<data value="${n}">${n.toLocaleString("en-US")}</data> ${n === 1 ? "entry" : "entries"})` : "",
           "__ROOM_LATEST__": R.previewHtml(Array.isArray(rows) ? rows : []) };
}
async function roomOrNothing() {
  if (!T.html.includes("__ROOM_")) return {};
  let timer;
  try {
    return await Promise.race([room(), new Promise((resolve) => { timer = setTimeout(() => resolve({}), ROOM_MS); })]);
  } catch (e) {
    console.error(JSON.stringify({ at: "home.room", error: String(e && e.message || e).slice(0, 200) }));
    return {};
  } finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  let f = url.searchParams.get("f");
  if (!f) f = negotiate(String(req.headers["accept"] || ""));
  const now = new Date();
  const c = { ...clock(now), "__ROOM_COUNT__": "", "__ROOM_LATEST__": "" };
  if ((T[f] ? f : "html") === "html") Object.assign(c, await roomOrNothing());
  const types = { html: "text/html; charset=utf-8", json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8" };
  res.statusCode = 200;
  res.setHeader("Content-Type", types[f] || types.html);
  // at most five minutes, and never past 00:00 UTC, when the date in the heading turns
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${Math.min(300, CZ.secondsToNextDay(now.getTime()))}`);
  res.setHeader("Vary", "Accept");
  const link = '</index.json>; rel="alternate"; type="application/json", </index.txt>; rel="alternate"; type="text/plain", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"';
  const isHtml = (T[f] ? f : "html") === "html";
  res.setHeader("Link", isHtml ? link : `<https://civilizationzero.ai/>; rel="canonical", ${link}`);   // the JSON and text forms name the page as canonical
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // the page: nothing loads from elsewhere, no script, no framing (as every page)
  if (isHtml) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.end(fill(T[f] || T.html, c));
};

module.exports.negotiate = negotiate;
