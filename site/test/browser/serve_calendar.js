// local server for the browser check: /calendar?... → api/page.js?p=calendar&... (the same handler production runs); nothing else
process.env.CZ_SALT = "x".repeat(40);
const SITE = require("path").resolve(__dirname, "../.."); process.chdir(SITE);
const page = require(SITE + "/api/page.js"), http = require("http");
http.createServer((q, s) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname !== "/calendar") { s.statusCode = 404; return s.end("not served here"); }
  u.searchParams.set("p", "calendar");
  const res = { statusCode: 200, setHeader: (k, v) => s.setHeader(k, v), getHeader: (k) => s.getHeader(k), end: (b) => { s.statusCode = res.statusCode; s.end(b); } };
  page({ url: "/api/page?" + u.searchParams.toString(), method: "GET", headers: q.headers }, res);
}).listen(8811, () => console.log("up"));
