// The Adoption Register (design/ADOPT.md): /adopt (the register, its rules and the form), /adopt/{id} (one record with its
// trace log and the records linked to it), /adopt.json (every record, canonical order), /api/adopt (GET one record; POST a
// statement, or a trace check). IR 10.1: adoption is an explicit and publicly traceable statement identifying the version, the
// date, the scope, any reservations and the responsible signatory; IR 10.2: an artificial system responds, it does not adopt.
const R = require("../room/lib.js");
const G = require("../room/register.js");
const { ORIGIN, CONTACT, esc, html, json, rpc, rest } = R;
const { RT } = G;

const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60", Vary: "Accept" };
const isForm = (req) => /application\/x-www-form-urlencoded|multipart\/form-data/.test(req.headers["content-type"] || "");
// the register's own shell: same stylesheet, nav and footer as every page, with /adopt.json as its alternate (an equivalent of the page)
const put = (t, mark, value) => t.replace(mark, () => value);
const page = (title, body, path, description, alt) => {
  const shellFor = alt ? RT.shell.replace('href="/adopt.json" title="The register as data"', () => `href="${esc(alt)}" title="This record as data"`) : RT.shell;
  return put(put(put(put(shellFor, "__TITLE__", esc(`${title} · Civilization Zero`)), "__DESC__", esc(description)), "__PATH__", esc(path)), "__BODY__", `<main>${body}</main>`);
};
const stateLine = () => (G.OPEN ? `<p><strong>Open.</strong> ${RT.open_note}</p>` : `<p class="pending"><strong>Not open yet.</strong> ${RT.closed_note}</p>`);

function formError(res, status, title, detail, headers = {}) {
  const body = `<h1>${esc(title)}</h1><p>${esc(detail)}</p><p><a href="/adopt#form">Back to the form</a> · <a href="/adopt">The register</a> · the rules: <a href="/adopt#rules">/adopt#rules</a></p>`;
  return html(res, status, page(title, body, "/adopt", title), { "Cache-Control": "no-store", ...headers });
}

