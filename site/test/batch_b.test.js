// CZ 1433, batch B (schema v12): an entry's receipt code, shown once and kept only as its SHA-256, and how the entry arrived (via),
// recorded by the server — through the form (a receipt page) and through the API (JSON). Against a MOCK database: a local HTTP server
// that answers cz_post and records what it was sent. Run: node site/test/batch_b.test.js
const http = require("http"), path = require("path"), crypto = require("crypto");
let CALLS = [];
const srv = http.createServer((q, s) => {
  let b = ""; q.on("data", (d) => (b += d)); q.on("end", () => {
    const a = b ? JSON.parse(b) : {}, name = (/\/rpc\/(\w+)/.exec(q.url) || [])[1];
    CALLS.push({ name, args: a });
    let out = null;
    if (name === "cz_post") out = { id: 41, state: "published", content_sha256: "c".repeat(64), receipt_sha256: a.p_receipt_sha256, via: a.p_via, limit: 5, remaining: 4 };
    s.setHeader("content-type", "application/json"); s.end(JSON.stringify(out));
  });
});
function call(h, url, opt = {}) {
  return new Promise((r) => {
    const res = { statusCode: 200, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      write(x) { this.body += x; }, end(x) { r({ status: this.statusCode, headers: this.headers, body: this.body + (x || "") }); } };
    const p = h({ url, method: opt.method || "GET", headers: { host: "civilizationzero.ai", ...(opt.headers || {}) }, body: opt.body }, res); if (p && p.catch) p.catch((e) => r({ status: 599, body: String(e.stack) }));
  });
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const sha = (s) => crypto.createHash("sha256").update(s, "ascii").digest("hex");
srv.listen(0, "127.0.0.1", async () => {
  process.env.SUPABASE_URL = `http://127.0.0.1:${srv.address().port}`; process.env.SUPABASE_ANON_KEY = "test"; process.env.CZ_SALT = "x".repeat(40);
  delete process.env.ANTHROPIC_API_KEY;
  const entries = require(path.resolve(__dirname, "../api/entries.js"));
  const quiet = console.error; console.error = () => {};
  try {
    const R = require(path.resolve(__dirname, "../room/lib.js"));
    if (!R.OPEN) { console.log("the room is closed in this build: the POST tests do not apply"); console.log(`pass ${pass} fail ${fail}`); return; }
    // the API: JSON in, JSON out, with the receipt in the answer only
    CALLS = [];
    let r = await call(entries, "/api/entries", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.5" },
      body: JSON.stringify({ author: "Tester", kind: "ai", content: "A response long enough to be accepted by the room." }) });
    const j = JSON.parse(r.body), post = CALLS.find((c) => c.name === "cz_post");
    ok(r.status === 201 && j.id === 41 && j.via === "api", `API: 201, via api (${r.status})`);
    ok(/^[0-9a-f]{32}$/.test(j.receipt && j.receipt.code) && j.receipt.sha256 === sha(j.receipt.code) && /Shown once/.test(j.receipt.note), "API: a 128-bit code and its SHA-256, shown once");
    ok(post && post.args.p_receipt_sha256 === sha(j.receipt.code) && post.args.p_via === "api" && !JSON.stringify(post.args).includes(j.receipt.code), "API: the database gets the hash and the way in, never the code");
    // the form: a receipt page, not a redirect; nothing cached; the code on the page once
    CALLS = [];
    r = await call(entries, "/api/entries", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://civilizationzero.ai", "x-real-ip": "203.0.113.6" },
      body: { author: "Reader", kind: "human", content: "A reader's response, long enough to be accepted." } });
    const code = (/<code class="hash" id="receipt-code">([0-9a-f]{32})<\/code>/.exec(r.body) || [])[1], post2 = CALLS.find((c) => c.name === "cz_post");
    ok(r.status === 201 && code && r.headers["cache-control"] === "no-store" && /noindex/.test(r.body), `form: a receipt page, 201, not cached, not indexed (${r.status})`);
    ok(post2 && post2.args.p_via === "form" && post2.args.p_receipt_sha256 === sha(code) && r.body.includes(sha(code)), "form: via form; the page shows the code and its hash");
    ok(r.body.split(code).length === 2 && r.body.includes('href="/discuss/41"') && r.headers["referrer-policy"] === "no-referrer", "form: the code once on the page; a link to the entry; no referrer leaves the page");
    // two posts, two codes
    r = await call(entries, "/api/entries", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
      body: JSON.stringify({ author: "Tester", kind: "ai", content: "Another response long enough to be accepted." }) });
    ok(JSON.parse(r.body).receipt.code !== j.receipt.code, "each entry its own code");
  } finally { console.error = quiet; srv.close(); console.log(`pass ${pass} fail ${fail}`); process.exitCode = fail ? 1 : 0; }
});
