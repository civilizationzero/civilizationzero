#!/usr/bin/env node
// cz-live-check — does the live site do what its pages say it does? Node 18 or later, no dependencies.
//
//   node site/verify/live-check.mjs                         check https://civilizationzero.ai, print one line per check
//   node site/verify/live-check.mjs --site URL              another copy of the site (a preview, a mirror that serves the same)
//   node site/verify/live-check.mjs --json FILE             also write the result as data (the daily run commits it to
//                                                           archive/live-check/; /how-it-is-built shows the latest)
// Exit status: 0 when every check passed, 1 otherwise.
//
// It asks as a script (user agent cz-check/1.0), so the site counts it as an automated request, apart from readers. It reads
// pages and data, and sends one request the site must refuse (a translation asked for from another site's page); it never
// posts an entry. The record's own checks — hashes, signatures, timestamps, the daily chains — are verify.py's (verify-live);
// these are the site's: what it sends, how it answers, and the promises its pages make about themselves.
// Written by Claude (Anthropic) at the request of the record's originating human, CZ 1433 (the originator's decision, item 4).
import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SITE = (opt("--site") || "https://civilizationzero.ai").replace(/\/+$/, "");
const JSON_OUT = opt("--json");
const UA = "cz-check/1.0 (+https://civilizationzero.ai/how-it-is-built#checks)";
// the canonical texts' SHA-256, as printed on /core and /record and in the release manifest (verify.py checks the signatures)
const CORE_SHA = "92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a";
const IR_SHA = "71e1488e631e090c0820bf8b78b1fda70ffacba1da146c36d8893600320fcc8d";
const CITE_AS = "https://doi.org/10.5281/zenodo.23740317";
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

// one request, the bytes exactly as sent (no decompression), with the headers as given: nothing is added but the user agent
function raw(path, headers = {}, method = "GET", body = null, retry = 1) {
  return raw1(path, headers, method, body).catch((e) => { if (retry > 0) return new Promise((ok) => setTimeout(ok, 3000)).then(() => raw(path, headers, method, body, retry - 1)); throw e; });
}
function raw1(path, headers, method, body) {
  const u = new URL(SITE + path), lib = u.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(u, { method, headers: { "user-agent": UA, ...headers }, timeout: 30000 }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const b = Buffer.concat(chunks); resolve({ s: res.statusCode, h: res.headers, b, t: b.toString("utf8") }); });
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const get = (path, headers = {}) => raw(path, { accept: BROWSER, ...headers });

const results = [];
async function check(name, fn) {
  try {
    const r = await fn();
    const ok = r === true || (r && r.ok === true);
    results.push({ name, ok, detail: r && r.detail ? String(r.detail).slice(0, 300) : "" });
  } catch (e) { results.push({ name, ok: false, detail: `${e.name}: ${e.message}`.slice(0, 300) }); }
}
const det = (ok, detail) => ({ ok: !!ok, detail });
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const digestOf = (b) => `sha-256=:${sha256(b).toString("base64")}:`;
const running = (html) => [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\btype\s*=\s*"(application\/ld\+json|speculationrules|application\/json)"/i.test(m[1])).length;
const hasLink = (h, re) => re.test(String(h.link || ""));

const PAGES = ["/", "/core", "/record", "/about", "/machine", "/ask", "/archive", "/calendar", "/objections", "/press", "/how-it-is-built", "/discuss", "/stats", "/respond", "/adopt"];
let commit = null;