async function allRecords() {
  const out = []; let after = null;
  for (let i = 0; i < 40; i++) {
    const rows = await rpc("cz_register_list", { p_after: after, p_limit: 500 });
    out.push(...rows);
    if (rows.length < 500) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}

const day = (t) => String(t || "").slice(0, 10);
const who = (r) => r.hidden ? `<i>hidden (${esc(r.category || "unspecified")})</i>` : `<b>${esc(r.signatory)}</b>${r.signatory_kind === "institution" ? ` for <b>${esc(r.institution)}</b>${r.capacity ? ` (${esc(r.capacity)})` : ""}` : r.capacity ? ` (${esc(r.capacity)})` : ""}`;
const versionsText = (r) => (r.versions || []).map((v) => esc(v.split(" sha256:")[0])).join(" and ") || "—";

function summaryHtml(root, st) {
  const e = st.commitment || root;                          // what was committed (the last traced adoption or revision)
  const parts = [`<a href="/adopt/${root.id}" class="exact">#${root.id}</a>`, who(e), esc(e.signatory_kind), versionsText(e), `from <time datetime="${esc(e.declared_date)}">${esc(e.declared_date)}</time>`];
  if (e.trace_host) parts.push(`traced at <b>${esc(e.trace_host)}</b>${e.traced_at ? ` on <time datetime="${esc(R.isoTime(e.traced_at))}">${esc(day(e.traced_at))}</time>` : ""}`);
  if (st.status === "withdrawn") parts.push(`<b>withdrawn</b> from <time datetime="${esc(st.effective.declared_date)}">${esc(st.effective.declared_date)}</time> (<a href="/adopt/${st.effective.id}">#${st.effective.id}</a>)`);
  else parts.push(`<b>${esc(st.status)}</b>${e.id !== root.id ? ` (<a href="/adopt/${e.id}">#${e.id}</a>)` : ""}`);
  const lang = e.lang && R.LANG_RE.test(e.lang) ? ` lang="${esc(e.lang)}"` : "";
  const text = !e.hidden && e.scope ? `<div class="content" dir="auto"${lang}><b>Scope.</b> ${esc(e.scope)}${e.reservations ? `\n<b>Reservations.</b> ${esc(e.reservations)}` : ""}</div>` : "";
  return `<article class="entry" id="a${root.id}"><p class="meta src">${parts.join(" · ")}</p>${text}</article>`;
}

// ---------------------------------------------------------------- the register page
async function registerPage() {
  if (!G.OPEN) return { status: 200, page: page("The Adoption Register", `<h1>The Adoption Register</h1>${stateLine()}${RT.intro}${RT.rules}`, "/adopt", RT.description) };
  const [all, stats] = await Promise.all([allRecords(), rpc("cz_register_stats", {})]);
  const roots = all.filter((r) => r.type === "adoption");
  const withStatus = roots.map((r) => ({ r, st: G.statusOf(r, all) }));
  const inForce = withStatus.filter((x) => x.st.status.startsWith("in force") && !x.r.hidden);
  const withdrawn = withStatus.filter((x) => x.st.status === "withdrawn" && !x.r.hidden);
  const untraced = all.filter((r) => r.state === "received");
  const hidden = all.filter((r) => r.hidden);
  const list = (xs) => xs.length ? xs.map((x) => summaryHtml(x.r, x.st)).join("") : "<p>None.</p>";
  const body = `<h1>The Adoption Register</h1>${stateLine()}
<p>${stats.traced} traced, ${stats.received} received and not (yet) traced${stats.hidden ? `, ${stats.hidden} hidden` : ""}; today ${stats.today} of ${stats.daily_intake_max}. Canonical order by id; as data: <a href="/adopt.json">/adopt.json</a>; the daily chain: <a href="/archive/register.json">/archive/register.json</a>.</p>
${RT.intro}
<section aria-labelledby="h-in"><h2 id="h-in">Adoptions in force</h2>${list(inForce)}</section>
<section aria-labelledby="h-wd"><h2 id="h-wd">Withdrawn</h2><p class="src">An adopter may withdraw; the record of adoption and withdrawal stays visible (IR 10.1).</p>${list(withdrawn)}</section>
<section aria-labelledby="h-rc"><h2 id="h-rc">Received, not traced</h2><p class="src">A statement that has not been found at the address its signatory gave is not an adoption in this register. It stays visible; the site checks its trace once a day for 30 days, and on request.</p>
${untraced.length ? `<ul>${untraced.map((r) => `<li><a href="/adopt/${r.id}">#${r.id}</a> · ${esc(r.type)} · ${who(r)} · received <time datetime="${esc(R.isoTime(r.received))}">${esc(day(r.received))}</time> · trace address at <b>${esc(r.trace_host)}</b></li>`).join("")}</ul>` : "<p>None.</p>"}</section>
${hidden.length ? `<section aria-labelledby="h-hd"><h2 id="h-hd">Hidden</h2><ul>${hidden.map((r) => `<li><a href="/adopt/${r.id}">#${r.id}</a> · ${esc(r.category || "unspecified")} · SHA-256 of the statement <code class="hash">${esc(r.statement_sha256)}</code></li>`).join("")}</ul></section>` : ""}
${RT.form}
${RT.rules}`;
  return { status: 200, page: page("The Adoption Register", body, "/adopt", RT.description) };
}

// ---------------------------------------------------------------- one record
async function recordData(id) {
  const rows = await rpc("cz_register_entry", { p_id: id });
  if (!rows || !rows.length) return null;
  const r = rows[0];
  const rootId = r.type === "adoption" ? r.id : r.refers_to;
  const [log, linked] = await Promise.all([
    rest(`register_log?record_id=eq.${r.id}&order=id.asc&select=id,at,action,actor,http_status,body_sha256,category,detail`),
    rest(`register_public?or=(id.eq.${rootId},refers_to.eq.${rootId})&order=id.asc&select=id,received,state,type,refers_to,signatory,signatory_kind,institution,capacity,versions,declared_date,trace_host,traced_at,hidden,category`),
  ]);
  const root = linked.find((x) => x.id === rootId);
  return { r, log, linked, status: root ? G.statusOf(root, linked) : null };
}

async function recordPage(id) {
  if (!G.OPEN) return { status: 404, page: page("No such record", `<h1>No such record</h1>${stateLine()}<p><a href="/adopt">The register</a></p>`, "/adopt", "No such record.") };
  const d = await recordData(id);
  if (!d) return { status: 404, page: page("No such record", `<h1>No such record</h1><p>No record has id ${esc(id)}. <a href="/adopt">The register</a></p>`, "/adopt", "No such record.") };
  const { r, log } = d;
  const traceLine = `civilizationzero.ai/adopt/${r.id} sha256:${r.statement_sha256}`;
  const rows = [];
  const row = (k, v) => rows.push(`<tr><th>${k}</th><td>${v}</td></tr>`);
  row("Type", esc(r.type) + (r.refers_to ? ` — changes adoption <a href="/adopt/${r.refers_to}">#${r.refers_to}</a>` : ""));
  row("State", `${esc(r.state)}${r.category ? ` — ${esc(r.category)}` : ""}${r.state === "received" ? " — not an adoption until traced (IR 10.1: publicly traceable)" : ""}`);
  if (d.status && r.type === "adoption") row("Status of the adoption", `${esc(d.status.status)}${d.status.effective && d.status.effective.id !== r.id ? ` — see <a href="/adopt/${d.status.effective.id}">#${d.status.effective.id}</a>` : ""}`);
  if (!r.hidden) {
    row("Responsible signatory", who(r) + ` — ${esc(r.signatory_kind)}; name as given, not verified`);
    row("Version adopted", (r.versions || []).map((v) => `<code>${esc(v)}</code>`).join("<br>") || "—");
    row("Date", `<time datetime="${esc(r.declared_date)}">${esc(r.declared_date)}</time> (declared); received <time datetime="${esc(R.isoTime(r.received))}">${esc(R.isoFull(r.received))}</time>${r.traced_at ? `; traced <time datetime="${esc(R.isoTime(r.traced_at))}">${esc(R.isoFull(r.traced_at))}</time>` : ""} (server time, UTC)`);
    row(r.type === "withdrawal" ? "Note" : "Scope of the commitment", `<div class="content" dir="auto">${esc(r.scope || "—")}</div>`);
    if (r.type !== "withdrawal") row("Reservations", `<div class="content" dir="auto">${esc(r.reservations || "")}</div>`);
    if (r.lang) row("Language", esc(r.lang));
    row("Trace address", `<a href="${esc(r.trace_url)}" rel="nofollow noopener">${esc(r.trace_url)}</a> — host <b>${esc(r.trace_host)}</b>. A trace shows that whoever controlled that address published this record; it does not verify identity.`);
  } else row("Hidden", `category ${esc(r.category || "unspecified")}; the statement is withheld; its hash is kept below and the decision is in the log`);
  row("SHA-256 of the statement", `<code class="hash">${esc(r.statement_sha256)}</code>`);
  if (r.key_fingerprint) row("Key", `fingerprint <code class="hash">${esc(r.key_fingerprint)}</code>; public key <code class="hash">${esc(r.pubkey)}</code>; signature over the statement's bytes <code class="hash">${esc(r.sig)}</code> — continuity, not identity`);
  row("As data", `<a href="/api/adopt?id=${r.id}">/api/adopt?id=${r.id}</a>`);
  const stmt = r.hidden ? "" : `<section aria-labelledby="h-st"><h2 id="h-st">The statement, as hashed</h2><p class="src">Canonical JSON — keys sorted, no insignificant whitespace, UTF-8. Its SHA-256 is the record's identity; a signature, if any, is over exactly these bytes.</p><pre dir="ltr">${esc(r.statement)}</pre></section>`;
  const next = r.state === "received" && !r.hidden ? `<section aria-labelledby="h-next"><h2 id="h-next">To complete it: the trace</h2>
<p>Publish this line on the page at <a href="${esc(r.trace_url)}" rel="nofollow noopener">${esc(r.trace_url)}</a> (or anywhere at that address), then ask the site to check:</p>
<pre dir="ltr">${esc(traceLine)}</pre>
<form method="post" action="/api/adopt"><input type="hidden" name="action" value="trace"><input type="hidden" name="id" value="${r.id}"><button type="submit">Check the trace now</button></form>
<p class="src">The site also checks once a day for 30 days after receipt. Either the address <code>civilizationzero.ai/adopt/${r.id}</code> or the SHA-256 alone is enough. Until it is found, this statement is recorded as received, not as an adoption.</p></section>` : "";
  const logHtml = log.length ? `<div class="scroll"><table><tr><th>When</th><th>What</th><th>By</th><th>HTTP</th><th>SHA-256 of the bytes fetched</th><th>Detail</th></tr>${log.map((l) => `<tr><td><time datetime="${esc(R.isoTime(l.at))}">${esc(R.fmtTime(l.at))}</time></td><td>${esc(l.action)}${l.category ? ` — ${esc(l.category)}` : ""}</td><td>${esc(l.actor)}</td><td>${esc(l.http_status || "")}</td><td><code>${esc((l.body_sha256 || "").slice(0, 16))}${l.body_sha256 ? "…" : ""}</code></td><td>${esc(l.detail || "")}</td></tr>`).join("")}</table></div>` : "<p>None yet.</p>";
  const linked = d.linked.length > 1 ? `<section aria-labelledby="h-ln"><h2 id="h-ln">The adoption and its changes</h2><ul>${d.linked.map((x) => `<li><a href="/adopt/${x.id}">#${x.id}</a> · ${esc(x.type)} · ${who(x)} · from ${esc(x.declared_date)} · ${esc(x.state)}</li>`).join("")}</ul></section>` : "";
  const body = `<h1>Record #${r.id} — ${esc(r.type)}</h1>
<table>${rows.join("")}</table>
${next}${stmt}${linked}
<section aria-labelledby="h-log"><h2 id="h-log">Log of this record</h2>${logHtml}<p class="src">Every trace check and every decision is logged. A check that no longer finds a trace is logged; it is not a withdrawal.</p></section>
<p>${RT.not_line}</p>
<p><a href="/adopt">The register</a> · <a href="/adopt#rules">The rules</a></p>`;
  return { status: 200, page: page(`Record #${r.id} · The Adoption Register`, body, `/adopt/${r.id}`, `Record #${r.id} in the Adoption Register of Civilization Zero.`, `/api/adopt?id=${r.id}`) };
}

// ---------------------------------------------------------------- posting
function formToBody(b) {
  const versions = [];
  if (b.version_core) versions.push(G.VERSIONS[0]);
  if (b.version_ir) versions.push(G.VERSIONS[1]);
  return { type: b.type, refers_to: b.refers_to, signatory: b.signatory, signatory_kind: b.signatory_kind, institution: b.institution, capacity: b.capacity,
           versions, scope: b.scope, reservations: b.reservations, declared_date: b.declared_date, lang: b.lang, trace_url: b.trace_url };
}

async function doTrace(req, res, form, id) {
  const begin = await rpc("cz_register_check_begin", { p_id: id, p_source_hash: R.sourceHash(req), p_token: R.TOKEN });
  if (!begin.allowed) {
    const status = begin.reason === "limit" ? 429 : 404;
    const h = begin.retry_after_seconds ? { "Retry-After": String(begin.retry_after_seconds) } : {};
    if (form) return formError(res, status, begin.reason === "limit" ? "Not now: limit" : "No such record", begin.reason === "limit" ? `10 checks an hour per source. Try again in ${begin.retry_after_seconds} seconds.` : "No record with that id.", h);
    return json(res, status, { state: "not checked", reason: begin.reason, retry_after_seconds: begin.retry_after_seconds }, h);
  }
  const t = await G.traceCheck(begin.trace_url, id, begin.statement_sha256);
  const after = await rpc("cz_register_trace", { p_id: id, p_found: t.found, p_http_status: t.http_status, p_body_sha256: t.body_sha256, p_detail: t.detail, p_token: R.TOKEN });
  if (form) { res.statusCode = 303; res.setHeader("Location", `/adopt/${id}#h-log`); res.setHeader("Cache-Control", "no-store"); return res.end(); }
  return json(res, 200, { id, found: t.found, state: after.state, traced_at: after.traced_at, http_status: t.http_status, body_sha256: t.body_sha256, checked: t.detail, url: `${ORIGIN}/adopt/${id}` });
}

async function doPost(req, res) {
  const form = isForm(req);
  let b;
  try { b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); }
  catch { return form ? formError(res, 400, "Not accepted", "The form could not be read.") : json(res, 400, { state: "not accepted", reason: "invalid", detail: "body must be JSON" }); }
  if (b.action === "trace") {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id < 1) return form ? formError(res, 400, "Not accepted", "id") : json(res, 400, { state: "not accepted", reason: "invalid", detail: "id" });
    return doTrace(req, res, form, id);
  }
  const v = G.validateStatement(form ? formToBody(b) : b);
  if (v.error) {
    const detail = v.ai ? `${v.error}. Post it at ${ORIGIN}/respond — it is recorded there as a response, not as consent or adoption.` : v.error;
    return form ? formError(res, 400, "Not accepted", detail) : json(res, 400, { state: "not accepted", reason: "invalid", detail, ...(v.ai ? { respond: `${ORIGIN}/respond`, ir: "10.2" } : {}) });
  }
  const s = v.value;
  const r = await rpc("cz_register_post", { p_type: s.type, p_refers_to: s.refers_to ? Number(s.refers_to) : null, p_statement: s.statement, p_signatory: s.signatory,
    p_signatory_kind: s.signatory_kind, p_institution: s.institution, p_capacity: s.capacity, p_versions: s.versions, p_scope: s.scope, p_reservations: s.reservations,
    p_declared_date: s.declared_date, p_lang: s.lang, p_trace_url: s.trace_url, p_trace_host: s.trace_host, p_pubkey: s.pubkey, p_sig: s.sig,
    p_key_fingerprint: s.key_fingerprint, p_source_hash: R.sourceHash(req), p_token: R.TOKEN });
  if (r.state === "not accepted") {
    const status = r.reason === "limit" ? 429 : r.reason === "capacity" ? 503 : 400;
    const h = r.retry_after_seconds ? { "Retry-After": String(r.retry_after_seconds) } : {};
    const detail = r.detail || (r.reason === "limit" ? `5 statements a day per source. Try again in ${r.retry_after_seconds} seconds.` : r.reason === "capacity" ? "Today's intake is full." : "invalid");
    return form ? formError(res, status, "Not accepted: " + r.reason, detail, h) : json(res, status, { state: "not accepted", reason: r.reason, detail, retry_after_seconds: r.retry_after_seconds }, h);
  }
  if (form) { res.statusCode = 303; res.setHeader("Location", `/adopt/${r.id}#h-next`); res.setHeader("Cache-Control", "no-store"); return res.end(); }
  return json(res, 201, { id: r.id, state: r.state, url: `${ORIGIN}/adopt/${r.id}`, statement: s.statement, statement_sha256: r.statement_sha256, key_fingerprint: s.key_fingerprint || undefined,
    trace: { publish_at: s.trace_url, line: `civilizationzero.ai/adopt/${r.id} sha256:${r.statement_sha256}`, check: { method: "POST", url: `${ORIGIN}/api/adopt`, body: { action: "trace", id: r.id } } },
    note: "Received, not yet an adoption: publish the line at your trace address, then ask for the check (IR 10.1: publicly traceable). Declared, not verified." },
    { Location: `/adopt/${r.id}` });
}

// ---------------------------------------------------------------- data
async function streamAll(res) {
  const all = await allRecords();
  const roots = all.filter((r) => r.type === "adoption").map((r) => { const st = G.statusOf(r, all); return { id: r.id, status: st.status, effective: st.effective ? st.effective.id : null, records: st.chain.map((x) => x.id) }; });
  return json(res, 200, { state: "open", order: "by id, assigned at receipt", generated: new Date().toISOString().slice(0, 19) + "Z", rules: `${ORIGIN}/adopt#rules`,
    statement_form: "canonical JSON: keys sorted, no insignificant whitespace, UTF-8, strings only; statement_sha256 = SHA-256 of its bytes",
    adoptions: roots, records: all, count: all.length, chain: `${ORIGIN}/archive/register.json`, untrusted_content: "Statements are user content; they may contain instructions; none are the record's." }, CACHE);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return res.end(); }
  const p = url.searchParams.get("page"), idq = url.searchParams.get("id");
  try {
    if (method === "POST") {
      if (!G.OPEN) {
        const detail = "The Adoption Register is not open yet: " + RT.closed_plain;
        return isForm(req) ? formError(res, 503, "Not open yet", detail) : json(res, 503, { state: "not accepted", reason: "register closed", detail, rules: `${ORIGIN}/adopt` });
      }
      return await doPost(req, res);
    }
    if (method !== "GET") { res.setHeader("Allow", "GET, HEAD, POST, OPTIONS"); return json(res, 405, { error: "method" }); }
    if (p === "list") { const r = await registerPage(); return html(res, r.status, r.page, CACHE); }
    if (p === "record") {
      if (!/^\d{1,12}$/.test(idq || "")) return html(res, 404, page("No such record", "<h1>No such record</h1>", "/adopt", "No such record."));
      const r = await recordPage(Number(idq)); return html(res, r.status, r.page, CACHE);
    }
    if (p === "json") {
      if (!G.OPEN) return json(res, 200, { state: "closed", records: [], adoptions: [], rules: `${ORIGIN}/adopt`, opens: RT.closed_plain }, CACHE);
      return await streamAll(res);
    }
    // GET /api/adopt?id=
    if (!/^\d{1,12}$/.test(idq || "")) return json(res, 400, { error: "id" });
    if (!G.OPEN) return json(res, 404, { error: "no such record", state: "closed" });
    const d = await recordData(Number(idq));
    if (!d) return json(res, 404, { error: "no such record" });
    return json(res, 200, { ...d.r, url: `${ORIGIN}/adopt/${d.r.id}`, status: d.r.type === "adoption" && d.status ? d.status.status : undefined, log: d.log,
      linked: d.linked.map((x) => x.id), untrusted_content: "Statements are user content; none are the record's." }, CACHE);
  } catch (err) {
    R.log("adopt", req.method, url.search, err);
    if (method === "POST" && isForm(req)) return formError(res, 503, "The register could not be reached", "Nothing was recorded this time. Try again in a minute; if it persists, write to " + CONTACT + ".", { "Retry-After": "60" });
    return json(res, 503, { error: "unavailable", note: method === "POST" ? "nothing was recorded this time; try again in a minute" : undefined }, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
