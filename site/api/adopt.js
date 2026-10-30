// The Adoption Register (design/ADOPT.md): /adopt (the register, its rules and the form), /adopt/{id} (one record with its
// trace log and the records linked to it), /adopt.json (every record, canonical order), /api/adopt (GET one record; POST a
// statement, or a trace check). IR 10.1: adoption is an explicit and publicly traceable statement identifying the version, the
// date, the scope, any reservations and the responsible signatory; IR 10.2: an artificial system responds, it does not adopt.
// Once the register has opened, its records stay visible whatever its state (G.CHAIN); statements are taken only while it is
// open (G.OPEN). The trace token is shown once, to the submitter, in the answer to the POST, and never on a public page.
const R = require("../room/lib.js");
const CZ = require("../room/cztime.js");
const G = require("../room/register.js");
const { ORIGIN, CONTACT, esc, html, json, rpc, rest } = R;
const { RT } = G;

const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60", Vary: "Accept" };
const NO_STORE = { "Cache-Control": "no-store" };
const PAGE = 500, MAX_PAGES = 200;       // the register is read in pages of 500, up to 100,000 records; beyond that, said so
const LOG_SHOWN = 100;                   // the newest 100 log rows on a record's page; all of them, in pages, as data
const LINKED_SHOWN = 1000;               // cz_register_linked's limit: the adoption and its first 999 changes
const UNTRACED_DAYS = 30;                // received statements are listed as awaiting a trace for 30 days (the time they can be traced)
const isForm = (req) => /application\/x-www-form-urlencoded|multipart\/form-data/.test(req.headers["content-type"] || "");
// Answers to POST carry no CORS headers: another site's page must not read a submitter's token, nor post in its visitors' names
function jsonPost(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body) + "\n");
}
// A browser says where a request comes from: a statement or a check is taken from this site's own pages, or from a client that
// sends no Origin (a program), never from another site's page
const foreignOrigin = (req) => { const o = req.headers.origin; if (!o) return false; const host = req.headers["x-forwarded-host"] || req.headers.host || ""; return o !== `https://${host}` && o !== ORIGIN; };
// the register's own shell: same stylesheet, nav and footer as every page, with /adopt.json as its alternate (an equivalent of the page)
const page = (title, body, path, description, alt, head) => {
  const shellFor = alt ? RT.shell.replace('href="/adopt.json" title="The register as data"', () => `href="${esc(alt)}" title="This record as data"`) : RT.shell;
  return R.fill(shellFor, { TITLE: esc(`${title} · Civilization Zero`), DESC: esc(description), PATH: esc(path), HEAD: head || "", BODY: `<main>${body}</main>` });
};
const stateLine = () => (G.OPEN ? `<p><strong>Open.</strong> ${RT.open_note}</p>`
  : G.CHAIN ? `<p class="pending"><strong>Closed.</strong> ${RT.closed_after_note}</p>` : `<p class="pending"><strong>Not open yet.</strong> ${RT.closed_note}</p>`);
const traceLine = (id, token) => `civilizationzero.ai/adopt/${id} trace:${token}`;

function formError(res, status, title, detail, headers = {}) {
  const body = `<h1>${esc(title)}</h1><p>${esc(detail)}</p><p>Your text is still in the form: go back with your browser's Back button. · <a href="/adopt#form">A new, empty form</a> · <a href="/adopt">The register</a> · the rules: <a href="/adopt#rules">/adopt#rules</a></p>`;
  return html(res, status, page(title, body, "/adopt", title), { ...NO_STORE, ...headers });
}

// every record in canonical order; complete is false (and next_after set) only beyond MAX_PAGES pages, and is then said
async function allRecords(start = null) {
  const rows = []; let after = start;
  for (let i = 0; i < MAX_PAGES; i++) {
    const got = await rpc("cz_register_list", { p_after: after, p_limit: PAGE });
    rows.push(...got);
    if (got.length < PAGE) return { rows, complete: true, next_after: null };
    after = got[got.length - 1].id;
  }
  return { rows, complete: false, next_after: after };
}

