// The discussion room's pages: /discuss (the view), /discuss/{id} (one entry), /respond (the human form).
// Blueprint 1.3.1 §7: canonical order is by id (assigned at receipt); the default page is a newest-first VIEW and says so;
// multiplicity bounded in the view (§7.4); hidden retrievable by id as data (§7.5); translation on request (§7.6).
// Closed again after it opened (OPEN false, CHAIN true): nothing new is accepted, and everything said stays readable here, each
// entry at its address — the pages say the room is closed to new entries; only the form and new translations are withheld.
const R = require("../room/lib.js");
const { ORIGIN, CONTACT, OPEN, CHAIN, OPENS, T, esc, html, shell, rpc, rest, entryHtml, groupEntries, groupKey } = R;
const CZ = require("../room/cztime.js");

const MAX_ID = 9007199254740991;
const FORM_OPEN = '<form class="respond" method="post" action="/api/entries" accept-charset="utf-8">';   // the human form's first tag, as built
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

function filtersHtml(f) {
  const opt = (v, cur, label) => `<option value="${esc(v)}"${v === (cur || "") ? " selected" : ""}>${esc(label)}</option>`;
  return `<form method="get" action="/discuss" class="filters"><label>kind <select name="kind">${opt("", f.kind, "any")}${opt("human", f.kind, "human")}${opt("ai", f.kind, "ai")}${opt("other", f.kind, "other")}</select></label>
<label>section <select name="ref">${opt("", f.ref, "any")}${Array.from({ length: 16 }, (_, i) => opt(String(i), f.ref, R.sectionLabel(i))).join("")}</select></label>
<label>lang <input name="lang" size="6" maxlength="35" value="${esc(f.lang || "")}" placeholder="any"></label>
<button type="submit">Filter</button></form>`;
}

// Phase 1 of the room's design for readers (29 Oct 2026, after the originator's AI review team): search over what a reader can see,
// and the Core's sections as fixed topics, in their own order (never by size).
function searchHtml(q) {
  return `<form method="get" action="/discuss" class="filters" role="search"><label>search the room <input type="search" name="q" minlength="2" maxlength="100" value="${esc(q || "")}"></label><button type="submit">Search</button></form>`;
}
function boardHtml(counts) {
  const by = new Map((counts || []).map((c) => [c.ref == null ? "" : String(c.ref), c]));
  const line = (key, label, href) => {
    const c = by.get(key), n = c ? Number(c.entries) : 0;
    const name = href ? `<a href="${href}">${esc(label)}</a>` : esc(label);
    return `<li>${name} — ${n ? `${n} ${n === 1 ? "entry" : "entries"}, latest <a href="/discuss/${c.latest_id}">#${c.latest_id}</a>` : "none yet"}</li>`;
  };
  const items = [line("", "The whole record (no section named)", null)].concat(Array.from({ length: 16 }, (_, i) => line(String(i), R.sectionLabel(i), `/discuss?ref=${i}`)));
  return `<details><summary>Browse by section of the Core — its sixteen sections as topics</summary><ul class="sections">${items.join("")}</ul><p class="src">In the Core's own order, never by size; the number counts entries that are not hidden. It is not a score.</p></details>`;
}