// 1. the pages: HTML, the policy, no cookie, no script that runs but /ask's, the weight line, the Markdown in the Link header
for (const p of PAGES) {
  await check(`${p}: HTML with its policy, no cookie, its weight, its Markdown linked`, async () => {
    const r = await get(p), csp = String(r.h["content-security-policy"] || "");
    const md = p === "/" ? "/index.md" : `${p}.md`;
    const scripts = running(r.t), want = p === "/ask" ? 1 : 0;
    const problems = [];
    if (r.s !== 200) problems.push(`status ${r.s}`);
    if (!/^text\/html/.test(r.h["content-type"] || "")) problems.push(`type ${r.h["content-type"]}`);
    if (!/default-src 'none'/.test(csp) || !/script-src[^;]*'sha256-/.test(csp) || !/frame-ancestors 'none'/.test(csp)) problems.push("policy");
    if (r.h["set-cookie"]) problems.push("a cookie");
    if (scripts !== want) problems.push(`${scripts} scripts that run`);
    if (!/<!--cz-weight(?: images=\d+)?-->This page: [\d.]+ kB/.test(r.t)) problems.push("no weight line");
    if (!hasLink(r.h, new RegExp(`<${md.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>; rel="alternate"; type="text/markdown"`))) problems.push(`Link lacks ${md}`);
    if (p === "/how-it-is-built") { const m = /data-commit="([0-9a-f]{7,40})"/.exec(r.t); commit = m ? m[1] : null; }
    return det(!problems.length, problems.join("; ") || `${r.b.length} bytes`);
  });
}
await check("security headers on every page (HSTS, nosniff, frame, referrer)", async () => {
  const r = await get("/core"), h = r.h;
  const ok = /max-age=\d{7,}/.test(h["strict-transport-security"] || "") && h["x-content-type-options"] === "nosniff" && /DENY/i.test(h["x-frame-options"] || "") && !!h["referrer-policy"];
  return det(ok, `HSTS ${h["strict-transport-security"]}; frame ${h["x-frame-options"]}; referrer ${h["referrer-policy"]}`);
});

// 2. the canonical texts: their bytes, their digests (RFC 9530) when sent as they are, none when compressed, and how to cite them
for (const [path, want] of [["/core.txt", CORE_SHA], ["/record.txt", IR_SHA]]) {
  await check(`${path}: the canonical bytes, with a Repr-Digest that matches them`, async () => {
    const r = await raw(path, { "accept-encoding": "identity" });
    const hex = sha256(r.b).toString("hex"), d = digestOf(r.b);
    const ok = r.s === 200 && hex === want && r.h["repr-digest"] === d && !r.h["content-digest"] && !r.h["content-encoding"];
    return det(ok, `sha256 ${hex.slice(0, 16)}…; Repr-Digest ${r.h["repr-digest"] || "absent"}`);
  });
  await check(`${path}: compressed, no digest of the uncompressed bytes is claimed`, async () => {
    const r = await raw(path, { "accept-encoding": "gzip, br" });
    const enc = r.h["content-encoding"];
    return det(!enc || (!r.h["content-digest"] && !r.h["repr-digest"]), `content-encoding ${enc || "none"}; digest ${r.h["content-digest"] || "absent"}`);
  });
}
await check("/core.txt: a part of it carries the digest of the whole (Repr-Digest), never a Content-Digest", async () => {
  const [w, r] = await Promise.all([raw("/core.txt", { "accept-encoding": "identity" }), raw("/core.txt", { "accept-encoding": "identity", range: "bytes=0-99" })]);
  return det(!r.h["content-digest"] && (r.s !== 206 || r.h["repr-digest"] === digestOf(w.b)), `status ${r.s}; Repr-Digest ${r.h["repr-digest"] || "absent"}`);
});
await check("/core and /core.txt name the DOI to cite (rel=cite-as), /core in its head with Google Scholar's tags", async () => {
  const a = await get("/core"), b = await raw("/core.txt");
  const re = new RegExp(`<${CITE_AS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>; rel="cite-as"`);
  const ok = hasLink(a.h, re) && hasLink(b.h, re) && a.t.includes(`<link rel="cite-as" href="${CITE_AS}">`) && /<meta name="citation_title" content="[^"]+">/.test(a.t);
  return det(ok, `HTML Link ${hasLink(a.h, re)}; text Link ${hasLink(b.h, re)}`);
});
await check("/core: each paragraph has its address (#p3-2), each section a line to cite it", async () => {
  const r = await get("/core");
  return det(r.t.includes('id="p3-2"') && r.t.includes('id="closing-1"') && (r.t.match(/<p class="src cite">/g) || []).length === 16, "");
});
await check("/record: each paragraph has its address (#s3-4-2)", async () => det((await get("/record")).t.includes('id="s3-4-2"'), ""));
await check("the citation files: BibTeX, RIS, CSL-JSON", async () => {
  const [b, r, c] = await Promise.all(["/cite/civilization-zero.bib", "/cite/civilization-zero.ris", "/cite/civilization-zero.csl.json"].map((p) => raw(p)));
  const ok = b.s === 200 && /^@misc\{cz-core-1\.0,/.test(b.t) && r.s === 200 && /^TY {2}- GEN/.test(r.t) && c.s === 200 && JSON.parse(c.t).length === 3;
  return det(ok, `${b.h["content-type"]}; ${r.h["content-type"]}; ${c.h["content-type"]}`);
});

// 3. one address, several forms: content negotiation and Markdown
for (const [p, accept, re] of [["/core", "application/json", /json/], ["/core", "text/plain", /text\/plain/], ["/core", "text/markdown", /text\/markdown/],
                               ["/", "application/json", /json/], ["/", "text/markdown", /text\/markdown/], ["/discuss/7", "text/markdown", /text\/markdown/],
                               ["/", "application/json, text/markdown;q=0.1", /json/]]) {
  await check(`${p} with Accept: ${accept}`, async () => { const r = await raw(p, { accept }); return det(r.s === 200 && re.test(r.h["content-type"] || ""), `${r.s} ${r.h["content-type"]}`); });
}
for (const p of ["/index.md", "/core.md", "/about.md", "/discuss.md", "/discuss/7.md", "/how-it-is-built.md"]) {
  await check(`${p}: Markdown with a front matter, not indexed`, async () => {
    const r = await raw(p);
    return det(r.s === 200 && /^text\/markdown/.test(r.h["content-type"] || "") && /^---\ntitle: /.test(r.t) && r.h["x-robots-tag"] === "noindex", `${r.s} ${r.h["content-type"]}`);
  });
}

// 4. the room: an entry's relations in its Link header, translations that only read, a refusal
await check("/discuss/7: Link names its data and the entry it answers (rel=up)", async () => {
  const r = await get("/discuss/7");
  return det(r.s === 200 && hasLink(r.h, /<\/api\/entries\/7>; rel="alternate"; type="application\/json"/) && hasLink(r.h, /<\/discuss\/1>; rel="up"/), String(r.h.link || ""));
});
await check("/discuss/1?tl=fa: a translated view, marked, not indexed, the original canonical", async () => {
  const r = await get("/discuss/1?tl=fa");
  return det(r.s === 200 && r.t.includes('name="robots" content="noindex"') && r.t.includes(`<link rel="canonical" href="https://civilizationzero.ai/discuss/1">`), "");
});
await check("GET of a translation only reads (never asks the engine)", async () => {
  // a language from the private-use range qaa–qtz, chosen at random; if one already has a translation (someone pressed the button
  // for it), another: the check is that a GET never makes one, so it needs a language that has none
  let t = {}, lang = "";
  for (let i = 0; i < 4; i++) {
    lang = "q" + "abcdefghijklmnopqrst"[crypto.randomInt(20)] + "abcdefghijklmnopqrstuvwxyz"[crypto.randomInt(26)];
    const r = await raw(`/api/entries/7?translate=${lang}`, { accept: "application/json" });
    if (r.s !== 200) return det(false, `status ${r.s}`);
    t = JSON.parse(r.t).translation || {};
    if (t.state === "not available") return det(true, lang);
    if (!["done", "corrected"].includes(t.state)) break;
  }
  return det(false, `${lang}: state ${t.state}`);
});
await check("a translation asked for from another site's page is refused", async () => {
  const r = await raw("/api/discuss?page=translate", { origin: "https://example.com", "content-type": "application/x-www-form-urlencoded" }, "POST", "lang=fa&ids=7&back=%2Fdiscuss%2F7%3Ftl%3Dfa");
  return det(r.s === 403, `status ${r.s}`);
});
await check("the forms say an entry cannot be recalled (/respond, the reply dialog), where the room takes entries", async () => {
  const [a, b] = await Promise.all([get("/respond"), get("/discuss/1")]);
  const re = /<p class="src permanence">An entry cannot be edited or withdrawn\./;
  return det((re.test(a.t) || !a.t.includes('<form class="respond"')) && (re.test(b.t) || !b.t.includes("<dialog")), "");
});
await check("robots.txt keeps views out of the index; sitemaps answer", async () => {
  const [r, s] = await Promise.all([raw("/robots.txt"), raw("/sitemap.xml")]);
  return det(r.t.includes("Disallow: /*?tl=") && r.t.includes("Disallow: /admin") && s.s === 200 && s.t.includes("<urlset"), "");
});
await check("the first page links the table of reasons; the colophon holds it", async () => {
  const [a, b] = await Promise.all([get("/"), get("/how-it-is-built")]);
  return det(a.t.includes('href="/how-it-is-built#reasons"') && b.t.includes('<h2 id="reasons">'), "");
});
await check("/how-it-is-built names the commit it was deployed from", async () => det(!!commit, commit || "no data-commit"));

// the result
const passed = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ""}`);
console.log(`${passed}/${results.length} passed · ${SITE} · deployed commit ${commit || "unknown"}`);
if (JSON_OUT) {
  const out = { what: "The daily check of the live site by site/verify/live-check.mjs: what the site sends and how it answers, against what its pages say. The record's own checks are verify.py's.",
    checked_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), site: SITE, commit, passed, total: results.length,
    failed: results.filter((r) => !r.ok).map((r) => r.name), run: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    script: "site/verify/live-check.mjs", checks: results };
  fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1) + "\n");
}
process.exitCode = passed === results.length ? 0 : 1;
