// Every inline script that runs on /ask and /embed is allowed by its hash in the page's Content-Security-Policy, as api/page.js serves
// it (the copy buttons, the CZ counter, the speculation rules); nothing else may run. Run: node --test site/test/csp_inline.test.js
const test = require("node:test"), assert = require("node:assert"), crypto = require("node:crypto");
const page = require("../api/page.js");
function call(url) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      write(x) { this.body += x; }, end(x) { resolve({ status: this.statusCode, headers: this.headers, body: this.body + (x || "") }); } };
    const p = page({ url, method: "GET", headers: { host: "civilizationzero.ai", accept: "text/html" } }, res);
    if (p && p.catch) p.catch((e) => resolve({ status: 599, headers: {}, body: String(e.stack) }));
  });
}
for (const p of ["ask", "embed"]) test(`/${p}: every inline script is in the CSP, and only those`, async () => {
  const r = await call(`/api/page?p=${p}`);
  assert.equal(r.status, 200, r.body.slice(0, 200));
  const csp = r.headers["content-security-policy"] || "";
  // data blocks (JSON-LD) never run and need no hash; scripts and speculation rules do
  const inline = [...r.body.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  assert.ok(inline.length >= 2, `inline scripts found: ${inline.length}`);
  for (const h of inline) assert.ok(csp.includes(h), `${h} missing from ${csp}`);
  const listed = (/script-src ([^;]+)/.exec(csp) || ["", ""])[1].trim().split(/\s+/);
  assert.deepEqual([...new Set(listed)].sort(), [...new Set(inline)].sort());
});