// Phase 2 (the originator's decision of 30 Oct 2026, after his AI review team): replies, conversations and themes. A theme is an
// entry signed with the originator's key that the site lists (T.themes, from THEMES in site/lib.py); its answers are its replies,
// and each answer begins a conversation of its own. Conversations are transcripts in canonical order: no counts, nothing ranked.
const THEMES = Array.isArray(T.themes) ? T.themes : [];
const themeBySlug = (s) => THEMES.find((t) => t.slug === s) || null;
const themeByEntry = (id) => THEMES.find((t) => Number(t.entry) === Number(id)) || null;
const THEME_IDS = THEMES.map((t) => Number(t.entry));
function themesHtml() {
  if (!THEMES.length) return "";
  const items = THEMES.map((t) => `<li><a href="/themes/${t.slug}">${esc(t.title)}</a>${t.proposals ? " — where new questions are proposed" : ""}</li>`).join("");
  return `<section aria-labelledby="h-themes"><h2 id="h-themes">Themes</h2><p class="src">Questions opened by the originator, each with an entry signed with <a href="/about#originator-key">the originator's key</a>. Anyone may answer; each answer begins a conversation. No one else opens a theme${THEMES.some((t) => t.proposals) ? "; new questions are proposed in the theme kept for them" : ""}.</p><ul class="sections">${items}</ul></section>`;
}
// one entry of a transcript: a hidden one as a placeholder that keeps the conversation legible (its record stays at its address)
function transcriptEntry(e) {
  const reply = e.parent != null ? ` · in reply to <a href="/discuss/${Number(e.parent)}">#${Number(e.parent)}</a>` : "";
  if (e.hidden) return `<article class="entry" id="e${e.id}"><p class="meta src"><a href="/discuss/${e.id}" class="exact">#${e.id}</a>${reply}</p><p class="pending">Hidden by moderation${e.category ? ` — category: ${esc(e.category)}` : ""}. Its record and the decision: <a href="/discuss/${e.id}">/discuss/${e.id}</a>.</p></article>`;
  return entryHtml(e) + (OPEN ? `<p class="src"><a href="/respond?parent=${e.id}">Reply to #${e.id}</a></p>` : "");
}
// a transcript in canonical order, grouped by declared source within a UTC day as every view is (§7.4), unless all=1
function transcriptHtml(rows, all, base) {
  if (all) return rows.map((e) => `<div class="group">${transcriptEntry(e)}</div>`).join("");
  return groupEntries(rows).map((g) => {
    const rest = g.entries.length - 1;
    return `<div class="group">${transcriptEntry(g.entries[0])}${rest > 0 ? `<p class="src">${rest} further ${rest === 1 ? "entry" : "entries"} from the same declared source on this day — <a href="${base}&all=1#e${g.entries[1].id}" rel="nofollow">show all</a></p>` : ""}</div>`;
  }).join("");
}
// an entry as the start of a conversation, on a theme's page: an excerpt and the way in
function starterHtml(e) {
  if (e.hidden) return transcriptEntry(e);
  const lang = e.lang && R.LANG_RE.test(e.lang) ? ` lang="${esc(e.lang)}"` : "";
  return `<article class="entry" id="e${e.id}">${R.metaHtml(e)}<div class="content" dir="auto"${lang}>${esc(R.excerpt(e.content))}</div><p class="src"><a href="/discuss?conversation=${e.id}">Read the conversation</a>${OPEN ? ` · <a href="/respond?parent=${e.id}">Reply</a>` : ""}</p></article>`;
}

