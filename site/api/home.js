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

// now: the moment (the as-of time is in UTC); local: the reader's wall clock read in UTC (room/cztime.js, localMs), for every count of
// days, so that the date in the heading turns at midnight where the reader is (the originator's decision of 7 Nov 2026, CZ 1438)
function clock(now, local = now.getTime()) {
  const t = local, L = new Date(local);
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
    "__UTC_DAY_SHORT__": `${L.getUTCDate()} ${MON[L.getUTCMonth()]} ${L.getUTCFullYear()}`,   // the reader's date beside the count
  };
}

// The same rule the host applies to every other page (vercel.json, R3-13): a format is chosen only when it is asked for
// without q=0, and HTML wins whenever HTML is acceptable, so a browser always gets the page. "*/*" gets HTML.
const Q0 = String.raw`\s*;\s*q\s*=\s*0(?:\.0{0,3})?\s*(?:,|$)`;
const WANTS = (type) => new RegExp(String.raw`^(?!.*text/html(?!${Q0}))(?!.*${type}${Q0}).*${type}.*`);
const JSON_RE = WANTS("application/json"), TXT_RE = WANTS("text/plain"), MD_RE = WANTS("text/markdown");
const negotiate = (accept) => JSON_RE.test(accept) ? "json" : TXT_RE.test(accept) ? "txt" : MD_RE.test(accept) ? "md" : "html";
// the speculation rules in the page (stage 5, CZ 1433) are data, allowed by their hash, read from the template as built
const SPEC_HASHES = [...String(T.html || "").matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${require("node:crypto").createHash("sha256").update(m[1], "utf8").digest("base64")}'`);

// One pass over the template: every placeholder is replaced where it stands, and nothing put in is read again — an entry's text that
// spells a placeholder stays as its author wrote it (as room/lib.js fills its shell)
function fill(s, c) {
  const keys = Object.keys(c).sort((a, b) => b.length - a.length);
  return s.replace(new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"), (m) => String(c[m]));
}

// The room on the first page (Phase 1 of the room's design for readers, 29 Oct 2026): the number of entries in the first screen's line
// and the latest groups after the Core's own lines; and, in the human door, one answer to the short invitation (the originator's decision
// of 23 Nov 2026), taken from the same rows — the latest 60 that are published, screened and with no decision pending, the most the
// database's function gives; the latest groups are still made from the newest 30. Read from the database at request time, within 1.5
// seconds; if the database is slow or down, the page is served without them (the clock never waits on the room). The room's code is loaded only here.
const ROOM_MS = 1500, LATEST_ROWS = 30, EXAMPLE_ROWS = 60;
async function room() {
  const R = require("../room/lib.js");
  const [got, stats] = await Promise.all([R.rpc("cz_home_latest", { p_limit: EXAMPLE_ROWS }), R.rpc("cz_stats", {})]);
  const rows = (Array.isArray(got) ? got : []).filter((e) => e && typeof e === "object").sort((a, b) => Number(b.id) - Number(a.id));   // newest first, as the function gives them
  const n = Number(stats && stats.entries);
  return { "__ROOM_COUNT__": Number.isFinite(n) ? ` (<data value="${n}">${n.toLocaleString("en-US")}</data> ${n === 1 ? "entry" : "entries"})` : "",
           "__ROOM_EXAMPLE__": R.exampleHtml(rows),
           "__ROOM_LATEST__": R.previewHtml(rows.slice(0, LATEST_ROWS)) };
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
  const md = f === "md";   // the page as Markdown (/index.md, or Accept: text/markdown): the HTML page, converted (room/md.js)
  if (md) f = "html";
  if (!(Object.hasOwn(T, f) && typeof T[f] === "string")) f = "html";   // ?f=constructor and the like: an inherited property is not a form (review of CZ 1432)
  const now = new Date(), zone = CZ.readerZone(req.headers);   // the reader's date: their network's time zone, read and kept nowhere
  const c = { ...clock(now, CZ.localMs(now.getTime(), zone)), "__CZ_ZONE__": zone, "__CZ_UTC_ISO__": now.toISOString().slice(0, 10), "__ROOM_COUNT__": "", "__ROOM_EXAMPLE__": "", "__ROOM_LATEST__": "" };
  const ttl = Math.min(300, CZ.secondsToNextLocalDay(now.getTime(), zone)), vary = CZ.varyZone("Accept");
  if ((T[f] ? f : "html") === "html") Object.assign(c, await roomOrNothing());
  const types = { html: "text/html; charset=utf-8", json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8" };
  if (md) {
    const MD = require("../room/md.js");
    return MD.sendMarkdown(res, 200, MD.htmlToMarkdown(fill(T.html, c), { path: "/" }), "/", "https://civilizationzero.ai",
      { "Cache-Control": `public, max-age=0, s-maxage=${ttl}`, Vary: vary });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", types[f] || types.html);
  // at most five minutes, and never past midnight in the reader's time zone, when the date in the heading turns; each zone's copy apart
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
  res.setHeader("Vary", vary);
  const link = '</index.json>; rel="alternate"; type="application/json", </index.txt>; rel="alternate"; type="text/plain", </index.md>; rel="alternate"; type="text/markdown", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"';
  const isHtml = (T[f] ? f : "html") === "html";
  res.setHeader("Link", isHtml ? link : `<https://civilizationzero.ai/>; rel="canonical", ${link}`);   // the JSON and text forms name the page as canonical
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // the page: nothing loads from elsewhere, no script, no framing (as every page)
  if (isHtml) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" + (SPEC_HASHES.length ? `; script-src ${SPEC_HASHES.join(" ")}` : ""));
  const body = fill(T[f] || T.html, c);
  res.end(isHtml ? require("../room/weight.js").fillWeight(body) : body);   // the line at the foot: this page's weight as it is sent
};

module.exports.negotiate = negotiate;
