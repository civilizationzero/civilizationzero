// The first page, filled at request time: the year, the count and the as-of time must be right for every
// reader at every moment, with no script on the reader's side (Blueprint 1.3.1 §5.1). Everything else on
// the page is static and comes from site/build.py via home-templates.json.
const T = require("./home-templates.json");

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pad = (n) => String(n).padStart(2, "0");

function clock(now) {
  const t = now.getTime();
  let year = 0;
  while (Date.UTC(2022 + year + 1, 10, 30) <= t) year++;
  const anniv = Date.UTC(2022 + year, 10, 30);
  const z = Date.UTC(2022, 10, 30);
  const next = new Date(Date.UTC(2022 + year + 1, 10, 30));
  const days = (a) => Math.floor((t - a) / 86400000);
  const total = days(z);
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
  };
}

function fill(s, c) {
  for (const k of Object.keys(c)) s = s.split(k).join(c[k]);
  return s;
}

module.exports = (req, res) => {
  const url = new URL(req.url, "http://x");
  let f = url.searchParams.get("f");
  const accept = String(req.headers["accept"] || "");
  if (!f) f = accept.includes("application/json") ? "json" : accept.includes("text/plain") && !accept.includes("text/html") ? "txt" : "html";
  const now = new Date();
  const c = clock(now);
  const types = { html: "text/html; charset=utf-8", json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8" };
  res.statusCode = 200;
  res.setHeader("Content-Type", types[f] || types.html);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=60");
  res.setHeader("Vary", "Accept");
  res.setHeader("Link", '</index.json>; rel="alternate"; type="application/json", </index.txt>; rel="alternate"; type="text/plain", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"');
  res.setHeader("Last-Modified", new Date(T.generated).toUTCString());
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(fill(T[f] || T.html, c));
};
