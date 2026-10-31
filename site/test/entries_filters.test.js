// GET /api/entries: a filter or cursor that is given must be valid; an invalid one is refused with 400, never dropped (audit CZ22).
// Run: node site/test/entries_filters.test.js (no network: valid filters stop at the database call, which is not configured here)
process.env.CZ_SALT = "x".repeat(40);
const h = require(require("path").resolve(__dirname, "../api/entries.js"));
const call = (url) => new Promise((r) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; }, end(b) { r({ s: this.statusCode, b: String(b || "") }); } };
  const p = h({ url, method: "GET", headers: { host: "x" } }, res); if (p && p.catch) p.catch((e) => r({ s: 599, b: String(e) }));
});
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
(async () => {
  const log = console.log; console.log = () => {};
  const out = [];
  for (const [q, p] of [["kind=robot", "kind"], ["ref=16", "ref"], ["ref=01x", "ref"], ["lang=!!", "lang"], ["after=abc", "after"], ["before=-1", "before"], ["limit=ten", "limit"], ["include_hidden=yes", "include_hidden"]])
    out.push([q, p, await call(`/api/entries?${q}`)]);
  const good = [];
  for (const q of ["kind=ai&ref=13", "kind=", "ref=0", "lang=fa", "after=5&limit=10", "include_hidden=true"]) good.push([q, await call(`/api/entries?${q}`)]);
  console.log = log;
  for (const [q, p, r] of out) { let j = {}; try { j = JSON.parse(r.b); } catch {} ok(r.s === 400 && j.parameter === p && !("entries" in j), `${q}: ${r.s} ${r.b.slice(0, 80)}`); }
  for (const [q, r] of good) ok(r.s !== 400, `${q} is valid: ${r.s}`);
  console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
})();