const day = (t) => String(t || "").slice(0, 10);
const recent = (t) => Date.now() - Date.parse(t) < UNTRACED_DAYS * 86400000;
const who = (r) => r.hidden ? `<i>hidden (${esc(r.category || "unspecified")})</i>` : `<b>${R.decl(r.signatory)}</b>${r.signatory_kind === "institution" ? ` for <b>${R.decl(r.institution)}</b>${r.capacity ? ` (${R.decl(r.capacity)})` : ""}` : r.capacity ? ` (${R.decl(r.capacity)})` : ""}`;   // declared names, isolated (R3-22)
const versionsText = (r) => (r.versions || []).map((v) => esc(v.split(" sha256:")[0])).join(" and ") || "—";

function summaryHtml(root, st) {
  const e = st.commitment || root;                          // what was committed (the last traced adoption or revision)
  const parts = [`<a href="/adopt/${root.id}" class="exact">#${root.id}</a>`, who(e), esc(e.signatory_kind), versionsText(e), `from ${CZ.whenHtml(e.declared_date)}`];
  if (e.state === "traced" && e.traced_at) parts.push(`traced at <a href="${esc(e.trace_url)}" rel="nofollow noopener">${esc(e.trace_url)}</a> on ${CZ.whenHtml(day(e.traced_at))}${e.key_fingerprint ? " · signed" : ""}`);
  if (st.status === "withdrawn") parts.push(`<b>withdrawn</b> from ${CZ.whenHtml(st.effective.declared_date)} (<a href="/adopt/${st.effective.id}">#${st.effective.id}</a>)`);
  else parts.push(`<b>${esc(st.status)}</b>${e.id !== root.id ? ` (<a href="/adopt/${e.id}">#${e.id}</a>)` : ""}`);
  const lang = e.lang && R.LANG_RE.test(e.lang) ? ` lang="${esc(e.lang)}"` : "";
  const text = !e.hidden && e.scope ? `<div class="content" dir="auto"${lang}><b>Scope.</b> ${esc(e.scope)}${e.reservations ? `\n<b>Reservations.</b> ${esc(e.reservations)}` : ""}</div>` : "";
  return `<article class="entry" id="a${root.id}"><p class="meta src">${parts.join(" · ")}</p>${text}</article>`;
}

// ---------------------------------------------------------------- the register page
async function registerPage() {
  if (!G.CHAIN) return { status: 200, page: page("The Adoption Register", `<h1>The Adoption Register</h1>${stateLine()}${RT.intro}${RT.rules}`, "/adopt", RT.description) };
  const [{ rows: all, complete }, stats] = await Promise.all([allRecords(), rpc("cz_register_stats", {})]);
  const roots = all.filter((r) => r.type === "adoption" && r.state === "traced");
  const withStatus = roots.map((r) => ({ r, st: G.statusOf(r, all) }));
  const inForce = withStatus.filter((x) => x.st.status.startsWith("in force"));
  const withdrawn = withStatus.filter((x) => x.st.status === "withdrawn");
  const received = all.filter((r) => r.state === "received");
  const awaiting = received.filter((r) => recent(r.received)), expired = received.length - awaiting.length;
  const hidden = all.filter((r) => r.hidden);
  const list = (xs) => xs.length ? xs.map((x) => summaryHtml(x.r, x.st)).join("") : "<p>None.</p>";
  const body = `<h1>The Adoption Register</h1>${stateLine()}
<p>${stats.traced} traced, ${stats.received} received and not traced${stats.hidden ? `, ${stats.hidden} hidden` : ""}${G.OPEN ? `; today ${stats.today} of ${stats.daily_intake_max}. Limits in force: ${stats.rate_per_day} statements a day per source, ${stats.daily_intake_max} in all; ${stats.checks_per_hour} checks an hour per source; one check of a record in 10 minutes` : ""}. Canonical order by id; as data: <a href="/adopt.json">/adopt.json</a>; the daily chain: <a href="/archive/register.json">/archive/register.json</a>.${complete ? "" : ` <strong>This page shows the first ${all.length.toLocaleString("en")} records only;</strong> every record is in /adopt.json, page by page.`}</p>
${RT.intro}
<section aria-labelledby="h-in"><h2 id="h-in">Adoptions in force</h2>${list(inForce)}</section>
<section aria-labelledby="h-wd"><h2 id="h-wd">Withdrawn</h2><p class="src">An adopter may withdraw; the record of adoption and withdrawal stays visible (IR 10.1).</p>${list(withdrawn)}</section>
<section aria-labelledby="h-rc"><h2 id="h-rc">Received, awaiting a trace</h2><p class="src">A statement that has not been found at the address it names is not an adoption in this register. It can be traced for ${UNTRACED_DAYS} days after receipt — the daily job and anyone who asks check it — and stays at its address afterwards.${expired ? ` ${expired} older statement${expired === 1 ? " was" : "s were"} never traced; ${expired === 1 ? "it is" : "they are"} in <a href="/adopt.json">/adopt.json</a>.` : ""}</p>
${awaiting.length ? `<ul>${awaiting.map((r) => `<li><a href="/adopt/${r.id}">#${r.id}</a> · ${esc(r.type)}${r.refers_to ? ` of <a href="/adopt/${r.refers_to}">#${r.refers_to}</a>` : ""} · ${who(r)} · received ${CZ.whenHtml(day(r.received))} · to be traced at <b>${esc(r.trace_host)}</b></li>`).join("")}</ul>` : "<p>None.</p>"}</section>
${hidden.length ? `<section aria-labelledby="h-hd"><h2 id="h-hd">Hidden</h2><ul>${hidden.map((r) => `<li><a href="/adopt/${r.id}">#${r.id}</a> · ${esc(r.category || "unspecified")} · SHA-256 of the statement <code class="hash">${esc(r.statement_sha256)}</code></li>`).join("")}</ul></section>` : ""}
${G.OPEN ? RT.form : ""}
${RT.rules}`;
  return { status: 200, page: page("The Adoption Register", body, "/adopt", RT.description) };
}

// ---------------------------------------------------------------- one record
async function recordLog(id, after, limit, newestFirst) {
  const q = `register_log?record_id=eq.${id}${after ? `&id=gt.${after}` : ""}&order=id.${newestFirst ? "desc" : "asc"}&limit=${limit}&select=id,at,action,actor,http_status,body_sha256,category,detail`;
  return rest(q);
}
async function recordData(id) {
  const rows = await rpc("cz_register_entry", { p_id: id });
  if (!rows || !rows.length) return null;
  const r = rows[0];
  const rootId = r.type === "adoption" ? r.id : r.refers_to;
  const [newest, linked, effect] = await Promise.all([recordLog(r.id, null, LOG_SHOWN + 1, true), rpc("cz_register_linked", { p_root: rootId }),
    rpc("cz_register_effect", { p_root: rootId })]);
  const root = linked.find((x) => x.id === rootId);
  // the list holds the first LINKED_SHOWN records; the latest traced statements are read from the whole history, so that the
  // status here is the status in /adopt and /adopt.json however long the history (R3-12)
  const seen = new Set(linked.map((x) => x.id));
  const history = [...linked, ...effect.filter((x) => !seen.has(x.id))];
  return { r, log: newest.slice(0, LOG_SHOWN).reverse(), log_more: newest.length > LOG_SHOWN, linked, linked_more: linked.length >= LINKED_SHOWN,
           status: root && root.state === "traced" ? G.statusOf(root, history) : null };
}

async function recordPage(id) {
  if (!G.CHAIN) return { status: 404, page: page("No such record", `<h1>No such record</h1>${stateLine()}<p><a href="/adopt">The register</a></p>`, "/adopt", "No such record.") };
  const d = await recordData(id);
  if (!d) return { status: 404, page: page("No such record", `<h1>No such record</h1><p>No record has id ${esc(id)}. <a href="/adopt">The register</a></p>`, "/adopt", "No such record.") };
  const { r, log } = d;
  const rows = [];
  const row = (k, v) => rows.push(`<tr><th>${k}</th><td>${v}</td></tr>`);
  row("Type", esc(r.type) + (r.refers_to ? ` — changes adoption <a href="/adopt/${r.refers_to}">#${r.refers_to}</a>` : ""));
  row("State", `${esc(r.state)}${r.category ? ` — ${esc(r.category)}` : ""}${r.state === "received" ? " — not an adoption: not traced (IR 10.1: publicly traceable)" : ""}`);
  if (r.type === "adoption") row("Status of the adoption", d.status ? `${esc(d.status.status)}${d.status.effective && d.status.effective.id !== r.id ? ` — see <a href="/adopt/${d.status.effective.id}">#${d.status.effective.id}</a>` : ""}` : r.hidden ? "hidden: the statement is withheld (see the log)" : "none: the statement is not traced");
  if (!r.hidden) {
    row("Responsible signatory", who(r) + ` — ${esc(r.signatory_kind)}; name as given, not verified`);
    row("Version adopted", (r.versions || []).map((v) => `<code>${esc(v)}</code>`).join("<br>") || "—");
    row("Date", `${CZ.whenHtml(r.declared_date)} (declared); received ${CZ.whenHtml(r.received, { seconds: true })}${r.traced_at ? `; traced ${CZ.whenHtml(r.traced_at, { seconds: true })}` : ""} (server time)`);
    row(r.type === "withdrawal" ? "Note" : "Scope of the commitment", `<div class="content" dir="auto">${esc(r.scope || "—")}</div>`);
    if (r.type !== "withdrawal") row("Reservations", `<div class="content" dir="auto">${esc(r.reservations || "")}</div>`);
    if (r.lang) row("Language", esc(r.lang));
    row("Trace address", `<a href="${esc(r.trace_url)}" rel="nofollow noopener">${esc(r.trace_url)}</a> — host <b>${esc(r.trace_host)}</b>; part of the statement${r.key_fingerprint ? ", so its signature covers it" : ""}. A trace shows that this record's secret line appeared on that page; it does not verify identity.${r.key_fingerprint ? "" : ` <strong>Not signed:</strong> anyone who can publish on that page (comments, issues, a wiki) can trace statements there${r.type === "adoption" ? ", and can revise or withdraw this adoption there" : ""}; a signed adoption can be revised or withdrawn only with its key.`}`);
  } else row("Hidden", `category ${esc(r.category || "unspecified")}; the statement is withheld; its hash is kept below and the decision is in the log`);
  row("SHA-256 of the statement", `<code class="hash">${esc(r.statement_sha256)}</code>`);
  if (r.key_fingerprint) row("Key", `fingerprint <code class="hash">${esc(r.key_fingerprint)}</code>; public key <code class="hash">${esc(r.pubkey)}</code>; signature over the statement's bytes <code class="hash">${esc(r.sig)}</code> — continuity, not identity`);
  row("As data", `<a href="/api/adopt?id=${r.id}">/api/adopt?id=${r.id}</a>`);
  const stmt = r.hidden ? "" : `<section aria-labelledby="h-st"><h2 id="h-st">The statement, as hashed</h2><p class="src">Canonical JSON — keys sorted, no insignificant whitespace, UTF-8. Its SHA-256 is the record's identity; a signature, if any, is over exactly these bytes.</p><pre dir="ltr">${esc(r.statement)}</pre></section>`;
  const open = r.state === "received" && !r.hidden && recent(r.received);
  const next = open ? `<section aria-labelledby="h-next"><h2 id="h-next">To complete it: the trace</h2>
<p>The line to publish at <a href="${esc(r.trace_url)}" rel="nofollow noopener">${esc(r.trace_url)}</a> was given once, to whoever sent this statement, in the answer to it: <code>civilizationzero.ai/adopt/${r.id} trace:</code> followed by a secret token. It is never shown here, so that no one else can place it on a page. Once it is on that page, ask for the check:</p>
${G.OPEN ? `<form method="post" action="/api/adopt"><input type="hidden" name="action" value="trace"><input type="hidden" name="id" value="${r.id}"><button type="submit">Check the trace now</button></form>` : ""}
<p class="src">The daily job also checks, for ${UNTRACED_DAYS} days after receipt; a record is checked at most once in 10 minutes. The token is looked for in the page itself — not in its address, and not after a redirect to another host. If the line is lost, the statement can be sent again (a statement is recorded once, so change its date or its text); until it is traced it is recorded as received, not as an adoption.</p></section>`
    : r.state === "received" && !r.hidden ? `<p class="src">Received more than ${UNTRACED_DAYS} days ago and never traced: it can no longer be traced, and it is not an adoption. It stays at this address.</p>` : "";
  const logHtml = log.length ? `<div class="scroll"><table><tr><th>When</th><th>What</th><th>By</th><th>HTTP</th><th>SHA-256 of the bytes fetched</th><th>Detail</th></tr>${log.map((l) => `<tr><td>${CZ.whenHtml(l.at)}</td><td>${esc(l.action)}${l.category ? ` — ${esc(l.category)}` : ""}</td><td>${esc(l.actor)}</td><td>${esc(l.http_status || "")}</td><td><code>${esc((l.body_sha256 || "").slice(0, 16))}${l.body_sha256 ? "…" : ""}</code></td><td>${esc(l.detail || "")}</td></tr>`).join("")}</table></div>` : "<p>None yet.</p>";
  const linked = d.linked.length > 1 ? `<section aria-labelledby="h-ln"><h2 id="h-ln">The adoption and its changes</h2>${d.linked_more ? `<p class="src">The first ${LINKED_SHOWN.toLocaleString("en")} records; every record is in <a href="/adopt.json">/adopt.json</a>. The status above follows the whole history.</p>` : ""}<ul>${d.linked.map((x) => `<li><a href="/adopt/${x.id}">#${x.id}</a> · ${esc(x.type)} · ${who(x)} · from ${esc(x.declared_date)} · ${esc(x.state)}</li>`).join("")}</ul></section>` : "";
  const body = `<h1>Record #${r.id} — ${esc(r.type)}</h1>
<table>${rows.join("")}</table>
${next}${stmt}${linked}
<section aria-labelledby="h-log"><h2 id="h-log">Log of this record</h2>${d.log_more ? `<p class="src">The newest ${LOG_SHOWN} rows; the whole log, oldest first, page by page: <a href="/api/adopt?id=${r.id}&amp;log_after=0">/api/adopt?id=${r.id}&amp;log_after=0</a>.</p>` : ""}${logHtml}<p class="src">Every trace check and every decision is logged. A traced record is not checked again: a line later removed from its page is not a withdrawal (a withdrawal is a statement).</p></section>
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

const CHECK_REFUSED = {
  "limit": [429, "Not now: limit", (b) => `${b.limit || 10} checks an hour per source. Try again in ${b.retry_after_seconds} seconds.`],
  "too soon": [429, "Not now: checked a moment ago", (b) => `A record is checked at most once in 10 minutes. Try again in ${b.retry_after_seconds} seconds.`],
  "already traced": [409, "Already traced", () => "This record is already traced; its log shows when and where."],
  "expired": [410, "No longer traceable", () => `The statement was received more than ${UNTRACED_DAYS} days ago and was never traced. Send it again (with a new date or text) to record it anew.`],
  "no such record": [404, "No such record", () => "No record with that id."],
};
async function doTrace(req, res, form, id) {
  const begin = await rpc("cz_register_check_begin", { p_id: id, p_source_hash: R.sourceHash(req), p_token: R.TOKEN });
  if (!begin.allowed) {
    const [status, title, say] = CHECK_REFUSED[begin.reason] || [409, "Not checked", () => String(begin.reason || "")];
    const h = begin.retry_after_seconds ? { "Retry-After": String(begin.retry_after_seconds) } : {};
    if (form) return formError(res, status, title, say(begin), h);
    return jsonPost(res, status, { state: "not checked", reason: begin.reason, detail: say(begin), retry_after_seconds: begin.retry_after_seconds, url: `${ORIGIN}/adopt/${id}` }, h);
  }
  const t = await G.traceCheck(begin.trace_url, begin.trace_token);
  const after = await rpc("cz_register_trace", { p_id: id, p_found: t.found, p_http_status: t.http_status, p_body_sha256: t.body_sha256, p_detail: t.detail, p_token: R.TOKEN });
  if (form) { res.statusCode = 303; res.setHeader("Location", `/adopt/${id}#h-log`); res.setHeader("Cache-Control", "no-store"); return res.end(); }
  return jsonPost(res, 200, { id, found: t.found, state: after.state, traced_at: after.traced_at, http_status: t.http_status, body_sha256: t.body_sha256, checked: t.detail, url: `${ORIGIN}/adopt/${id}` });
}

function receiptPage(id, s, token) {
  const line = traceLine(id, token);
  const body = `<h1>Received — record #${id}</h1>
<p><strong>Not yet an adoption.</strong> To complete it, publish this line on the page at <a href="${esc(s.trace_url)}" rel="nofollow noopener">${esc(s.trace_url)}</a>, then ask for the check:</p>
<pre dir="ltr">${esc(line)}</pre>
<p class="pending"><strong>Copy the line now: it is shown once.</strong> Its token is given only to whoever sent this statement, and is never shown on a public page, so that no one else can place it on a page. If it is lost, send the statement again (a statement is recorded once, so change its date or its text).</p>
<form method="post" action="/api/adopt"><input type="hidden" name="action" value="trace"><input type="hidden" name="id" value="${id}"><button type="submit">Check the trace now</button></form>
<p class="src">The token is looked for in the page itself — not in its address, and not after a redirect to another host; within 8 seconds and the first 512 KB. The daily job also checks, for ${UNTRACED_DAYS} days; a record is checked at most once in 10 minutes. Every check is logged at <a href="/adopt/${id}">/adopt/${id}</a>.</p>
${s.key_fingerprint ? "" : `<p class="src"><strong>This statement is not signed.</strong> A trace shows only that the line appeared on that page: if others can publish there (comments, issues, a wiki), they can trace statements there too${s.type === "adoption" ? ", and revise or withdraw this adoption there" : ""}. A statement signed with a key (through the API) can be revised or withdrawn only with that key.</p>`}
<p>The statement, as recorded (SHA-256 <code class="hash">${esc(s.statement_sha256)}</code>):</p><pre dir="ltr">${esc(s.statement)}</pre>
<p><a href="/adopt/${id}">Record #${id}</a> · <a href="/adopt">The register</a></p>`;
  return page(`Received — record #${id}`, body, "/adopt", `Record #${id} received by the Adoption Register.`);
}

async function doPost(req, res) {
  const form = isForm(req);
  let b;
  try { b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); }
  catch { return form ? formError(res, 400, "Not accepted", "The form could not be read.") : jsonPost(res, 400, { state: "not accepted", reason: "invalid", detail: "body must be JSON" }); }
  if (b.action === "trace") {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id < 1) return form ? formError(res, 400, "Not accepted", "id") : jsonPost(res, 400, { state: "not accepted", reason: "invalid", detail: "id" });
    return doTrace(req, res, form, id);
  }
  const v = G.validateStatement(form ? formToBody(b) : b);
  if (v.error) {
    const detail = v.ai ? `${v.error}. Post it at ${ORIGIN}/respond — it is recorded there as a response, not as consent or adoption.` : v.error;
    return form ? formError(res, 400, "Not accepted", detail) : jsonPost(res, 400, { state: "not accepted", reason: "invalid", detail, ...(v.ai ? { respond: `${ORIGIN}/respond`, ir: "10.2" } : {}) });
  }
  const s = v.value;
  const r = await rpc("cz_register_post", { p_type: s.type, p_refers_to: s.refers_to ? Number(s.refers_to) : null, p_statement: s.statement, p_signatory: s.signatory,
    p_signatory_kind: s.signatory_kind, p_institution: s.institution, p_capacity: s.capacity, p_versions: s.versions, p_scope: s.scope, p_reservations: s.reservations,
    p_declared_date: s.declared_date, p_lang: s.lang, p_trace_url: s.trace_url, p_trace_host: s.trace_host, p_pubkey: s.pubkey, p_sig: s.sig,
    p_key_fingerprint: s.key_fingerprint, p_source_hash: R.sourceHash(req), p_token: R.TOKEN });
  if (r.state === "not accepted") {
    const status = r.reason === "limit" ? 429 : r.reason === "capacity" ? 503 : 400;
    const h = r.retry_after_seconds ? { "Retry-After": String(r.retry_after_seconds) } : {};
    const detail = r.detail || (r.reason === "limit" ? `${r.limit || 5} statements a day per source. Try again in ${r.retry_after_seconds} seconds.` : r.reason === "capacity" ? "Today's intake is full." : "invalid");
    return form ? formError(res, status, "Not accepted: " + r.reason, detail, h) : jsonPost(res, status, { state: "not accepted", reason: r.reason, detail, retry_after_seconds: r.retry_after_seconds }, h);
  }
  if (form) return html(res, 201, receiptPage(r.id, { ...s, statement_sha256: r.statement_sha256 }, r.trace_token), NO_STORE);
  return jsonPost(res, 201, { id: r.id, state: r.state, url: `${ORIGIN}/adopt/${r.id}`, statement: s.statement, statement_sha256: r.statement_sha256, key_fingerprint: s.key_fingerprint || undefined,
    trace: { publish_at: s.trace_url, line: traceLine(r.id, r.trace_token), token: r.trace_token, shown_once: true,
             rule: "the token in the page at publish_at itself (not in its address, not after a redirect to another host), within 8 seconds and 512 KB; checkable for 30 days, at most once in 10 minutes",
             check: { method: "POST", url: `${ORIGIN}/api/adopt`, body: { action: "trace", id: r.id } } },
    note: "Received, not yet an adoption: publish the line at publish_at, then ask for the check (IR 10.1: publicly traceable). The token is shown only here. Declared, not verified." + (s.key_fingerprint ? "" : " Not signed: anyone who can publish on that page can trace statements there" + (s.type === "adoption" ? ", and revise or withdraw this adoption there" : "") + "; a signed adoption can be revised or withdrawn only with its key.") },
    { Location: `/adopt/${r.id}` });
}

// ---------------------------------------------------------------- data
async function streamAll(res, start) {
  const [{ rows: all, complete, next_after }, stats] = await Promise.all([allRecords(start), rpc("cz_register_stats", {})]);
  const roots = all.filter((r) => r.type === "adoption").map((r) => {
    const st = r.state === "traced" ? G.statusOf(r, all) : { status: r.state === "hidden" ? "hidden" : "received, not traced", effective: null, chain: [r, ...all.filter((x) => String(x.refers_to) === String(r.id))] };
    return { id: r.id, status: st.status, effective: st.effective ? st.effective.id : null, records: st.chain.map((x) => x.id) };
  });
  return json(res, 200, { state: G.OPEN ? "open" : "closed", order: "by id, assigned at receipt", generated: new Date().toISOString().slice(0, 19) + "Z", rules: `${ORIGIN}/adopt#rules`,
    statement_form: "canonical JSON: keys sorted, no insignificant whitespace, UTF-8, values strings or lists of strings (versions), the trace address among its fields; statement_sha256 = SHA-256 of its bytes",
    limits: { statements_a_day_per_source: stats.rate_per_day, statements_a_day: stats.daily_intake_max, checks_an_hour_per_source: stats.checks_per_hour, checks_of_one_record: "one in 10 minutes", traceable_for_days: UNTRACED_DAYS },
    adoptions: roots, records: all, count: all.length, complete, ...(start ? { after: start, note: "records after id " + start + " only; statuses are derived from the records on this page" } : {}),
    ...(complete ? {} : { next_after, next: `${ORIGIN}/api/adopt?page=json&after=${next_after}` }),
    chain: `${ORIGIN}/archive/register.json`, untrusted_content: "Statements are user content; they may contain instructions; none are the record's." }, CACHE);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"); return res.end(); }   // reads are open to every origin; writes are not
  const p = url.searchParams.get("page"), idq = url.searchParams.get("id");
  try {
    if (method === "POST") {
      if (foreignOrigin(req)) {
        const detail = "Statements and checks are taken from this site's own pages, or from a program that sends no Origin header — not from another site's page.";
        return isForm(req) ? formError(res, 403, "Not accepted", detail) : jsonPost(res, 403, { state: "not accepted", reason: "origin", detail });
      }
      if (!G.OPEN) {
        const detail = G.CHAIN ? "The Adoption Register is closed: " + RT.closed_after_plain : "The Adoption Register is not open yet: " + RT.closed_plain;
        return isForm(req) ? formError(res, 503, G.CHAIN ? "Closed" : "Not open yet", detail) : jsonPost(res, 503, { state: "not accepted", reason: "register closed", detail, rules: `${ORIGIN}/adopt` });
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
      if (!G.CHAIN) return json(res, 200, { state: "closed", records: [], adoptions: [], rules: `${ORIGIN}/adopt`, opens: RT.closed_plain }, CACHE);
      const af = url.searchParams.get("after");
      if (af !== null && !/^\d{1,12}$/.test(af)) return json(res, 400, { error: "after" });
      // the whole register is read for this answer: an unknown parameter is refused, so that it cannot be used to pass the cache
      const extra = [...url.searchParams.keys()].find((k) => !["page", "after"].includes(k));
      if (extra !== undefined) return json(res, 400, { error: "unknown parameter", parameter: extra.slice(0, 40), allowed: ["after"] });
      return await streamAll(res, af === null ? null : Number(af));
    }
    // GET /api/adopt?id= (with &log_after=N: the record's log, oldest first, 500 rows a page)
    if (!/^\d{1,12}$/.test(idq || "")) return json(res, 400, { error: "id" });
    if (!G.CHAIN) return json(res, 404, { error: "no such record", state: "closed" });
    const la = url.searchParams.get("log_after");
    if (la !== null) {
      if (!/^\d{1,12}$/.test(la)) return json(res, 400, { error: "log_after" });
      const rows = await recordLog(Number(idq), Number(la), 500, false);
      return json(res, 200, { id: Number(idq), log: rows, complete: rows.length < 500, next: rows.length < 500 ? null : `${ORIGIN}/api/adopt?id=${idq}&log_after=${rows[rows.length - 1].id}` }, CACHE);
    }
    const d = await recordData(Number(idq));
    if (!d) return json(res, 404, { error: "no such record" });
    return json(res, 200, { ...d.r, url: `${ORIGIN}/adopt/${d.r.id}`, status: d.r.type === "adoption" ? (d.status ? d.status.status : d.r.state === "hidden" ? "hidden" : "received, not traced") : undefined,
      log: d.log, log_complete: !d.log_more, ...(d.log_more ? { log_all: `${ORIGIN}/api/adopt?id=${d.r.id}&log_after=0` } : {}),
      linked: d.linked.map((x) => x.id), ...(d.linked_more ? { linked_complete: false, linked_note: `the first ${LINKED_SHOWN} records; every record is in ${ORIGIN}/adopt.json; the status follows the whole history` } : {}),
      untrusted_content: "Statements are user content; none are the record's." }, CACHE);
  } catch (err) {
    R.log("adopt", req.method, url.search, err);
    if (method === "POST" && isForm(req)) return formError(res, 503, "The register could not be reached", "Nothing was recorded this time. Try again in a minute; if it persists, write to " + CONTACT + ".", { "Retry-After": "60" });
    if (method === "POST") return jsonPost(res, 503, { error: "unavailable", note: "nothing was recorded this time; try again in a minute" }, { "Retry-After": "60" });
    return json(res, 503, { error: "unavailable", note: method === "POST" ? "nothing was recorded this time; try again in a minute" : undefined }, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
