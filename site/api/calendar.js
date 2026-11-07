// CZ time as data: GET /api/calendar (also /calendar.json, and /calendar asked for as JSON) — today, or the date given — in CZ time
// and in every calendar the converter knows (room/cztime.js). ?d= a date as typed (year-month-day, or a CZ date CZ 1430 / CZ+1430;
// year and day CZ+3:334 is read too); ?c= its calendar: gregorian (the default), solar-hijri, lunar-hijri, julian, cz. An invalid date answers 400 with
// the reason. ?tz= an IANA time zone whose date is today; without it, the time zone the host gives for the network the request comes
// from (UTC without one): today's date turns at midnight there (the originator's decision of 7 Nov 2026, CZ 1438). Cached until that
// midnight, apart for each zone, since every answer says how far the day is from today.
const CZ = require("../room/cztime.js");
const ORIGIN = "https://civilizationzero.ai";
const SPEC = "https://github.com/civilizationzero/civilizationzero/blob/main/design/CZ-TIME.md";

function send(res, status, body, ms, zone = "UTC") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${CZ.secondsToNextLocalDay(ms, zone)}`);
  res.setHeader("Vary", CZ.varyZone("Accept"));
  res.setHeader("Link", '</calendar>; rel="alternate"; type="text/html", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body, null, 1) + "\n");
}

module.exports = (req, res) => {
  const ms = Date.now();
  if (req.method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"); return res.end(); }
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD, OPTIONS"); return send(res, 405, { error: "GET only" }, ms); }
  const url = new URL(req.url, "http://x");
  const d = url.searchParams.get("d"), c = url.searchParams.get("c"), tzq = url.searchParams.get("tz"), tz = tzq && tzq.trim() ? tzq.trim() : null;   // an empty tz is no tz
  if (c !== null && !CZ.CALENDARS.includes(c)) return send(res, 400, { error: `c is one of ${CZ.CALENDARS.join(", ")}`, input: { d, c } }, ms);
  const tzc = tz === null ? null : CZ.canonicalZone(tz);
  if (tz !== null && !tzc) return send(res, 400, { error: "tz is an IANA time zone, such as Asia/Kuala_Lumpur, Europe/Berlin or UTC", input: { d, c, tz: tz.slice(0, 64) } }, ms);
  const network = CZ.readerZone(req.headers), zone = tzc || network, local = CZ.localMs(ms, zone);
  const r = CZ.parse(d ?? "", c ?? "gregorian", local);
  if (!r.ok) return send(res, 400, { error: r.error, input: { d, c } }, ms, zone);
  const today = CZ.dayOf(local);
  send(res, 200, {
    input: d === null || !d.trim() ? null : { d, c: c ?? "gregorian", read_as: r.read },
    ...CZ.describe(r.day),
    from_today_days: r.day - today,
    today: { date: CZ.czDay(today), day: today, zone, zone_from: tz !== null ? "tz" : network !== "UTC" ? "network" : "default" },
    definition: "CZ day 0 is 30 November 2022. A CZ date is a calendar date: CZ 1438 is 7 November 2026 wherever it is 7 November, and today's date turns at midnight where the reader is (here: in today.zone). The date is the count of days since Coordinate Zero: CZ 1430 (CZ −1997 before it); a moment is named by its UTC date and time, CZ 1430 15:20 UTC. The machine form is the signed count, CZ+1430; day = JDN - 2459914. Years of the record begin on each 30 November; year and day (year_day) is a secondary reading.",
    how: `${ORIGIN}/calendar#how`, spec: SPEC,
    notes: { solar_hijri: "K. Borkowski's algorithm (as jalaali-js), years 1 to 3177 SH", lunar_hijri: "Umm al-Qura for 1343-1500 AH (hijridate 2.6.0); the tabular Islamic calendar outside it, an approximation; observed months can differ by a day" },
  }, ms, zone);
};
