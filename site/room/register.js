// The Adoption Register — shared code (design/ADOPT.md; IR 10.1, 10.2; Blueprint 1.3.1 decision 17).
// A statement is canonical JSON: keys sorted, no insignificant whitespace, UTF-8, values strings or lists of strings — the bytes that are hashed,
// signed and published; its trace address is one of its fields, so a signature also binds where it will be traced. A statement
// becomes an adoption in the register only when it is traced: the secret trace token given to its submitter, and to no one
// else, found in the page at the https address the statement names (not in that address, not after a redirect to another
// host). The fetch is guarded: https:443, host names only, every resolved address public (checked inside the resolver, so the
// connection cannot be pointed elsewhere after the check), no proxy, 8 seconds and 512 KB for the whole check.
const crypto = require("node:crypto");
const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");
const R = require("./lib.js");
const RT = require("../api/register-templates.json");

const OPEN = RT.open === true || process.env.CZ_REGISTER_OPEN === "1";
// once the register has opened, its records and its chain are served and hashed whatever its state (IR 10.1: "The historical
// record of adoption and withdrawal must remain visible"); closing it stops new statements only
const CHAIN = OPEN || /^\d{4}-\d\d-\d\d$/.test(RT.opened || "");
const VERSIONS = RT.versions;                     // ["CZ-CORE 1.0 sha256:…", "CZ-IR 1.0 sha256:…"] — pinned to the bytes
const TYPES = ["adoption", "revision", "withdrawal"];
const KINDS = ["person", "institution"];
const AI_WORDS = /^(ai|a\.i\.|artificial|system|model|agent|machine|bot|llm|assistant|program)/i;
const BAD = /[\u0000-\u0008\u000b-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;   // control characters (LF and TAB allowed only where said) and unpaired surrogates
const SELF_HOSTS = /(^|\.)civilizationzero\.ai$|^civilization-zero[a-z0-9-]*\.vercel\.app$/i;   // this site and its own aliases (host names without a trailing dot)
const MAX_STATEMENT = 12000;                      // the database's limit on the canonical statement, in characters

// ---------------------------------------------------------------- canonical form
function canonical(obj) {
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + (Array.isArray(obj[k]) ? "[" + obj[k].map((x) => JSON.stringify(x)).join(",") + "]" : JSON.stringify(obj[k]))).join(",") + "}";
}
const sha256 = (s) => crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
const todayUTC = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- validation (the contract in /api/openapi.json and on /adopt)
// Unsigned statements: CRLF → LF and ASCII whitespace trimmed in every field. Signed statements: taken exactly as sent; a field that
// would change under that normalisation is refused, so that the signed bytes and the published bytes are the same.
function validateStatement(b) {
  const signed = !!(b.pubkey || b.sig);
  const norm = (v) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "") : v);
  const take = (k, { multiline = false } = {}) => {
    const v = b[k] == null ? "" : b[k];
    if (typeof v !== "string") return { err: `${k}: a string` };
    const n = norm(v);
    if (signed && n !== v) return { err: `${k}: a signed statement must already be normalised (LF line endings, no leading or trailing whitespace)` };
    if (BAD.test(n) || (!multiline && /[\n\t]/.test(n))) return { err: `${k}: contains a control character or an unpaired surrogate${multiline ? "" : " (one line only)"}` };
    return { v: n };
  };
  const out = {};
  for (const [k, opt] of [["type"], ["signatory"], ["signatory_kind"], ["institution"], ["capacity"], ["scope", { multiline: true }], ["reservations", { multiline: true }], ["declared_date"], ["lang"], ["refers_to"], ["trace_url"]]) {
    const r = k === "refers_to" && typeof b[k] === "number" ? { v: String(b[k]) } : take(k, opt);
    if (r.err) return { error: r.err };
    out[k] = r.v;
  }
  out.type = out.type || "adoption";
  if (!TYPES.includes(out.type)) return { error: "type: adoption | revision | withdrawal" };
  // IR 10.2: systems record responses, not adoption — said before anything else is checked
  if (String(b.kind || "").trim().toLowerCase() === "ai" || AI_WORDS.test(out.signatory_kind)) return { error: "an artificial system does not adopt the record; its response is recorded in the room (IR 10.2)", ai: true };
  if (!KINDS.includes(out.signatory_kind)) return { error: "signatory_kind: person | institution" };
  if (R.clen(out.signatory) < 1 || R.clen(out.signatory) > 200) return { error: "signatory: the responsible signatory, 1–200 characters" };
  if (out.signatory_kind === "institution") {
    if (R.clen(out.institution) < 1 || R.clen(out.institution) > 200) return { error: "institution: its name, 1–200 characters" };
    if (R.clen(out.capacity) < 1 || R.clen(out.capacity) > 200) return { error: "capacity: the signatory's capacity for the institution, 1–200 characters" };
  } else {
    if (out.institution) return { error: "institution: only for signatory_kind institution" };
    if (R.clen(out.capacity) > 200) return { error: "capacity: at most 200 characters" };
  }
  let versions = b.versions;
  if (versions == null) versions = [];
  if (!Array.isArray(versions) || versions.some((v) => typeof v !== "string")) return { error: "versions: a list of strings" };
  versions = [...new Set(versions)];
  if (versions.some((v) => !VERSIONS.includes(v))) return { error: "versions: each one of " + VERSIONS.join(" | ") };
  versions.sort((x, y) => VERSIONS.indexOf(x) - VERSIONS.indexOf(y));
  if (out.type === "withdrawal") {
    if (versions.length) return { error: "versions: a withdrawal withdraws the whole adoption it names; leave versions empty" };
    if (out.reservations) return { error: "reservations: none for a withdrawal" };
    if (R.clen(out.scope) > 4000) return { error: "scope: at most 4,000 characters (for a withdrawal, an optional note)" };
  } else {
    if (!versions.length) return { error: "versions: the version adopted — " + VERSIONS.join(" and/or ") };
    if (R.clen(out.scope) < 20 || R.clen(out.scope) > 4000) return { error: "scope: the scope of the commitment, 20–4,000 characters (IR 10.1)" };
    if (R.clen(out.reservations) < 1 || R.clen(out.reservations) > 4000) return { error: "reservations: any reservations, 1–4,000 characters; write \"none\" if there are none (IR 10.1)" };
  }
  if (!R.validDate(out.declared_date) || out.declared_date < "2022-11-30" || out.declared_date > todayUTC()) return { error: "declared_date: the date of the statement, YYYY-MM-DD, not in the future (UTC)" };
  if (out.lang && (out.lang.length > 35 || !R.LANG_RE.test(out.lang))) return { error: "lang: a BCP 47 tag in its usual case, e.g. en, fa, zh-Hans, pt-BR (a statement is recorded as written, so it is not rewritten)" };
  if (out.type === "adoption") { if (out.refers_to) return { error: "refers_to: an adoption refers to nothing" }; }
  else if (!/^[1-9]\d{0,11}$/.test(out.refers_to)) return { error: "refers_to: the id of the adoption this " + out.type + " changes" };
  // the trace address: part of the statement, in its normal form (the form the site fetches and shows)
  let u; try { u = new URL(out.trace_url); } catch { return { error: "trace_url: the https address of a page of yours where you will publish the line this site gives you" }; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return { error: "trace_url: an https address on port 443, without credentials" };
  if (u.search || u.hash || out.trace_url.includes("?") || out.trace_url.includes("#")) return { error: "trace_url: without a query (?…) or a fragment (#…) — the address of a page whose content does not depend on what is asked of it" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (net.isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".")) return { error: "trace_url: a host name, not an address" };
  if (host.length > 253 || host.split(".").some((l) => !l.length || l.length > 63)) return { error: "trace_url: not a valid host name" };
  if (SELF_HOSTS.test(host)) return { error: "trace_url: an address of your own, not of this site" };
  if (u.hostname !== host) u.hostname = host;
  const traceUrl = u.href;
  if (traceUrl.length > 500) return { error: "trace_url: at most 500 characters" };
  if (signed && traceUrl !== out.trace_url) return { error: "trace_url: a signed statement must give it in its normal form, " + traceUrl };
  const stmt = { capacity: out.capacity, declared_date: out.declared_date, institution: out.institution, lang: out.lang, refers_to: out.refers_to,
                 reservations: out.reservations, scope: out.scope, signatory: out.signatory, signatory_kind: out.signatory_kind, trace_url: traceUrl, type: out.type, versions };
  const statement = canonical(stmt);
  if (R.clen(statement) > MAX_STATEMENT) return { error: `the statement is too long: at most ${MAX_STATEMENT.toLocaleString("en")} characters as canonical JSON (it is ${R.clen(statement).toLocaleString("en")}; quotation marks and line breaks count twice)` };
  if (b.statement != null && b.statement !== statement) return { error: "statement: not the canonical form of the fields; the canonical form is: " + statement };
  let fingerprint = "";
  if (signed) {
    if (!b.pubkey || !b.sig) return { error: "pubkey and sig go together" };
    if (String(b.pubkey).length > 128 || String(b.sig).length > 128) return { error: "pubkey, sig: too long" };
    const s = R.verifySignature(String(b.pubkey), String(b.sig), statement);
    if (!s.ok) return { error: s.reason === "encoding" ? "pubkey and sig: base64 exactly as RFC 4648 writes it, with padding — 32 bytes for the key, 64 for the signature" : s.reason === "key" ? "pubkey: not a canonical Ed25519 key of full order — a small-order or malformed key proves no continuity" : "sig: does not verify over the UTF-8 bytes of the canonical statement: " + statement };
    fingerprint = s.fingerprint;
  }
  return { value: { ...stmt, statement, statement_sha256: sha256(statement), trace_url: traceUrl, trace_host: host,
                    pubkey: signed ? String(b.pubkey) : "", sig: signed ? String(b.sig) : "", key_fingerprint: fingerprint } };
}

