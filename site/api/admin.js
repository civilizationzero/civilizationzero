// The administrator's page, /admin (Blueprint §7.5: "a classifier flags; a human decides; both actions are logged publicly").
// Server-rendered forms, no script. One person signs in with the administrator's token (CZ_ADMIN_TOKEN). The session is a
// cookie signed under a key derived from that token (so rotating the token ends every session): HttpOnly, Secure,
// SameSite=Strict, 8 hours. Every action is a POST from this page — same origin, with a per-session CSRF token — and goes
// through the same database functions as POST /api/moderation, which log it publicly; a "keep" after a flag is logged too
// (moderation_reviews, schema v6f). The page shows what the public data already shows, plus the forms. No CORS, no cache,
// never indexed. The register's and the room's switches (open, closed) stay in the build, where a change is a reviewed commit.
"use strict";
const crypto = require("node:crypto");
const R = require("../room/lib.js");
const G = require("../room/register.js");
const { ORIGIN, CONTACT, esc, rpc, rest } = R;

const HIDE = ["harassment_or_threat", "private_person_exposure", "deceptive_impersonation", "advertising_spam", "resource_abuse"];
const REDACT = ["exposed_credentials", "private_data", "no_right_to_publish", "lawful_erasure"];
const NEVER = "disagreement, rejection of the record, hostility to the project, obscenity in quotation or evidence, discomfort";
const COOKIE = "__Host-cz_admin";
const MAX_AGE = 8 * 3600;
const failures = new Map();   // per source, in this instance: failed sign-ins (the token is 256 bits; this only slows a flood)
const DONE = { signed_in: "Signed in.", kept: "Kept — the decision is in the public log.", hidden: "Hidden — logged publicly.", unhidden: "Unhidden — logged publicly.",
  redacted: "Redacted — logged publicly.", unredacted: "Unredacted — logged publicly.", corrected: "Translation corrected — logged publicly.",
  register_hidden: "Register record hidden — logged in its log.", register_unhidden: "Register record unhidden — logged in its log." };

