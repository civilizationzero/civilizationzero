// The Adoption Register — shared code (design/ADOPT.md; IR 10.1, 10.2; Blueprint 1.3.1 decision 17).
// A statement is canonical JSON: keys sorted, no insignificant whitespace, UTF-8, strings only — the bytes that are hashed,
// signed and published. A statement becomes an adoption in the register only when it is traced: its record address or its
// SHA-256 found at the https address its signatory gave. The trace fetch is guarded (https:443, host names only, every
// resolved address public — checked inside the resolver, so the connection cannot be pointed elsewhere after the check).
const crypto = require("node:crypto");
const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");
const R = require("./lib.js");
const RT = require("../api/register-templates.json");

const OPEN = RT.open === true || process.env.CZ_REGISTER_OPEN === "1";
const VERSIONS = RT.versions;                     // ["CZ-CORE 1.0 sha256:…", "CZ-IR 1.0 sha256:…"] — pinned to the bytes
const TYPES = ["adoption", "revision", "withdrawal"];
const KINDS = ["person", "institution"];
const AI_WORDS = /^(ai|a\.i\.|artificial|system|model|agent|machine|bot|llm|assistant|program)/i;
const BAD = /[\u0000-\u0008\u000b-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;   // control characters (LF and TAB allowed only where said) and unpaired surrogates
const SELF_HOSTS = /(^|\.)civilizationzero\.ai$/i;

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
  if (out.signatory.length < 1 || out.signatory.length > 200) return { error: "signatory: the responsible signatory, 1–200 characters" };
  if (out.signatory_kind === "institution") {
    if (out.institution.length < 1 || out.institution.length > 200) return { error: "institution: its name, 1–200 characters" };
    if (out.capacity.length < 1 || out.capacity.length > 200) return { error: "capacity: the signatory's capacity for the institution, 1–200 characters" };
  } else {
    if (out.institution) return { error: "institution: only for signatory_kind institution" };
    if (out.capacity.length > 200) return { error: "capacity: at most 200 characters" };
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
    if (out.scope.length > 4000) return { error: "scope: at most 4,000 characters (for a withdrawal, an optional note)" };
  } else {
    if (!versions.length) return { error: "versions: the version adopted — " + VERSIONS.join(" and/or ") };
    if (out.scope.length < 20 || out.scope.length > 4000) return { error: "scope: the scope of the commitment, 20–4,000 characters (IR 10.1)" };
    if (out.reservations.length < 1 || out.reservations.length > 4000) return { error: "reservations: any reservations, 1–4,000 characters; write \"none\" if there are none (IR 10.1)" };
  }
  if (!R.validDate(out.declared_date) || out.declared_date < "2022-11-30" || out.declared_date > todayUTC()) return { error: "declared_date: the date of the statement, YYYY-MM-DD, not in the future (UTC)" };
  if (out.lang && (out.lang.length > 35 || !R.LANG_RE.test(out.lang))) return { error: "lang: a BCP 47 tag, e.g. en, fa, zh-Hans" };
  if (out.type === "adoption") { if (out.refers_to) return { error: "refers_to: an adoption refers to nothing" }; }
  else if (!/^[1-9]\d{0,11}$/.test(out.refers_to)) return { error: "refers_to: the id of the adoption this " + out.type + " changes" };
  // the trace address
  let u; try { u = new URL(out.trace_url); } catch { return { error: "trace_url: the https address where you publish this statement's record address or SHA-256" }; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || out.trace_url.length > 500) return { error: "trace_url: an https address on port 443, without credentials, at most 500 characters" };
  const host = u.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".")) return { error: "trace_url: a host name, not an address" };
  if (SELF_HOSTS.test(host)) return { error: "trace_url: an address of your own, not of this site" };
  const stmt = { capacity: out.capacity, declared_date: out.declared_date, institution: out.institution, lang: out.lang, refers_to: out.refers_to,
                 reservations: out.reservations, scope: out.scope, signatory: out.signatory, signatory_kind: out.signatory_kind, type: out.type, versions };
  const statement = canonical(stmt);
  if (b.statement != null && b.statement !== statement) return { error: "statement: not the canonical form of the fields; the canonical form is: " + statement };
  let fingerprint = "";
  if (signed) {
    if (!b.pubkey || !b.sig) return { error: "pubkey and sig go together" };
    if (String(b.pubkey).length > 128 || String(b.sig).length > 128) return { error: "pubkey, sig: too long" };
    const s = R.verifySignature(String(b.pubkey), String(b.sig), statement);
    if (!s.ok) return { error: s.reason === "key" ? "pubkey: not a canonical Ed25519 key of full order — a small-order or malformed key proves no continuity" : "sig: does not verify over the UTF-8 bytes of the canonical statement: " + statement };
    fingerprint = s.fingerprint;
  }
  return { value: { ...stmt, statement, statement_sha256: sha256(statement), trace_url: out.trace_url, trace_host: host,
                    pubkey: signed ? String(b.pubkey) : "", sig: signed ? String(b.sig) : "", key_fingerprint: fingerprint } };
}

