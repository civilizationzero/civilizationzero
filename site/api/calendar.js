// CZ time as data: GET /api/calendar (also /calendar.json, and /calendar asked for as JSON) — today, or the date given — in CZ time
// and in every calendar the converter knows (room/cztime.js). ?d= a date as typed (year-month-day, a CZ stamp CZ+3:334, or a day
// count CZ+1430); ?c= its calendar: gregorian (the default), solar-hijri, lunar-hijri, julian, cz. An invalid date answers 400 with
// the reason. Cached until the next 00:00 UTC, since every answer says how far the day is from today.
const CZ = require("../room/cztime.js");
const ORIGIN = "https://civilizationzero.ai";
const SPEC = "https://github.com/civilizationzero/civilizationzero/blob/main/design/CZ-TIME.md";

function send(res, status, body, ms) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${CZ.secondsToNextDay(ms)}`);
  res.setHeader("Link", '</calendar>; rel="alternate"; type="text/html", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body, null, 1) + "\n");
}

module.exports = (req, res) => {
  const ms = Date.now();
  if (req.method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"); return res.end(); }
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD, OPTIONS"); return send(res, 405, { error: "GET only" }, ms); }
  const url = new URL(req.url, "http://x");
  const d = url.searchParams.get("d"), c = url.searchParams.get("c");
  if (c !== null && !CZ.CALENDARS.includes(c)) return send(res, 400, { error: `c is one of ${CZ.CALENDARS.join(", ")}`, input: { d, c } }, ms);
  const r = CZ.parse(d ?? "", c ?? "gregorian", ms);
  if (!r.ok) return send(res, 400, { error: r.error, input: { d, c } }, ms);
  const today = CZ.dayOf(ms);
  send(res, 200, {
    input: d === null || !d.trim() ? null : { d, c: c ?? "gregorian", read_as: r.read },
    ...CZ.describe(r.day),
    from_today_days: r.day - today,
    today: { date: CZ.czDay(today), day: today },
    definition: "CZ day 0 is 30 November 2022, the day that began at 00:00 UTC; a CZ day is a UTC day. The date is the count of days since then: CZ 1430 (CZ -1997 before it); a time of day follows in UTC. The machine form is the signed count, CZ+1430; day = JDN - 2459914. Years of the record begin on each 30 November; year and day (year_day) is a secondary reading.",
    how: `${ORIGIN}/calendar#how`, spec: SPEC,
    notes: { solar_hijri: "K. Borkowski's algorithm (as jalaali-js), years 1 to 3177 SH", lunar_hijri: "Umm al-Qura for 1343-1500 AH (hijridate 2.6.0); the tabular Islamic calendar outside it, an approximation; observed months can differ by a day" },
  }, ms);
};