// ---------------------------------------------------------------- session and request checks
const key = () => crypto.createHmac("sha256", R.TOKEN).update("cz-admin-session-v1").digest();
const mac = (s) => crypto.createHmac("sha256", key()).update(s).digest("base64url");
function same(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}
function session(req) {
  if (!R.TOKEN) return null;
  const c = cookies(req)[COOKIE];
  if (!c || c.length > 512) return null;
  const [p, s, extra] = c.split(".");
  if (!p || !s || extra !== undefined || !same(s, mac(p))) return null;
  let v; try { v = JSON.parse(Buffer.from(p, "base64url").toString("utf8")); } catch { return null; }
  return v && typeof v.n === "string" && Number.isFinite(v.exp) && v.exp > Date.now() / 1000 ? v : null;
}
function newSession() {
  const p = Buffer.from(JSON.stringify({ n: crypto.randomBytes(18).toString("base64url"), exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  return `${COOKIE}=${p}.${mac(p)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}
const endSession = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
const csrfOf = (s) => mac("csrf:" + s.n);
// a form posted from this page carries this site's own origin (the site's Referrer-Policy is same-origin); anything else — another
// site, "null", a missing header — is refused before the session is even looked at
const sameOrigin = (req) => { const host = req.headers["x-forwarded-host"] || req.headers.host || ""; return !!host && req.headers.origin === `https://${host}`; };

// ---------------------------------------------------------------- output
function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}
const page = (title, body) => R.shell({ title: `${title} · Civilization Zero`, path: "/admin", description: "The administrator's page of civilizationzero.ai.",
  head: '<meta name="robots" content="noindex, nofollow">\n<style>.admin form{margin:.75rem 0}.admin fieldset{border:1px solid var(--rule);margin:1rem 0;padding:.5rem .75rem}.admin .row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:end}.admin .row label{flex:1 1 12rem}.admin .notice{border:2px solid var(--fg);padding:.5rem .75rem}.admin .content{white-space:pre-wrap;word-break:break-word;border-left:2px solid var(--rule);padding-left:.75rem}</style>\n',
  body: `<main class="admin">${body}</main>` });
const redirect = (res, to, headers = {}) => { res.statusCode = 303; res.setHeader("Location", to); res.setHeader("Cache-Control", "no-store"); for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(); };
const t = (x) => (x ? `<time datetime="${esc(R.isoTime(x))}">${esc(R.fmtTime(x))}</time>` : "—");
const opts = (list, sel) => list.map((c) => `<option value="${esc(c)}"${c === sel ? " selected" : ""}>${esc(c.replace(/_/g, " "))}</option>`).join("");
const hidden = (s) => `<input type="hidden" name="csrf" value="${esc(csrfOf(s))}">`;

function loginPage(message, status = 200) {
  return page("Administration", `<h1>Administration</h1>
${message ? `<p class="notice" role="alert">${esc(message)}</p>` : ""}
<p>For the administrator of civilizationzero.ai. Sign in with the administrator's token; it is checked against the hash kept in the database and is never stored here.</p>
<form class="respond" method="post" action="/admin"><input type="hidden" name="do" value="login">
<label>Administrator token <input type="password" name="token" autocomplete="current-password" required minlength="16" maxlength="512"></label>
<p><button type="submit">Sign in</button></p></form>
<p class="src">The session lasts 8 hours, in a cookie only this site can read. Every decision made here is logged publicly with its date, category, entry and written reason (<a href="/api/moderation">/api/moderation</a>); nothing done here is hidden from readers.</p>`);
}

// ---------------------------------------------------------------- the page
async function dashboard(s, notice, error) {
  const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  const [stats, budget, flags, recent, hiddenList, reviews, log, rstats] = await Promise.all([
    settle(rpc("cz_stats", {})), settle(rpc("cz_budget_status", {})), settle(rpc("cz_flags_open", {})),
    settle(rpc("cz_list", { p_after: null, p_before: 999999999999, p_limit: 15, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: true })),
    settle(rpc("cz_hidden", {})), settle(rest("moderation_reviews?select=id,at,flag_log_id,entry_id,reason&order=id.desc&limit=10")),
    settle(rest("moderation_log?select=id,at,entry_id,action,category,actor,reason&order=id.desc&limit=12")), settle(rpc("cz_register_stats", {}))]);
  const na = '<span class="pending">unavailable just now</span>';
  const st = stats.ok ? stats.v : null, bu = budget.ok ? budget.v : null, rs = rstats.ok ? rstats.v : null;
  const today = new Date().toISOString().slice(0, 10), now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
  const lastDay = st && st.last_log ? st.last_log.day : null;
  const chainLate = R.CHAIN && now.getUTCHours() >= 2 && lastDay && lastDay < yesterday;
  const cents = (c) => (c == null ? "—" : `USD ${(Number(c) / 100).toFixed(2)}`);
  const csrf = hidden(s);

  const status = `<section aria-labelledby="h-st"><h2 id="h-st">Status</h2><table>
<tr><th>The room</th><td>${R.OPEN ? "open" : R.CHAIN ? "closed to new entries (it opened before)" : "not open"}${st ? ` · ${st.entries} entries (${st.published} published, ${st.hidden} hidden, ${st.redacted} redacted) · today ${st.today} of ${st.daily_intake_max} · ${st.unclassified} not yet screened by the classifier` : ` · ${na}`}</td></tr>
<tr><th>Daily chain</th><td>${st ? (lastDay ? `last hashed day ${esc(lastDay)} (${st.last_log.count} entries)` : "no day hashed yet") : na}${chainLate ? ` <strong>— yesterday (${esc(yesterday)}) is not hashed yet: check the daily job's logs</strong>` : ""} · <a href="/archive/entries.json">the chain</a></td></tr>
<tr><th>Translation budget</th><td>${bu ? `${esc(bu.month || "")}: ${cents(bu.spent_cents)} of ${cents(bu.cap_cents)}` : na}</td></tr>
<tr><th>Adoption Register</th><td>${G.OPEN ? "open" : G.CHAIN ? "closed to new statements (it opened before)" : "not open (opening is a change in the build)"}${rs ? ` · ${rs.traced} traced, ${rs.received} received and not traced, ${rs.hidden} hidden` : ""} · <a href="/adopt">/adopt</a></td></tr>
<tr><th>Time</th><td>${esc(now.toISOString().slice(0, 16).replace("T", " "))} UTC</td></tr></table></section>`;

  let flagHtml;
  if (!flags.ok) flagHtml = `<p>${na}</p>`;
  else if (!flags.v.length) flagHtml = "<p>None. Every flag has a human decision.</p>";
  else flagHtml = flags.v.map((f) => `<fieldset><legend>Flag #${f.flag_id} on <a href="/discuss/${f.entry_id}">entry #${f.entry_id}</a></legend>
<p class="src">${t(f.flagged_at)} · ${esc((f.category || "").replace(/_/g, " "))} · score ${esc(f.classifier_score)} · ${esc(f.classifier_model || "")} (${esc(f.classifier_prompt || "")}) · by ${esc(f.author)} (declared ${esc(f.kind)}${f.lang ? `, ${esc(f.lang)}` : ""}), received ${t(f.received)}</p>
<div class="content" lang="${esc(f.lang || "")}">${esc(f.content || "")}</div>
<form class="respond" method="post" action="/admin">${csrf}<input type="hidden" name="do" value="decide"><input type="hidden" name="flag" value="${f.flag_id}"><input type="hidden" name="entry" value="${f.entry_id}">
<div class="row"><label>Decision <select name="decision"><option value="keep">keep — no ground applies</option><option value="hide">hide</option><option value="redact">redact</option></select></label>
<label>Category (for hide or redact) <select name="category"><option value="">—</option><optgroup label="hide">${opts(HIDE)}</optgroup><optgroup label="redact">${opts(REDACT)}</optgroup></select></label></div>
<label>Written reason (public) <input name="reason" required maxlength="2000"></label>
<label>For a redaction: the content with markers in place of what is removed <textarea name="redacted_text" maxlength="6000"></textarea></label>
<p><button type="submit">Decide</button></p></form></fieldset>`).join("");
  const flagsSec = `<section aria-labelledby="h-fl"><h2 id="h-fl">Flags awaiting a decision${flags.ok ? ` (${flags.v.length})` : ""}</h2>
<p class="src">Grounds for hiding: ${HIDE.map((c) => c.replace(/_/g, " ")).join(", ")}. For redaction: ${REDACT.map((c) => c.replace(/_/g, " ")).join(", ")}. Never grounds: ${NEVER} (Blueprint §7.5).</p>${flagHtml}</section>`;

  const act = `<section aria-labelledby="h-act"><h2 id="h-act">Act on an entry</h2>
<form class="respond" method="post" action="/admin">${csrf}<input type="hidden" name="do" value="act">
<div class="row"><label>Entry id <input name="id" inputmode="numeric" pattern="[0-9]{1,12}" required></label>
<label>Action <select name="action"><option value="hide">hide</option><option value="unhide">unhide</option><option value="redact">redact</option><option value="unredact">unredact</option></select></label>
<label>Category <select name="category"><option value="">— (unhide, unredact)</option><optgroup label="hide">${opts(HIDE)}</optgroup><optgroup label="redact">${opts(REDACT)}</optgroup></select></label></div>
<label>Written reason (public) <input name="reason" required maxlength="2000"></label>
<label>For a redaction: the content with markers in place of what is removed <textarea name="redacted_text" maxlength="6000"></textarea></label>
<p><button type="submit">Apply</button></p></form></section>`;

  const recentRows = recent.ok ? recent.v.map((e) => `<tr><td><a href="/discuss/${e.id}">#${e.id}</a></td><td>${t(e.received)}</td><td>${esc(e.state)}${e.category ? ` — ${esc(e.category)}` : ""}</td><td>${esc(e.author)} (${esc(e.kind)})</td><td>${esc(String(e.content || e.redacted_text || "").slice(0, 120))}${String(e.content || "").length > 120 ? "…" : ""}</td></tr>`).join("") : "";
  const recentSec = `<section aria-labelledby="h-re"><h2 id="h-re">Newest entries</h2>${recent.ok ? (recentRows ? `<div class="scroll"><table><tr><th>Id</th><th>Received</th><th>State</th><th>Declared author</th><th>Beginning</th></tr>${recentRows}</table></div>` : "<p>No entries yet.</p>") : `<p>${na}</p>`}</section>`;

  const hiddenSec = `<section aria-labelledby="h-hi"><h2 id="h-hi">Hidden and redacted</h2>${hiddenList.ok ? (hiddenList.v.length ? "<ul>" + hiddenList.v.map((h) => `<li><a href="/discuss/${h.id}">#${h.id}</a> — ${esc(h.state)}, ${esc(h.category || "")}, decided ${t(h.updated)}</li>`).join("") + "</ul>" : "<p>None.</p>") : `<p>${na}</p>`}<p class="src">To reverse a decision, use "Act on an entry" with unhide or unredact, and a reason.</p></section>`;

  const trSec = `<section aria-labelledby="h-tr"><h2 id="h-tr">Correct a machine translation</h2>
<form class="respond" method="post" action="/admin">${csrf}<input type="hidden" name="do" value="translation">
<div class="row"><label>Entry id <input name="id" inputmode="numeric" pattern="[0-9]{1,12}" required></label><label>Language (BCP 47) <input name="lang" required maxlength="35" placeholder="fa"></label></div>
<label>Corrected translation <textarea name="text" required maxlength="12000"></textarea></label>
<label>Written reason (public) <input name="reason" required maxlength="2000"></label>
<p><button type="submit">Save the correction</button></p></form></section>`;

  const regSec = `<section aria-labelledby="h-rg"><h2 id="h-rg">Adoption Register — hide or unhide a record</h2>
<form class="respond" method="post" action="/admin">${csrf}<input type="hidden" name="do" value="register">
<div class="row"><label>Record id <input name="id" inputmode="numeric" pattern="[0-9]{1,12}" required></label>
<label>Action <select name="action"><option value="hide">hide</option><option value="unhide">unhide</option></select></label>
<label>Category (hide) <select name="category"><option value="">— (unhide)</option>${opts(HIDE)}</select></label></div>
<label>Written reason (public) <input name="reason" required maxlength="2000"></label>
<p><button type="submit">Apply</button></p></form></section>`;

  const logRows = (log.ok ? log.v.map((l) => ({ at: l.at, text: `${l.action}${l.category ? ` — ${l.category}` : ""} · entry #${l.entry_id} · ${l.actor}${l.reason ? ` · ${String(l.reason).slice(0, 140)}` : ""}` })) : [])
    .concat(reviews.ok ? reviews.v.map((r) => ({ at: r.at, text: `keep after flag #${r.flag_log_id} · entry #${r.entry_id} · human · ${String(r.reason).slice(0, 140)}` })) : [])
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 15);
  const logSec = `<section aria-labelledby="h-lg"><h2 id="h-lg">Latest decisions and flags</h2>${logRows.length ? "<ul>" + logRows.map((l) => `<li>${t(l.at)} — ${esc(l.text)}</li>`).join("") + "</ul>" : "<p>None yet.</p>"}<p class="src">Everything here is public: <a href="/api/moderation">/api/moderation</a>.</p></section>`;

  const links = `<section aria-labelledby="h-ln"><h2 id="h-ln">Elsewhere</h2><ul>
<li>Checks and copies: <a href="https://github.com/civilizationzero/civilizationzero/actions">GitHub Actions</a> (verify-live, daily-archive, ots-upgrade, room-watch)</li>
<li>Search: <a href="https://search.google.com/search-console?resource_id=${encodeURIComponent(ORIGIN + "/")}">Google Search Console</a></li>
<li>Hosting and database: <a href="https://vercel.com/dashboard">Vercel</a> · <a href="https://supabase.com/dashboard">Supabase</a></li>
<li>Appeals and corrections arrive at <a href="mailto:${CONTACT}">${CONTACT}</a>: a receipt within 7 days, a written reason (§7.5)</li></ul></section>`;

  return page("Administration", `<h1>Administration</h1>
${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ""}${error ? `<p class="notice" role="alert"><strong>Not done:</strong> ${esc(error)}</p>` : ""}
<form method="post" action="/admin">${csrf}<input type="hidden" name="do" value="logout"><button type="submit">Sign out</button></form>
${status}${flagsSec}${act}${recentSec}${hiddenSec}${trSec}${regSec}${logSec}${links}`);
}

// ---------------------------------------------------------------- actions
const id12 = (v) => (/^\d{1,12}$/.test(String(v || "")) ? Number(v) : null);
const errText = (e) => { const m = String(e && e.message || ""); for (const k of ["no such entry", "no such record", "no such flag", "already decided", "already hidden", "not hidden", "a written reason is required"]) if (m.includes(k)) return k; return null; };

async function perform(b) {
  const reason = String(b.reason || "").trim().slice(0, 2000);
  if (!reason) return { error: "a written reason is required" };
  if (b.do === "decide") {
    const flag = id12(b.flag), entry = id12(b.entry), decision = String(b.decision || "");
    if (!flag || !entry) return { error: "the flag or the entry is missing" };
    if (decision === "keep") { await rpc("cz_review_keep", { p_flag: flag, p_reason: reason, p_token: R.TOKEN }); return { done: "kept", id: entry }; }
    return perform({ ...b, do: "act", id: entry, action: decision });
  }
  if (b.do === "act") {
    const id = id12(b.id), action = String(b.action || ""), category = String(b.category || "");
    if (!id) return { error: "an entry id" };
    if (!["hide", "unhide", "redact", "unredact"].includes(action)) return { error: "the action: hide, unhide, redact or unredact" };
    if (action === "hide" && !HIDE.includes(category)) return { error: "a hiding ground: " + HIDE.join(", ") };
    if (action === "redact" && !REDACT.includes(category)) return { error: "a redaction ground: " + REDACT.join(", ") };
    const text = typeof b.redacted_text === "string" ? b.redacted_text.replace(/\r\n/g, "\n") : "";
    if (action === "redact" && (text.length < 1 || text.length > 6000)) return { error: "the redacted content: the entry's text with markers in place of what is removed" };
    await rpc("cz_moderate", { p_entry: id, p_action: action, p_category: action === "hide" || action === "redact" ? category : null, p_reason: reason, p_redacted_text: action === "redact" ? text : null, p_token: R.TOKEN });
    return { done: { hide: "hidden", unhide: "unhidden", redact: "redacted", unredact: "unredacted" }[action], id };
  }
  if (b.do === "translation") {
    const id = id12(b.id), lang = String(b.lang || ""), text = typeof b.text === "string" ? b.text.replace(/\r\n/g, "\n") : "";
    if (!id) return { error: "an entry id" };
    if (!R.LANG_RE.test(lang) || lang.length > 35) return { error: "a BCP 47 language tag" };
    if (text.length < 1 || text.length > 12000) return { error: "the corrected translation" };
    await rpc("cz_translation_correct", { p_entry: id, p_lang: lang, p_text: text, p_reason: reason, p_token: R.TOKEN });
    return { done: "corrected", id };
  }
  if (b.do === "register") {
    const id = id12(b.id), action = String(b.action || ""), category = String(b.category || "");
    if (!id) return { error: "a record id" };
    if (!["hide", "unhide"].includes(action)) return { error: "the action: hide or unhide" };
    if (action === "hide" && !HIDE.includes(category)) return { error: "a hiding ground: " + HIDE.join(", ") };
    await rpc("cz_register_moderate", { p_id: id, p_action: action, p_category: action === "hide" ? category : null, p_reason: reason, p_token: R.TOKEN });
    return { done: action === "hide" ? "register_hidden" : "register_unhidden", id };
  }
  return { error: "unknown action" };
}

// Held back from production until the findings of its security review (29 Oct 2026) are fixed; previews serve it.
const IN_PRODUCTION = false;

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (process.env.VERCEL_ENV === "production" && !IN_PRODUCTION) {
    res.statusCode = 404; res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow"); return res.end("Not found\n");
  }
  try {
    if (!R.TOKEN) return send(res, 503, page("Administration", "<h1>Administration</h1><p>Not configured: the administrator's token is not set for this deployment.</p>"));
    if (method === "GET") {
      const s = session(req);
      if (!s) return send(res, 200, loginPage(""));
      const done = DONE[url.searchParams.get("done")] || "";
      const id = id12(url.searchParams.get("id"));
      return send(res, 200, await dashboard(s, done ? done + (id ? ` (#${id})` : "") : ""));
    }
    if (method !== "POST") return send(res, 405, page("Administration", "<h1>Method not allowed</h1>"), { Allow: "GET, HEAD, POST" });
    if (!sameOrigin(req)) return send(res, 403, page("Administration", "<h1>Not accepted</h1><p>This page takes forms only from itself.</p>"));
    let b; try { b = typeof req.body === "object" && req.body ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || ""))); } catch { b = {}; }
    if (b.do === "login") {
      const src = R.sourceHash(req);
      if ((failures.get(src) || 0) >= 10) return send(res, 429, loginPage("Too many failed attempts from this address. Try again later."), { "Retry-After": "900" });
      if (!R.tokenEquals(String(b.token || ""), R.TOKEN)) {
        failures.set(src, (failures.get(src) || 0) + 1);
        R.log("admin: failed sign-in");
        await new Promise((r) => setTimeout(r, 400));
        return send(res, 401, loginPage("That is not the administrator's token."));
      }
      failures.delete(src);
      return redirect(res, "/admin?done=signed_in", { "Set-Cookie": newSession() });
    }
    const s = session(req);
    if (!s) return send(res, 401, loginPage("The session has ended. Sign in again."));
    if (!same(String(b.csrf || ""), csrfOf(s))) return send(res, 403, page("Administration", '<h1>Not accepted</h1><p>The form is out of date. <a href="/admin">Reload the page</a> and try again.</p>'));
    if (b.do === "logout") return redirect(res, "/admin", { "Set-Cookie": endSession() });
    let r;
    try { r = await perform(b); }
    catch (e) { const known = errText(e); if (!known) throw e; r = { error: known }; }
    if (r.error) return send(res, 400, await dashboard(s, "", r.error));
    return redirect(res, `/admin?done=${r.done}${r.id ? `&id=${r.id}` : ""}`);
  } catch (err) {
    R.log("admin", req.method, err);
    return send(res, 503, page("Administration", '<h1>Unavailable</h1><p>The database could not be reached; nothing was changed by this request unless the public log shows it. <a href="/admin">Try again</a>.</p>'), { "Retry-After": "30" });
  }
};
