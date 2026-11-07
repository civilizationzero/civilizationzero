// The CZ badge: today's date in CZ time as an image, for other sites to show (the originator's request of 6 Nov 2026 SGT, CZ 1436).
// GET /badge/cz-today.svg (vercel.json) — ?theme=light | dark; without it the badge follows the reader's light or dark setting where
// the browser applies it to images. ?tz= an IANA time zone whose date it shows; without it, the time zone the host gives for the
// network the request comes from (UTC without one): the date turns at midnight where the reader is (the originator's decision of 7 Nov
// 2026, CZ 1438). An image, not a script: it works where scripts are not allowed (READMEs, wikis, newsletters, forums). Cached until
// that midnight, apart for each zone. Nothing is read from the request but the theme, tz and that time zone; nothing is kept; the
// visit counts (middleware.js) never see it (an .svg address). The mark's paths are the site's own (check.py compares them with mark.py).
const CZ = require("../room/cztime.js");

const MARK = ['M50.5,26.5 V17 A12,12 0 0 0 38.5,5 H25.5 A12,12 0 0 0 13.5,17 V47 A12,12 0 0 0 25.5,59 H38.5 A12,12 0 0 0 50.5,47 V37.5', 'M38.5,5 L25.5,59'];
const LIGHT = { bg: "#fff", rule: "#bbb", fg: "#111", green: "#116329" }, DARK = { bg: "#101010", rule: "#444", fg: "#eee", green: "#3fb950" };
const rules = (p) => `.bg{fill:${p.bg};stroke:${p.rule}}.m{stroke:${p.fg}}.t{fill:${p.fg}}.n{fill:${p.green}}`;

function badge(day, theme) {
  const num = `CZ ${day < 0 ? "−" + -day : day}`;
  const w = 40 + Math.max(100, Math.ceil(num.length * 9.8)) + 12;
  const style = theme === "dark" ? rules(DARK) : theme === "light" ? rules(LIGHT) : rules(LIGHT) + `@media (prefers-color-scheme:dark){${rules(DARK)}}`;
  const label = `Today in CZ time: ${num}, day ${day} since Coordinate Zero, 30 November 2022. Civilization Zero, civilizationzero.ai`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40" viewBox="0 0 ${w} 40" role="img" aria-label="${label}">` +
    `<title>${label}</title>` +
    `<style>${style}.t{font:11px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}.n{font:700 16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}</style>` +
    `<rect class="bg" x=".5" y=".5" width="${w - 1}" height="39" rx="6"/>` +
    `<g class="m" fill="none" stroke-width="6.5" transform="translate(8 8) scale(.375)"><path d="${MARK[0]}"/><path d="${MARK[1]}"/></g>` +
    `<text class="t" x="40" y="16">Civilization Zero</text><text class="n" x="40" y="33">${num}</text></svg>\n`;
}

module.exports = (req, res) => {
  const ms = Date.now();
  if (!["GET", "HEAD"].includes(req.method)) { res.statusCode = 405; res.setHeader("Allow", "GET, HEAD"); res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("GET only\n"); }
  const q = new URL(req.url, "http://x").searchParams, t = q.get("theme"), tz = q.get("tz");
  const zone = (tz && CZ.canonicalZone(tz)) || CZ.readerZone(req.headers);
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  // the CDN keeps it until midnight in that zone, each zone's copy apart; a browser or an image proxy at most five minutes, so that no
  // copy outlives the day by more (a long max-age fixed at generation would travel with every CDN copy; review of CZ 1436)
  const s = CZ.secondsToNextLocalDay(ms, zone);
  res.setHeader("Cache-Control", `public, max-age=${Math.min(300, s)}, s-maxage=${s}`);
  res.setHeader("Vary", CZ.VARY_ZONE);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(req.method === "HEAD" ? undefined : badge(CZ.todayIn(ms, zone), t === "light" || t === "dark" ? t : "auto"));
};
module.exports.badge = badge;