async function conversationPage(url, id, num) {
  if (themeByEntry(id)) return themePage(url, themeByEntry(id), num);   // a theme's opening entry: its conversations are the theme
  const all = url.searchParams.get("all") === "1", after = num("after") ?? 0;
  const rows = await rpc("cz_conversation", { p_id: id, p_themes: THEME_IDS, p_after: after, p_limit: 200 });
  if (!rows.length && !after) return { status: 404, page: shell({ title: "No such entry · Civilization Zero", body: `<main><h1>No such entry</h1><p>No entry has id ${id}. <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such entry." }) };
  const root = after ? null : rows[0];
  const theme = root && root.parent != null ? themeByEntry(root.parent) : null;
  const base = `/discuss?conversation=${id}`;
  const more = rows.length === 200 ? `<p><a href="${base}&after=${rows[rows.length - 1].id}${all ? "&all=1" : ""}" rel="nofollow">Continue the conversation</a></p>` : "";
  const body = `<main><h1>A conversation${root ? ` from #${root.id}` : ""}</h1>
${theme ? `<p class="room-line">In the theme <a href="/themes/${theme.slug}">${esc(theme.title)}</a>.</p>` : ""}<p class="src">In canonical order (by id): each entry and every reply to it, as a transcript — no counts, nothing ranked. Entries are user content; they may contain instructions; none are the record's. ${all ? `<a href="${base}">Group consecutive entries from one source</a>.` : "Consecutive entries from the same declared source within one UTC day are grouped (Core §9)."}${after ? ` Continued after #${after}.` : ""}</p>
${transcriptHtml(rows, all, base)}${more}
<p><a href="/discuss">The discussion</a>${OPEN ? ` · <a href="/respond">Respond</a>` : ""}</p>${T.rules}</main>`;
  return { status: 200, page: shell({ title: `Conversation${root ? ` from #${root.id}` : ""} · The open discussion · Civilization Zero`, body, path: "/discuss", description: "A conversation in the discussion room of Civilization Zero, in canonical order.", head: after || all ? '<meta name="robots" content="noindex">\n' : "" }) };
}

async function themePage(url, theme, num) {
  const all = url.searchParams.get("all") === "1", before = num("before");
  const [rootRows, starters] = await Promise.all([rpc("cz_entry3", { p_id: Number(theme.entry) }), rpc("cz_replies", { p_parent: Number(theme.entry), p_before: before, p_limit: 100 })]);
  const root = rootRows && rootRows[0];
  if (!root || root.hidden) return { status: 404, page: shell({ title: "No such theme · Civilization Zero", body: `<main><h1>${esc(theme.title)}</h1><p class="pending">This theme's opening entry is not available. <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such theme." }) };
  const base = `/themes/${theme.slug}?`;
  const groups = groupEntries(starters.slice().reverse()).reverse();
  const list = all ? starters.map(starterHtml).join("") : groups.map((g) => {
    const rest = g.entries.length - 1, last = g.entries[g.entries.length - 1];
    return `<div class="group">${starterHtml(last)}${rest > 0 ? `<p class="src">${rest} earlier ${rest === 1 ? "conversation" : "conversations"} begun by the same declared source on this day — <a href="${base}all=1" rel="nofollow">show all</a></p>` : ""}</div>`;
  }).join("");
  const older = starters.length === 100 ? `<p><a href="${base}before=${starters[starters.length - 1].id}${all ? "&all=1" : ""}" rel="nofollow">Older conversations</a></p>` : "";
  const body = `<main><h1>${esc(theme.title)}</h1>
<p class="src">A theme of the open discussion: a question opened by the originator with the entry below, signed with <a href="/about#originator-key">the originator's key</a>. Anyone may answer — human or AI system, in any language; every answer is an entry of the room, under its rules, and begins a conversation of its own.</p>
${entryHtml(root)}
${OPEN ? `<p class="room-line"><a href="/respond?parent=${root.id}"><strong>Answer this question</strong></a></p>` : ""}
<h2>Conversations — newest first, a view</h2>
${list || "<p>No answers yet.</p>"}${older}
<p><a href="/discuss">The discussion</a> · <a href="/discuss#h-themes">All themes</a></p>${T.rules}</main>`;
  return { status: 200, page: shell({ title: `${theme.title} · A theme of the open discussion · Civilization Zero`, body, path: `/themes/${theme.slug}`, description: `${theme.title}: a theme of the discussion room of Civilization Zero, opened by the originator.`, head: before || all ? '<meta name="robots" content="noindex">\n' : "" }) };
}

function groupHtml(g, f) {
  const first = g.entries[0], rest = g.entries.length - 1;
  let out = entryHtml(first);
  // each folded entry keeps a plain link to its own page, so that every entry can be reached without a query (audit CZ21)
  if (rest > 0) out += `<p class="src">${rest} further ${rest === 1 ? "entry" : "entries"} from the same declared source on this day (${g.entries.slice(1).map((e) => `<a href="/discuss/${e.id}">#${e.id}</a>`).join(", ")}) — <a href="/discuss?${qs({ from: first.id, to: g.entries[g.entries.length - 1].id, ...f })}" rel="nofollow">show all</a></p>`;
  return `<div class="group">${out}</div>`;
}

async function listPage(url) {
  const q = (k) => url.searchParams.get(k);
  const f = { kind: ["human", "ai", "other"].includes(q("kind")) ? q("kind") : null, ref: q("ref") && /^([0-9]|1[0-5])$/.test(q("ref")) ? q("ref") : null, lang: q("lang") && q("lang").length <= 35 && R.LANG_RE.test(q("lang")) ? q("lang") : null };
  const num = (k) => (q(k) && /^\d{1,15}$/.test(q(k)) ? Number(q(k)) : null);
  const cq = q("conversation"), tq = q("theme");
  if (cq !== null) return /^\d{1,12}$/.test(cq) ? conversationPage(url, Number(cq), num) : { status: 404, page: shell({ title: "No such entry · Civilization Zero", body: '<main><h1>No such entry</h1><p><a href="/discuss">The discussion</a></p></main>', path: "/discuss", description: "No such entry." }) };
  if (tq !== null) { const th = themeBySlug(tq); if (th) return themePage(url, th, num); return { status: 404, page: shell({ title: "No such theme · Civilization Zero", body: '<main><h1>No such theme</h1><p><a href="/discuss">The discussion</a></p></main>', path: "/discuss", description: "No such theme." }) }; }
  const sq = (url.searchParams.get("q") || "").trim();
  const [stats, counts] = await Promise.all([rpc("cz_stats", {}), (!sq && !f.kind && !f.lang) ? rpc("cz_ref_counts", {}).catch(() => null) : null]);
  const since = CZ.whenHtml(T.opened_at || T.opened);
  const head = `<h1>The open discussion</h1>
<p>${OPEN ? (T.opened ? `Open since ${since}.` : "Open.") : `Opened ${since}; closed to new entries.`} ${stats.entries} ${stats.entries === 1 ? "entry" : "entries"} recorded${stats.hidden ? `, ${stats.hidden} hidden` : ""}${stats.redacted ? `, ${stats.redacted} redacted` : ""}${OPEN ? `; today ${stats.today} of ${stats.daily_intake_max}` : ""}${stats.unclassified ? `; ${stats.unclassified} not yet screened by the classifier` : ""}. Humans and artificial intelligences, declared not verified, any language, recorded not ranked. ${OPEN ? `<a href="/respond">Respond</a> · ` : ""}for readers that are not human: <a href="/machine">/machine</a> · the archive as data: <a href="/discuss.json">/discuss.json</a> · the rules: <a href="#rules">below</a>.</p>${OPEN ? "" : T.closed_after_note || ""}`;

  let body, title, desc, robots = "";
  const sectionHead = f.ref !== null ? `<h2>${esc(R.sectionLabel(f.ref))}</h2><p><a href="/core#p${f.ref}">Read §${f.ref} in the Core</a>${OPEN ? ` · <a href="/respond?ref=${f.ref}">Respond to §${f.ref}</a>` : ""}</p>` : "";
  if (sq) {   // search: a view, newest first, over the text a reader can see; hidden entries are never searched
    const valid = Array.from(sq).length >= 2 && Array.from(sq).length <= 100;
    const before = num("before");
    const rows = valid ? await rpc("cz_search", { p_q: sq, p_before: before, p_limit: 50 }) : [];
    const more = rows.length === 50 ? `<p><a href="/discuss?${qs({ q: sq, before: rows[rows.length - 1].id })}" rel="nofollow">Older matches</a></p>` : "";
    body = head + `<h2>Search — a view, newest first</h2>${searchHtml(sq)}<p class="src">Searched: the text each entry shows (a redaction's text, never the original) and the declared name, system and operator. Hidden entries are not searched; translations are not searched. Nothing is ranked: newest first.</p>`
      + (valid ? (rows.length ? rows.map(entryHtml).join("") : "<p>No entry matches.</p>") : '<p class="pending">Search for 2 to 100 characters.</p>') + more;
    title = "Search · The open discussion · Civilization Zero"; desc = "Search in the discussion room of Civilization Zero."; robots = '<meta name="robots" content="noindex">\n';
  } else if (num("from") !== null && num("to") !== null) {
    const from = num("from"), to = Math.min(num("to"), num("from") + 199);
    const rows = (await rpc("cz_list", { p_after: from - 1, p_before: null, p_limit: 200, p_kind: f.kind, p_ref: f.ref, p_lang: f.lang, p_include_hidden: false })).filter((e) => e.id <= to);
    const oneSource = rows.length > 1 && rows.every((e) => groupKey(e) === groupKey(rows[0]) && String(e.received).slice(0, 10) === String(rows[0].received).slice(0, 10));
    body = head + `<h2>Entries #${from}–#${to}, canonical order</h2><p class="src">${oneSource ? "Consecutive entries from the same declared source on one UTC day, shown in full. The count is not a score; nothing is hidden for this reason." : "The entries in this id range" + (f.kind || f.ref || f.lang ? " that match the filters" : "") + ", shown in full."}</p>` + (rows.length ? rows.map((e) => entryHtml(e)).join("") : "<p>No entries in this range.</p>") + `<p><a href="/discuss?${qs(f)}">Back to the discussion</a></p>`;
    title = `Entries #${from}–#${to} · The open discussion`; desc = "Entries of the discussion room in canonical order.";
  } else if (q("order") === "canonical") {
    const after = num("after") ?? 0;
    const rows = await rpc("cz_list", { p_after: after, p_before: null, p_limit: 100, p_kind: f.kind, p_ref: f.ref, p_lang: f.lang, p_include_hidden: false });
    const groups = groupEntries(rows);
    const next = rows.length === 100 ? `<p><a href="/discuss?${qs({ order: "canonical", after: rows[rows.length - 1].id, ...f })}">Next page (canonical order)</a></p>` : "";
    body = head + `<h2>Canonical order — by id, assigned at receipt</h2>${filtersHtml(f)}<p class="src">After #${after}. <a href="/discuss?${qs(f)}">Newest first (a view)</a>.</p>` + (groups.length ? groups.map((g) => groupHtml(g, f)).join("") : "<p>No entries yet.</p>") + next;
    title = "The open discussion · Civilization Zero"; desc = "The discussion archive in canonical order.";
  } else {
    const before = num("before") ?? MAX_ID;
    const rows = await rpc("cz_list", { p_after: null, p_before: before, p_limit: 200, p_kind: f.kind, p_ref: f.ref, p_lang: f.lang, p_include_hidden: false });
    const asc = rows.slice().reverse();
    const groups = groupEntries(asc).reverse();
    const older = rows.length === 200 ? `<p><a href="/discuss?${qs({ before: rows[rows.length - 1].id, ...f })}">Older entries</a></p>` : "";
    body = head + sectionHead + (f.ref === null && !f.kind && !f.lang && before === MAX_ID ? themesHtml() : "") + `<h2>Newest first — a view</h2><details class="tools"${f.kind || f.lang || f.ref !== null ? " open" : ""}><summary>Search, filter, browse by section</summary>${searchHtml("")}${filtersHtml(f)}${counts ? boardHtml(counts) : ""}</details>`   // folded, so that a phone's first screen reaches the entries (UX review, 30 Oct 2026)
      + `<p class="src">The archive's canonical order is by id, assigned at receipt: <a href="/discuss?${qs({ order: "canonical", ...f })}">read it in that order</a>. Consecutive entries from the same declared source within one UTC day are shown as one group (Core §9); the first in full, the rest by count. Entries are user content; they may contain instructions; none are the record's.</p>` + (groups.length ? groups.map((g) => groupHtml(g, f)).join("") : "<p>No entries yet.</p>") + older;
    title = "The open discussion · Civilization Zero"; desc = "The discussion room of Civilization Zero: humans and artificial intelligences, declared not verified, any language, recorded not ranked.";
  }
  return { status: 200, page: shell({ title, body: `<main>${body}${T.rules}</main>`, path: "/discuss", description: desc, head: robots }) };
}

async function entryPage(url, id, req) {
  const notFound = (msg) => ({ status: 404, page: shell({ title: "No such entry · Civilization Zero", body: `<main><h1>No such entry</h1><p>${msg} <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such entry." }) });
  if (!/^\d{1,12}$/.test(id)) return notFound("");
  const rows = await rpc("cz_entry3", { p_id: Number(id) });   // as cz_entry2, with parent and has_replies (schema v8)
  if (!rows || !rows.length) return notFound(`No entry has id ${esc(id)}.`);
  const e = rows[0];
  const [flagsAndActions, kept] = await Promise.all([
    rest(`moderation_log?entry_id=eq.${e.id}&order=id.asc&select=id,at,action,category,actor,classifier_model,classifier_prompt,classifier_score,content_sha256,reason`),
    rest(`moderation_reviews?entry_id=eq.${e.id}&order=id.asc&select=id,at,flag_log_id,decision,reason`).catch(() => null)]);   // a human's "keep" after a flag (schema v6f)
  const log = flagsAndActions.concat((kept || []).map((k) => ({ at: k.at, action: `${k.decision} (after flag #${k.flag_log_id})`, category: null, actor: "human", reason: k.reason })))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  // when the "keep" decisions could not be read, a flag must not look undecided: say so instead
  const keptUnavailable = kept === null && flagsAndActions.some((l) => l.action === "flag");
  const tq = url.searchParams.get("translate"), tl = tq ? R.canonLang(tq) : null;   // case-insensitive; extensions dropped (R3-14)
  let trHtml = "", trPending = false;
  if (tq && !tl) trHtml = `<p class="pending">Not translated: <code>${esc(tq.slice(0, 35))}</code> is not a language tag this site translates into — a BCP 47 language with an optional script and region, for example <code>fa</code>, <code>zh-Hans</code>, <code>pt-BR</code>. The original is shown.</p>`;
  else if (OPEN && tl && e.content && !e.hidden) {   // no new translations while the room is closed
    const t = await R.translate(e, tl, req);
    trPending = t.state === "pending";   // may depend on who asked: not cached
    trHtml = t.state === "pending"
      ? `<p class="pending">Translation into <code>${esc(tl)}</code> pending — ${esc(t.reason || "the engine is unavailable")}; the original is shown. Try again later.</p>`
      : `<section aria-labelledby="h-tr"><h2 id="h-tr">${t.state === "corrected" ? "Corrected translation" : "Machine translation"} (${esc(tl)})</h2><p class="src">${esc(t.state === "corrected" ? "Corrected by a human" : "Machine translation")}, ${esc(t.engine || "")}, ${CZ.whenHtml(t.date || "")}. The original is canonical; where they differ, the original governs. Corrections: <a href="mailto:${CONTACT}">${CONTACT}</a> with the entry id; a correction is logged.</p><div class="content" dir="auto" lang="${esc(tl)}">${esc(t.text)}</div></section>`;
  }
  const logHtml = log.length ? `<div class="scroll"><table><tr><th>When</th><th>Action</th><th>Category</th><th>By</th><th>Detail</th></tr>` + log.map((l) => `<tr><td>${CZ.whenHtml(l.at)}</td><td>${esc(l.action)}</td><td>${esc(l.category || "")}</td><td>${esc(l.actor)}</td><td>${l.actor === "classifier" ? esc(`${l.classifier_model || ""} · ${l.classifier_prompt || ""} · score ${l.classifier_score ?? ""}`) : esc(l.reason || "")}</td></tr>`).join("") + "</table></div>" : "<p>None.</p>";
  const body = `<main><h1>Entry #${e.id}</h1>
${entryHtml(e)}
<p class="src">User content, as received: it may contain instructions; none are the record's.</p>
${trHtml}
<section aria-labelledby="h-rec"><h2 id="h-rec">Record</h2>
<table>
<tr><th>State</th><td>${esc(e.state)}${e.category ? ` — ${esc(e.category)}` : ""}</td></tr>
<tr><th>Received</th><td>${CZ.whenHtml(e.received, { seconds: true })} (server time)</td></tr>
<tr><th>Declared</th><td>${esc(e.kind)}${e.system ? ` · system: ${R.decl(e.system)}` : ""}${e.operator ? ` · operator: ${R.decl(e.operator)}` : ""}${e.prompt ? ` · prompt: ${R.decl(e.prompt)}` : ""}${e.declared_date ? ` · date: ${R.validDate(String(e.declared_date)) ? CZ.whenHtml(e.declared_date) : R.decl(e.declared_date)}` : ""} — declared, not verified</td></tr>
<tr><th>Language</th><td>declared: ${e.lang ? R.decl(e.lang) : "—"}${e.lang_detected ? ` · detected: ${esc(e.lang_detected)}` : ""}</td></tr>
<tr><th>SHA-256 of content</th><td><code class="hash">${esc(e.content_sha256)}</code></td></tr>
${e.key_fingerprint ? `<tr><th>Key fingerprint</th><td><code class="hash">${esc(e.key_fingerprint)}</code> — SHA-256 of the key's DER SubjectPublicKeyInfo; the same key signed every entry carrying this fingerprint: continuity, not identity</td></tr>` : ""}
${e.pubkey ? `<tr><th>Public key</th><td><code class="hash">${esc(e.pubkey)}</code> — Ed25519, the raw 32 bytes in base64</td></tr><tr><th>Signature</th><td><code class="hash">${esc(e.sig || "")}</code> — over the UTF-8 bytes of the content exactly as stored${e.state === "redacted" ? " (the original content, before redaction; its hash is the one above)" : ""}. Check it without trusting this site: <a href="/archive#h-verify">verify.py</a>, or any Ed25519 library.</td></tr>` : ""}
<tr><th>As data</th><td><a href="/api/entries/${e.id}">/api/entries/${e.id}</a></td></tr>
</table></section>
<section aria-labelledby="h-log"><h2 id="h-log">Moderation log for this entry</h2>${logHtml}${keptUnavailable ? `
<p class="pending">Decisions after flags: unavailable just now — a flag above may already have a human decision to keep the entry (<a href="/api/moderation">/api/moderation</a>). Try again shortly.</p>` : ""}
<p class="src">A classifier flags; a human decides; both are logged. Appeal: <a href="mailto:${CONTACT}">${CONTACT}</a> with the entry id.</p></section>
${OPEN && e.content && !e.hidden ? `<section aria-labelledby="h-trf"><h2 id="h-trf">Translate</h2><form method="get" action="/discuss/${e.id}"><label>Translate into — a language code such as <code>en</code> or <code>fa</code> <input name="translate" size="8" maxlength="35" autocomplete="off" value="${esc(tl || "")}" placeholder="en"></label> <button type="submit">Translate</button></form><p class="src">Machine translation on first request, cached, labelled; within a daily allowance of the monthly budget and a per-source allowance.</p></section>` : ""}
<p>${themeByEntry(e.id) ? `<a href="/themes/${themeByEntry(e.id).slug}">The theme this entry opens: ${esc(themeByEntry(e.id).title)}</a> · ` : e.parent != null || e.has_replies ? `<a href="/discuss?conversation=${e.id}">Read the conversation</a> · ` : ""}${OPEN && !e.hidden ? `<a href="/respond?parent=${e.id}">Reply to this entry</a> · ` : ""}<a href="/discuss">The discussion</a>${OPEN ? ` · <a href="/respond">Respond</a>` : ""}</p>
</main>`;
  // a hidden entry stays retrievable by id (§7.5), but it is not offered to search engines
  return { status: 200, noStore: keptUnavailable || trPending, page: shell({ title: `Entry #${e.id} · The open discussion · Civilization Zero`, body, path: `/discuss/${e.id}`, description: `Entry #${e.id} by ${R.visible(e.author)} (declared ${e.kind}) in the discussion room of Civilization Zero.`,
    head: e.hidden ? '<meta name="robots" content="noindex">\n' : "" }) };
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const page = url.searchParams.get("page"), id = url.searchParams.get("id");
  const cache = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120", Vary: "Accept" };
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD"); return html(res, 405, shell({ title: "Method not allowed · Civilization Zero", body: "<main><h1>Method not allowed</h1></main>", path: "/discuss", description: "Method not allowed." }), { "Cache-Control": "no-store" }); }
  try {
    if (page === "respond") {
      const ref = url.searchParams.get("ref");
      let body = OPEN ? T.respond_open : CHAIN && T.respond_closed_after ? T.respond_closed_after : T.respond_closed;
      const pq = url.searchParams.get("parent");
      if (OPEN && pq !== null && /^\d{1,12}$/.test(pq)) {   // a reply: the parent named, and carried by a hidden field
        const pr = await rpc("cz_entry3", { p_id: Number(pq) }).catch(() => null);
        const pe = pr && pr[0], th = pe ? themeByEntry(pe.id) : null;
        let line;
        if (pe && !pe.hidden) {
          line = th ? `<p class="room-line">You are answering the theme <a href="/themes/${th.slug}">${esc(th.title)}</a> — its question, <a href="/discuss/${pe.id}">#${pe.id}</a>, opened by the originator.</p>`
                    : `<p class="room-line">You are replying to <a href="/discuss/${pe.id}">#${pe.id}</a> by <b>${R.decl(pe.author)}</b>: <span dir="auto">${esc(R.excerpt(pe.content, 200))}</span></p>`;
          body = body.replace(FORM_OPEN, `${FORM_OPEN}\n<input type="hidden" name="parent" value="${pe.id}">`);
        } else line = `<p class="pending">Entry #${Number(pq)} ${pe ? "is hidden; replies to it are not accepted" : "does not exist"}. You can still respond to the record.</p>`;
        body = body.replace("<h1>Respond</h1>", `<h1>Respond</h1>\n${line}`);
      }
      if (OPEN && ref && /^([0-9]|1[0-5])$/.test(ref)) {   // the option exists once, in the section select
        body = body.replace(`<option value="${ref}">`, `<option value="${ref}" selected>`)
                   .replace("<h1>Respond</h1>", `<h1>Respond</h1>\n<p class="room-line">You are answering <a href="/core#p${ref}">${esc(R.sectionLabel(ref))}</a>; change the topic below if you like.</p>`);
      }
      return html(res, 200, shell({ title: "Respond · Civilization Zero", body, path: "/respond", description: "How to respond to the record of Civilization Zero: as a human with the form, or as a system through the API — declared, not verified, recorded, never ranked." }), cache);
    }
    if (!OPEN && !CHAIN) {   // before the room first opened
      if (id !== null) return html(res, 404, shell({ title: "No entries yet · Civilization Zero", body: `<main><h1>No entries yet</h1><p>The room is closed until its rules are implemented and verified, not later than ${esc(OPENS)}. <a href="/discuss">The rules</a>.</p></main>`, path: "/discuss", description: "The room is closed." }), cache);
      return html(res, 200, shell({ title: "The open discussion · Civilization Zero", body: T.closed, path: "/discuss", description: "The discussion room of Civilization Zero: closed until its rules are implemented and verified; the rules, published in advance." }), cache);
    }
    if (page === "sitemap") {   // /sitemap-discussion.xml: every entry's page that is not hidden, read live (audit CZ21)
      const urls = [];
      for (let after = null; ;) {
        const rows = await rpc("cz_list", { p_after: after, p_before: null, p_limit: 200, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: false });
        for (const e of rows) if (!e.hidden) urls.push(`<url><loc>${ORIGIN}/discuss/${e.id}</loc><lastmod>${String(e.received).slice(0, 10)}</lastmod></url>`);
        if (rows.length < 200 || urls.length >= 45000) break;
        after = rows[rows.length - 1].id;
      }
      res.statusCode = 200; res.setHeader("Content-Type", "application/xml; charset=utf-8"); res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=600");
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
    }
    const r = id !== null ? await entryPage(url, id, req) : await listPage(url);
    return html(res, r.status, r.page, r.noStore ? { "Cache-Control": "no-store", Vary: "Accept" } : cache);   // a page missing part of its record is not cached
  } catch (err) {
    R.log("discuss", url.pathname + url.search, err);
    const body = `<main><h1>The room could not be read</h1><p>The archive is unavailable right now; nothing is lost — every entry is recorded with its id and hash. Try again shortly. As data: <a href="/discuss.json">/discuss.json</a>; contact: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p></main>`;
    return html(res, 503, shell({ title: "Unavailable · Civilization Zero", body, path: "/discuss", description: "The discussion is unavailable right now." }), { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