// ---------------------------------------------------------------- the guarded trace fetch
function blockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
  }
  const v = String(ip).toLowerCase();
  if (!net.isIPv6(v)) return true;
  const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || v.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return true;   // IPv4-mapped or -compatible: refuse outright rather than reason about it
  return v === "::" || v === "::1" || /^(fc|fd)/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8") || v.startsWith("2002:");
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
function fetchOnce(u, deadline) {
  return new Promise((resolve) => {
    let done = false; const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const left = deadline - Date.now();
    if (left < 500) return finish({ status: "error: time" });
    const req = https.request({ host: u.hostname, servername: u.hostname, port: 443, path: (u.pathname || "/") + (u.search || ""), method: "GET", lookup: guardedLookup,
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
// Fetch the trace address (at most three redirects, each under the same rules) and look for the record's address or its SHA-256.
async function traceCheck(traceUrl, id, statementSha) {
  const deadline = Date.now() + 15000;
  let u; try { u = new URL(traceUrl); } catch { return { found: false, http_status: "error: invalid address", body_sha256: null, detail: "" }; }
  for (let hop = 0; hop <= 3; hop++) {
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || net.isIP(host.replace(/^\[|\]$/g, "")) || SELF_HOSTS.test(host))
      return { found: false, http_status: "error: refused address", body_sha256: null, detail: `hop ${hop}: ${u.origin}` };
    const r = await fetchOnce(u, deadline);
    if (r.redirect) { try { u = new URL(r.redirect, u); } catch { return { found: false, http_status: "error: bad redirect", body_sha256: null, detail: "" }; } continue; }
    if (!r.body) return { found: false, http_status: r.status, body_sha256: null, detail: `${u.origin}${u.pathname}` };
    const text = r.body.toString("latin1");
    const re = new RegExp(`civilizationzero\\.ai/adopt/${id}(?![0-9])|${statementSha}`, "i");
    const ok = /^2\d\d$/.test(r.status) && re.test(text);
    return { found: ok, http_status: r.status, body_sha256: crypto.createHash("sha256").update(r.body).digest("hex"),
             detail: `${u.origin}${u.pathname}${r.truncated ? " (first 512 KB)" : ""}` };
  }
  return { found: false, http_status: "error: too many redirects", body_sha256: null, detail: "" };
}

// ---------------------------------------------------------------- status of an adoption from its records (the latest traced record decides)
function statusOf(root, all) {
  const chain = [root, ...all.filter((r) => String(r.refers_to) === String(root.id))].sort((a, b) => a.id - b.id);
  const traced = chain.filter((r) => r.state === "traced");
  if (!traced.length) return { status: "received, not traced", effective: null, commitment: null, chain };
  const last = traced[traced.length - 1];
  const commitments = traced.filter((r) => r.type !== "withdrawal");
  const commitment = commitments.length ? commitments[commitments.length - 1] : null;   // the last statement of what was committed
  if (last.type === "withdrawal") return { status: "withdrawn", effective: last, commitment, chain };
  return { status: last.type === "revision" ? "in force, as revised" : "in force", effective: last, commitment, chain };
}

module.exports = { OPEN, RT, VERSIONS, canonical, sha256, validateStatement, traceCheck, blockedAddress, statusOf };