// ---------------------------------------------------------------- the guarded trace fetch
// Addresses a trace may never reach: the special-purpose ranges of the IANA registries (RFC 6890 and successors), exactly.
// IPv6 ranges that embed or translate an IPv4 address (mapped, compatible, translated, NAT64, 6to4, Teredo) are refused whole.
// Two lists: Node checks an IPv4 address against IPv6 rules as its IPv4-mapped form, so one list holding ::ffff:0:0/96 would
// refuse every IPv4 address.
const BLOCK4 = new net.BlockList(), BLOCK6 = new net.BlockList();
for (const [a, p] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]]) BLOCK4.addSubnet(a, p, "ipv4");
for (const [a, p] of [["::", 96], ["::ffff:0:0", 96], ["::ffff:0:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["5f00::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10],
  ["ff00::", 8]]) BLOCK6.addSubnet(a, p, "ipv6");
function blockedAddress(ip) {
  try {
    if (net.isIPv4(ip)) return BLOCK4.check(ip, "ipv4");
    if (net.isIPv6(ip) && !String(ip).includes("%")) return BLOCK6.check(ip, "ipv6");
  } catch { /* an address the list cannot read is refused */ }
  return true;
}
function guardedLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return callback(err);
    if (!addrs || !addrs.length || addrs.some((a) => blockedAddress(a.address))) return callback(Object.assign(new Error("address not allowed"), { code: "EBLOCKED" }));
    if (options && options.all) return callback(null, addrs);
    return callback(null, addrs[0].address, addrs[0].family);
  });
}
const LIMIT = 512 * 1024;
const AGENT = new https.Agent({ keepAlive: false });   // an agent of its own: no proxy from the environment, no shared sockets
function fetchOnce(u, deadline) {
  return new Promise((resolve) => {
    let done = false; const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const left = deadline - Date.now();
    if (left < 500) return finish({ status: "error: time" });
    const req = https.request({ host: u.hostname, servername: u.hostname, port: 443, path: (u.pathname || "/") + (u.search || ""), method: "GET", lookup: guardedLookup, agent: AGENT,
      headers: { "User-Agent": "civilizationzero.ai-register-trace (+https://civilizationzero.ai/adopt)", Accept: "text/html, text/plain;q=0.9, application/json;q=0.9, */*;q=0.5" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return finish({ redirect: res.headers.location, status: String(res.statusCode) }); }
      const chunks = []; let size = 0;
      res.on("data", (c) => { if (size < LIMIT) chunks.push(c.subarray(0, LIMIT - size)); size += c.length; if (size >= LIMIT) res.destroy(); });
      const end = () => finish({ status: String(res.statusCode), body: Buffer.concat(chunks), truncated: size > LIMIT });
      res.on("end", end); res.on("close", end); res.on("error", end);
    });
    const hard = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), Math.min(8000, left));   // the whole exchange, not only idle time
    req.on("close", () => clearTimeout(hard));
    req.on("error", (e) => { clearTimeout(hard); finish({ status: "error: " + (e.code || "connection") }); });
    req.end();
  });
}
// The address in any of its spellings: as given, and percent-decoded up to three times (a page that decodes what it is asked
// and prints it back must not find the token in the address it was asked for)
function spellings(href) {
  const out = [href.toLowerCase()];
  for (let i = 0; i < 3; i++) { try { const d = decodeURIComponent(out[out.length - 1]); if (d === out[out.length - 1]) break; out.push(d.toLowerCase()); } catch { break; } }
  return out;
}
// Fetch the trace address (at most three redirects, on the same origin only) and look for the record's secret trace token in
// the page: 8 seconds and 512 KB for the whole check; a 2xx answer only; the token never in an address fetched.
async function traceCheck(traceUrl, token) {
  const none = (http_status, detail = "") => ({ found: false, http_status, body_sha256: null, detail });
  if (!/^[0-9a-f]{32}$/.test(token || "")) return none("error: no trace token");
  const deadline = Date.now() + 8000;
  let u; try { u = new URL(traceUrl); } catch { return none("error: invalid address"); }
  const origin = u.origin;
  for (let hop = 0; hop <= 3; hop++) {
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || net.isIP(host.replace(/^\[|\]$/g, "")) || SELF_HOSTS.test(host))
      return none("error: refused address", `hop ${hop}: ${u.origin}`);
    if (u.origin !== origin) return none("error: redirect to another host", `${origin} redirected to ${u.origin}; a trace is looked for at the address the statement names, on its own host`);
    if (spellings(u.href).some((x) => x.includes(token))) return none("error: token in the address", "the trace token is in the address fetched; it must be in the page itself");
    const r = await fetchOnce(u, deadline);
    if (r.redirect) { try { u = new URL(r.redirect, u); } catch { return none("error: bad redirect"); } continue; }
    if (!r.body) return none(r.status, u.href);
    const found = /^2\d\d$/.test(r.status) && r.body.toString("latin1").toLowerCase().includes(token);
    return { found, http_status: r.status, body_sha256: crypto.createHash("sha256").update(r.body).digest("hex"), detail: `${u.href}${r.truncated ? " (first 512 KB)" : ""}` };
  }
  return none("error: too many redirects");
}

// ---------------------------------------------------------------- status of an adoption from its records (the latest traced record decides)
function statusOf(root, all) {
  const chain = [root, ...all.filter((r) => String(r.refers_to) === String(root.id))].sort((a, b) => a.id - b.id);
  // A statement once traced keeps its effect when moderation hides its text: hiding withholds words, it does not undo a
  // withdrawal or a revision (round 3, R3-11). The public view keeps traced_at for hidden rows.
  const traced = chain.filter((r) => r.state === "traced" || (r.state === "hidden" && r.traced_at));
  if (!traced.length) return { status: "received, not traced", effective: null, commitment: null, chain };
  const last = traced[traced.length - 1];
  const commitments = traced.filter((r) => r.type !== "withdrawal");
  const commitment = commitments.length ? commitments[commitments.length - 1] : null;   // the last statement of what was committed
  if (last.type === "withdrawal") return { status: "withdrawn", effective: last, commitment, chain };
  return { status: last.type === "revision" ? "in force, as revised" : "in force", effective: last, commitment, chain };
}

module.exports = { OPEN, CHAIN, RT, VERSIONS, MAX_STATEMENT, canonical, sha256, validateStatement, traceCheck, blockedAddress, statusOf };
