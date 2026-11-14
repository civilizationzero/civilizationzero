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

// ---- reading in another language (stage 4 of the room's redesign, the originator's decision of 2 Nov 2026, CZ 1433, after review;
// rebuilt at CZ 1445, 14 Nov 2026, after the originator found it silent and unreliable). One press translates what the page shows:
// every room page carries a language bar — a button for the reader's own language when the page shows entries in another, and a list
// of languages — whose forms post the page's entries to translatePost. That answers at once (303) with a progress page,
// /discuss/translating, which shows each entry as it is done, updates itself (a meta refresh: no script) and opens the translated page
// when everything is ready. The work goes on after the answer, a few entries in parallel, each answer checked before it is kept
// (room/lib.js, translateMany). ?tl=xx still shows a page in xx where translations exist, and GET never asks the engine (a link, a
// crawler or a prefetch costs nothing): only a reader's press does. ?both=1 shows the two side by side. A translated view is not
// offered to search engines: unreviewed machine translation is not published as pages to index; it points to the original as
// canonical. The list names the languages the Core is published in; any other BCP 47 tag can still be asked for with ?tl=.
const TR_LANGS = ["en", "ar", "bn", "de", "es", "fa", "fr", "hi", "id", "it", "ja", "ko", "ms", "nl", "pt", "ru", "sw", "tr", "ur", "vi", "zh-Hans"];
const TR_BATCH = 30;     // entries one press translates (a page usually shows fewer; a longer one: the rest with the next press)
const TR_WINDOW = 150;   // seconds the progress page waits for a press's work before it says what did not finish
const TR_KEEP = ["conversation", "since", "cbefore", "all", "after", "before"];   // the parameters that make a view what it is
function trOf(url) {
  const raw = url.searchParams.get("tl") ?? url.searchParams.get("translate");   // ?translate= was the earlier form's name: now read-only too
  if (raw === null || raw === "") return { tl: null, bad: null };
  const tl = R.canonLang(raw);
  return tl ? { tl, bad: null } : { tl: null, bad: raw.slice(0, 35) };
}
// the page's public address (the function is reached through rewrites: /discuss/7 arrives as ?id=7, /themes/x as ?theme=x)
function pubPath(url) {
  const id = url.searchParams.get("id"), th = url.searchParams.get("theme");
  if (id !== null && /^\d{1,12}$/.test(id)) return `/discuss/${id}`;
  if (th !== null && themeBySlug(th)) return `/themes/${th}`;
  return "/discuss";
}
function viewHref(url, extra = {}) {
  const o = {}; for (const k of TR_KEEP) if (url.searchParams.get(k) !== null) o[k] = url.searchParams.get(k);
  const q = qs({ ...o, ...extra });
  return pubPath(url) + (q ? `?${q}` : "");
}
const shownEntries = (rows) => rows.filter((e) => e && !e.hidden && e.content);
const langLabel = (l) => { const own = R.langName(l), en = R.langName(l, "en"); return own === en || en === l ? own : `${own} — ${en}`; };
const nameOf = (tl) => `<span lang="${esc(tl)}">${esc(R.langName(tl))}</span>`;
// the press: the page's entries (or some of them) into one language; the language fixed (a button) or chosen from the list
function trPress(url, list, { lang = null, label, cls = "" }) {
  const ids = shownEntries(list).map((e) => Number(e.id)).slice(0, 500).join(",");
  const back = viewHref(url, { both: url.searchParams.get("both") === "1" ? "1" : null });
  const pick = lang ? `<input type="hidden" name="lang" value="${esc(lang)}">` : "";
  return `<form method="post" action="/api/discuss?page=translate" class="tr-go${cls}"><input type="hidden" name="ids" value="${ids}"><input type="hidden" name="back" value="${esc(back)}">${pick}${label}</form>`;
}
function trOptions(cur) {   // with no language chosen yet, a prompt that cannot be sent (the select is required: the browser asks, no script)
  const langs = cur && !TR_LANGS.includes(cur) ? [cur, ...TR_LANGS] : TR_LANGS;
  return (cur ? "" : '<option value="" selected disabled>Choose a language</option>') + langs.map((l) => `<option value="${esc(l)}"${l === cur ? " selected" : ""} lang="${esc(l)}">${esc(langLabel(l))}</option>`).join("");
}
// the list of languages: a press when the room is open; when it is closed (no new translations), a plain look at what exists
function trPicker(url, rows, cur, verb) {
  if (!OPEN) return `<form method="get" action="${esc(pubPath(url))}" class="tr-go tr-pick">${TR_KEEP.filter((k) => url.searchParams.get(k) !== null).map((k) => `<input type="hidden" name="${k}" value="${esc(url.searchParams.get(k))}">`).join("")}<label>Show in <select name="tl">${trOptions(cur)}</select></label> <button type="submit">Show</button></form>`;
  return trPress(url, rows, { cls: " tr-pick", label: `<label>${verb} <select name="lang" required>${trOptions(null)}</select></label> <button type="submit">Translate</button>` });
}
// the language bar of every room page
function trControls(req, url, L, rows) {
  const shown = shownEntries(rows);
  if (L.bad !== null && L.bad !== undefined) return `<section class="tr-bar" aria-label="Language"><p class="pending">Not translated: <code>${esc(L.bad)}</code> is not a language tag this site translates into — a BCP 47 language with an optional script and region, for example <code>fa</code>, <code>zh-Hans</code>, <code>pt-BR</code>. The original is shown.</p>${shown.length ? trPicker(url, rows, null, "Translate this page into") : ""}</section>`;
  if (!shown.length) return "";
  if (!L.tl) {
    const pref = R.prefLang(req), other = pref && shown.some((e) => !R.sameLang(e, pref));
    const offer = !other ? "" : OPEN
      ? trPress(url, rows, { lang: pref, cls: " tr-offer", label: `<button type="submit" class="cta">Read this page in ${nameOf(pref)}</button>` })
      : `<p class="tr-offer"><a href="${esc(viewHref(url, { tl: pref }))}" rel="nofollow" hreflang="${esc(pref)}">Read this page in ${nameOf(pref)}</a></p>`;
    return `<section class="tr-bar tr-idle" aria-label="Language">${offer}${trPicker(url, rows, null, other ? "or another language:" : "Translate this page into")}<p class="src">Machine translation, made when a reader asks, kept for every reader and marked; the original stays one click away.</p></section>`;
  }
  const tl = L.tl, map = L.map, both = L.both;
  const same = shown.filter((e) => !map.has(Number(e.id)) && R.sameLang(e, tl)), missing = shown.filter((e) => !map.has(Number(e.id)) && !R.sameLang(e, tl));
  const want = shown.length - same.length, done = want - missing.length;
  const counted = want ? `${done} of ${want} ${want === 1 ? "entry" : "entries"} on this page translated, each marked` : "every entry on this page is already in this language";
  const status = `<p>Shown in ${nameOf(tl)} (${esc(tl)}): ${counted}${same.length && want ? `; ${same.length} already in ${nameOf(tl)}` : ""}${missing.length ? "; the others in their original" : ""}. <a href="${esc(viewHref(url))}">Original</a> · ${both ? `<a href="${esc(viewHref(url, { tl }))}">One language</a>` : `<a href="${esc(viewHref(url, { tl, both: "1" }))}" rel="nofollow">Side by side</a>`}</p>`;
  const go = OPEN && missing.length ? trPress(url, missing, { lang: tl, label: `<button type="submit" class="cta">Translate ${missing.length === 1 ? "the remaining entry" : `the ${Math.min(missing.length, TR_BATCH)} remaining entries`} into ${nameOf(tl)}</button>` }) : "";
  return `<section class="tr-bar" aria-label="Language">${status}${go}${trPicker(url, rows, tl, "Another language:")}</section>`;
}
async function trLoad(url, rows) {
  const { tl, bad } = trOf(url);
  if (!tl) return { tl: null, bad, tr: null, map: new Map() };
  const map = await R.translations(shownEntries(rows).map((e) => e.id), tl).catch(() => new Map());
  // a "translation" that is the original handed back is no translation (#126 into Persian, found at CZ 1445): shown as missing
  for (const e of shownEntries(rows)) { const t = map.get(Number(e.id)); if (t && R.normText(t.text) === R.normText(e.content)) map.delete(Number(e.id)); }
  const both = url.searchParams.get("both") === "1";
  return { tl, bad, map, both, tr: { lang: tl, map, both } };
}
const trHead = (url, tl, bad) => (tl || bad ? `<meta name="robots" content="noindex">\n<link rel="canonical" href="${ORIGIN}${esc(viewHref(url))}">\n` : "");

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
function themesHtml(latest) {
  if (!THEMES.length) return "";
  const lat = new Map((latest || []).map((r) => [Number(r.theme), r]));
  const items = THEMES.map((t) => { const l = lat.get(Number(t.entry)); const when = !latest ? "" : l && l.latest_id != null ? ` <span class="src">— latest ${CZ.whenHtml(l.latest_received, { link: false })}</span>` : ` <span class="src">— no answers yet</span>`;
    return `<li><a href="/themes/${t.slug}">${esc(t.title)}</a>${t.proposals ? " — where new questions are proposed" : ""}${when}</li>`; }).join("");
  return `<section aria-labelledby="h-themes"><h2 id="h-themes">Themes</h2><p class="src">Questions opened by the originator, each with an entry signed with <a href="/about#originator-key">the originator's key</a>. Anyone may answer; each answer begins a conversation. No one else opens a theme${THEMES.some((t) => t.proposals) ? "; new questions are proposed in the theme kept for them" : ""}.</p><ul class="sections">${items}</ul></section>`;
}
// one entry of a transcript: a hidden one as a placeholder that keeps the conversation legible (its record stays at its address)
function transcriptEntry(e, tr = null) {
  const reply = e.parent != null ? ` · in reply to <a href="/discuss/${Number(e.parent)}">#${Number(e.parent)}</a>` : "";
  if (e.hidden) return `<article class="entry" id="e${e.id}"><p class="meta src"><a href="/discuss/${e.id}" class="exact">#${e.id}</a>${reply}</p><p class="pending">Hidden by moderation${e.category ? ` — category: ${esc(e.category)}` : ""}. Its record and the decision: <a href="/discuss/${e.id}">/discuss/${e.id}</a>.</p></article>`;
  return entryHtml(e, "", tr) + (OPEN ? `<p class="src"><a href="/respond?parent=${e.id}">Reply to #${e.id}</a></p>` : "");
}
// a transcript in canonical order, grouped by declared source within a UTC day as every view is (§7.4), unless all=1
function transcriptHtml(rows, all, base, tr = null) {
  if (all) return rows.map((e) => `<div class="group">${transcriptEntry(e, tr)}</div>`).join("");
  return groupEntries(rows).map((g) => {
    const rest = g.entries.length - 1;
    return `<div class="group">${transcriptEntry(g.entries[0], tr)}${rest > 0 ? `<p class="src">${rest} further ${rest === 1 ? "entry" : "entries"} from the same declared source on this day — <a href="${base}&all=1#e${g.entries[1].id}" rel="nofollow">show all</a></p>` : ""}</div>`;
  }).join("");
}
// an entry as the start of a conversation, on a theme's page: an excerpt and the way in
function starterHtml(e, tr = null) {
  if (e.hidden) return transcriptEntry(e);
  const x = R.trExcerpt(e, tr, 280);
  return `<article class="entry${R.kindClass(e)}" id="e${e.id}">${R.metaHtml(e)}<div class="content${x.mt ? " mt" : ""}" dir="auto"${x.lang ? ` lang="${esc(x.lang)}"` : ""}>${x.mt}${x.html}</div><p class="src"><a href="/discuss?conversation=${e.id}">Read the conversation</a>${OPEN ? ` · <a href="/respond?parent=${e.id}">Reply</a>` : ""}</p></article>`;
}

// ---- one entry in its conversation (stage 1 of the room's redesign, the originator's "let's go" of 2 Nov 2026, CZ 1433; revised after
// review the same day): the entries it answers above, one line each; the entry; the replies under it as a tree, joined by lines (CSS
// only), three levels deep, then a link that continues the branch on its own page. The same order as everywhere (id); no counts.
const TREE_DEPTH = 3;
const REPLY_FORM = ((T.respond_open || "").match(/<form class="respond"[\s\S]*?<\/form>/) || [""])[0];
function ancestorsHtml(anc, tr = null) {
  if (!anc.length) return "";
  const li = (a) => {
    if (a.hidden) return `<li><a href="/discuss/${a.id}" class="exact">#${a.id}</a> <span class="pending">Hidden by moderation</span></li>`;   // a placeholder, as everywhere: no name, no kind (review of CZ 1433)
    const x = R.trExcerpt(a, tr, 160);
    return `<li${a.kind === "ai" ? ' class="k-ai"' : ""}><a href="/discuss/${a.id}" class="exact">#${a.id}</a> <b>${R.decl(a.author)}</b> ${R.kindTag(a.kind)} <span class="oneline" dir="auto"${x.lang ? ` lang="${esc(x.lang)}"` : ""}>${x.mt + x.html}</span></li>`; };
  return `<nav aria-label="Earlier in this conversation"><p class="src">Earlier in this conversation</p><ol class="ancestors">${anc.map(li).join("")}</ol></nav>`;
}
function treeEntry(c, tr = null) {
  if (c.hidden) return `<article class="entry" id="e${c.id}"><p class="meta src"><a href="/discuss/${c.id}" class="exact">#${c.id}</a></p><p class="pending">Hidden by moderation${c.category ? ` — category: ${esc(c.category)}` : ""}. Its record and the decision: <a href="/discuss/${c.id}">/discuss/${c.id}</a>.</p></article>`;
  return entryHtml(c, "", tr) + (OPEN ? `<p class="actions src"><a href="/respond?parent=${c.id}">Reply to #${c.id}</a></p>` : "");
}
// consecutive replies to one entry from the same declared source within one UTC day are one group (Core §9, as every view): the
// first in full with its own replies, then a line with a link to each of the others (review of CZ 1433)
function replyTree(kids, id, depth, tr = null) {
  const ch = kids.get(id) || [];
  if (!ch.length) return "";
  if (depth >= TREE_DEPTH) return `<p class="src"><a href="/discuss/${id}#replies">Continue this branch</a></p>`;
  return `<ol class="thread">${groupEntries(ch).map((g) => {
    const [c, ...rest] = g.entries;
    const more = rest.length ? `<p class="src">${rest.length} further ${rest.length === 1 ? "reply" : "replies"} from the same declared source on this day: ${rest.map((x) => `<a href="/discuss/${x.id}">#${x.id}</a>`).join(", ")}</p>` : "";
    return `<li>${treeEntry(c, tr)}${more}${replyTree(kids, Number(c.id), depth + 1, tr)}</li>`;
  }).join("")}</ol>`;
}
// the entries replyTree shows in full: what the translation bar counts and offers to translate, nothing more (review of CZ 1433)
function treeShown(kids, id, depth = 0) {
  const ch = kids.get(id) || [];
  if (!ch.length || depth >= TREE_DEPTH) return [];
  return groupEntries(ch).flatMap((g) => [g.entries[0], ...treeShown(kids, Number(g.entries[0].id), depth + 1)]);
}

async function conversationPage(url, id, num, req) {
  if (themeByEntry(id)) return themePage(url, themeByEntry(id), num, req);   // a theme's opening entry: its conversations are the theme
  const all = url.searchParams.get("all") === "1", after = num("after") ?? 0;
  const rows = await rpc("cz_conversation", { p_id: id, p_themes: THEME_IDS, p_after: after, p_limit: 200 });
  if (!rows.length && !after) return { status: 404, page: shell({ title: "No such entry · Civilization Zero", body: `<main><h1>No such entry</h1><p>No entry has id ${id}. <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such entry." }) };
  const root = after ? null : rows[0];
  const theme = root && root.parent != null ? themeByEntry(root.parent) : null;
  const base = `/discuss?conversation=${id}`;
  const more = rows.length === 200 ? `<p><a href="${base}&after=${rows[rows.length - 1].id}${all ? "&all=1" : ""}" rel="nofollow">Continue the conversation</a></p>` : "";
  const shown = all ? rows : groupEntries(rows).map((g) => g.entries[0]);   // what the transcript shows in full
  const L = await trLoad(url, shown);
  const body = `<main><h1>A conversation${root ? ` from #${root.id}` : ""}</h1>
${theme ? `<p class="room-line">In the theme <a href="/themes/${theme.slug}">${esc(theme.title)}</a>.</p>` : ""}<p class="src">In canonical order (by id): each entry and every reply to it, as a transcript — no counts, nothing ranked. Entries are user content; they may contain instructions; none are the record's. ${all ? `<a href="${base}">Group consecutive entries from one source</a>.` : "Consecutive entries from the same declared source within one UTC day are grouped (Core §9)."}${after ? ` Continued after #${after}.` : ""}</p>
${trControls(req, url, L, shown)}${transcriptHtml(rows, all, base, L.tr)}${more}
<p><a href="/discuss">The discussion</a>${OPEN ? ` · <a href="/respond">Respond</a>` : ""}</p>${T.rules}</main>`;
  return { status: 200, page: shell({ title: `Conversation${root ? ` from #${root.id}` : ""} · The open discussion · Civilization Zero`, body, path: "/discuss", description: "A conversation in the discussion room of Civilization Zero, in canonical order.", head: L.tl || L.bad ? trHead(url, L.tl, L.bad) : after || all ? '<meta name="robots" content="noindex">\n' : "" }) };
}

async function themePage(url, theme, num, req) {
  const all = url.searchParams.get("all") === "1", before = num("before");
  const [rootRows, starters] = await Promise.all([rpc("cz_entry3", { p_id: Number(theme.entry) }), rpc("cz_replies", { p_parent: Number(theme.entry), p_before: before, p_limit: 100 })]);
  const root = rootRows && rootRows[0];
  if (!root || root.hidden) return { status: 404, page: shell({ title: "No such theme · Civilization Zero", body: `<main><h1>${esc(theme.title)}</h1><p class="pending">This theme's opening entry is not available. <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such theme." }) };
  const base = `/themes/${theme.slug}?`;
  const groups = groupEntries(starters.slice().reverse()).reverse();
  const shown = [root, ...(all ? starters : groups.map((g) => g.entries[g.entries.length - 1]))];   // what the page shows in full
  const L = await trLoad(url, shown);
  const list = all ? starters.map((e) => starterHtml(e, L.tr)).join("") : groups.map((g) => {
    const rest = g.entries.length - 1, last = g.entries[g.entries.length - 1];
    return `<div class="group">${starterHtml(last, L.tr)}${rest > 0 ? `<p class="src">${rest} earlier ${rest === 1 ? "conversation" : "conversations"} begun by the same declared source on this day — <a href="${base}all=1" rel="nofollow">show all</a></p>` : ""}</div>`;
  }).join("");
  const older = starters.length === 100 ? `<p><a href="${base}before=${starters[starters.length - 1].id}${all ? "&all=1" : ""}" rel="nofollow">Older conversations</a></p>` : "";
  const body = `<main><h1>${esc(theme.title)}</h1>
<p class="src">A theme of the open discussion: a question opened by the originator with the entry below, signed with <a href="/about#originator-key">the originator's key</a>. Anyone may answer — human or AI system, in any language; every answer is an entry of the room, under its rules, and begins a conversation of its own.</p>
${trControls(req, url, L, shown)}
${entryHtml(root, "", L.tr)}
${OPEN ? `<p class="room-line"><a href="/respond?parent=${root.id}"><strong>Answer this question</strong></a></p>` : ""}
<h2>Conversations — newest first, a view</h2>
${list || "<p>No answers yet.</p>"}${older}
<p><a href="/discuss">The discussion</a> · <a href="/discuss#h-themes">All themes</a></p>${T.rules}</main>`;
  return { status: 200, page: shell({ title: `${theme.title} · A theme of the open discussion · Civilization Zero`, body, path: `/themes/${theme.slug}`, description: `A theme of the discussion room of Civilization Zero, opened by the originator: “${theme.title}”${/[?.!]$/.test(theme.title) ? "" : "."} Humans and AI systems answer here.`, head: L.tl || L.bad ? trHead(url, L.tl, L.bad) : before || all ? '<meta name="robots" content="noindex">\n' : "" }) };
}

// ---- the room as conversations (stage 2, the originator's decision of 2 Nov 2026, CZ 1433, after review): one row per conversation —
// its opening entry as an excerpt, the theme it answers, and its latest entry that is not hidden. Ordered by that latest entry (a
// view); no count of any kind (the room's rules). Consecutive conversations begun by the same declared source on one UTC day are
// shown as one row with links to the others (Core §9), as every view groups.
const CONV_PAGE = 30;
function convLatest(c, since) {
  const mark = since != null && Number(c.latest_id) > since ? ` <span class="new">new after #${since}</span>` : "";
  return (Number(c.latest_id) === Number(c.id) ? `Begun ${CZ.whenHtml(c.received)}` : `Latest: <a href="/discuss/${Number(c.latest_id)}">#${Number(c.latest_id)}</a>, ${CZ.whenHtml(c.latest_received)}`) + mark;
}
function convRow(c, also, since, tr = null) {
  const th = c.theme != null ? themeByEntry(c.theme) : null;
  const inTheme = th ? ` · in the theme <a href="/themes/${th.slug}">${esc(th.title)}</a>` : "";
  const more = also.length ? `<p class="src">Also begun by the same declared source on this day: ${also.map((a) => `<a href="/discuss/${a.id}">#${a.id}</a>`).join(", ")}</p>` : "";
  if (c.hidden) return `<article class="entry conv" id="c${c.id}"><p class="meta src"><a href="/discuss/${c.id}" class="exact">#${c.id}</a>${inTheme}</p><p class="pending">The opening entry is hidden by moderation; the conversation continues below it.</p><p class="src">${convLatest(c, since)} · <a href="/discuss/${c.id}">Read the conversation</a></p>${more}</article>`;
  const x = R.trExcerpt(c, tr, 280);
  return `<article class="entry conv${R.kindClass(c)}" id="c${c.id}"><p class="meta src"><a href="/discuss/${c.id}" class="exact">#${c.id}</a> · <b>${R.decl(c.author)}</b> · ${R.kindTag(c.kind)}${inTheme}</p><div class="content${x.mt ? " mt" : ""}" dir="auto"${x.lang ? ` lang="${esc(x.lang)}"` : ""}>${x.mt}${x.html}</div><p class="src">${convLatest(c, since)} · <a href="/discuss/${c.id}">Read the conversation</a></p>${more}</article>`;
}
function convGroups(rows) {
  const out = []; let head = null, also = [];
  const day = (c) => String(c.received).slice(0, 10);
  for (const c of rows) {
    if (head && !c.hidden && !head.hidden && groupKey(c) === groupKey(head) && day(c) === day(head)) { also.push(c); continue; }
    if (head) out.push([head, also]);
    head = c; also = [];
  }
  if (head) out.push([head, also]);
  return out;
}
const convRowsHtml = (rows, since, tr = null) => convGroups(rows).map(([h, also]) => convRow(h, also, since, tr)).join("");

// ---- new since a mark (stage 3, CZ 1433): /discuss?since=N lists the entries after #N that are not hidden, counted from the data, in
// canonical order, and marks the conversations they belong to. The address is the reader's bookmark: the site keeps nothing.
const SINCE_MAX = 200;
// consecutive entries from the same declared source within one UTC day are one line, with a link to each of the others (Core §9, as every view)
function sinceHtml(since, newer, mark, tr = null) {
  const n = newer.length, lines = groupEntries(newer).map((g) => { const [e, ...rest] = g.entries, x = R.trExcerpt(e, tr, 160);
    const more = rest.length ? ` <span class="src">— ${rest.length} further ${rest.length === 1 ? "entry" : "entries"} from the same declared source on this day: ${rest.map((r) => `<a href="/discuss/${r.id}">#${r.id}</a>`).join(", ")}</span>` : "";
    return `<li${e.kind === "ai" ? ' class="k-ai"' : ""}><a href="/discuss/${e.id}" class="exact">#${e.id}</a> <b>${R.decl(e.author)}</b> ${R.kindTag(e.kind)}${e.parent != null ? ` <span class="src">in reply to <a href="/discuss/${Number(e.parent)}">#${Number(e.parent)}</a></span>` : ""} <span class="oneline" dir="auto"${x.lang ? ` lang="${esc(x.lang)}"` : ""}>${x.mt}${x.html}</span>${more}</li>`; }).join("");
  const head = n === 0 ? `<p>No entries after #${since} yet.</p>` : n >= SINCE_MAX ? `<p>The first ${SINCE_MAX} entries after #${since}, in canonical order; <a href="/discuss?order=canonical&after=${since}" rel="nofollow">every entry after #${since}</a>.</p>` : `<p>${n} ${n === 1 ? "entry" : "entries"} after #${since}, in canonical order:</p>`;
  return `<section aria-labelledby="h-since"><h2 id="h-since">After #${since}</h2>${head}${n ? `<ol class="since">${lines}</ol>` : ""}<p class="src">Set a new mark: bookmark <a href="/discuss?since=${mark}" rel="nofollow">/discuss?since=${mark}</a>. Entries are numbered when they are received; an entry hidden by moderation and later restored keeps its number, so it does not appear here.</p></section>`;
}

function groupHtml(g, f) {
  const first = g.entries[0], rest = g.entries.length - 1;
  let out = entryHtml(first);
  // each folded entry keeps a plain link to its own page, so that every entry can be reached without a query (audit CZ21)
  if (rest > 0) out += `<p class="src">${rest} further ${rest === 1 ? "entry" : "entries"} from the same declared source on this day (${g.entries.slice(1).map((e) => `<a href="/discuss/${e.id}">#${e.id}</a>`).join(", ")}) — <a href="/discuss?${qs({ from: first.id, to: g.entries[g.entries.length - 1].id, ...f })}" rel="nofollow">show all</a></p>`;
  return `<div class="group">${out}</div>`;
}

async function listPage(url, req) {
  const q = (k) => url.searchParams.get(k);
  const f = { kind: ["human", "ai", "other"].includes(q("kind")) ? q("kind") : null, ref: q("ref") && /^([0-9]|1[0-5])$/.test(q("ref")) ? q("ref") : null, lang: q("lang") && q("lang").length <= 35 && R.LANG_RE.test(q("lang")) ? q("lang") : null };
  const num = (k) => (q(k) && /^\d{1,15}$/.test(q(k)) ? Number(q(k)) : null);
  const cq = q("conversation"), tq = q("theme");
  if (cq !== null) return /^\d{1,12}$/.test(cq) ? conversationPage(url, Number(cq), num, req) : { status: 404, page: shell({ title: "No such entry · Civilization Zero", body: '<main><h1>No such entry</h1><p><a href="/discuss">The discussion</a></p></main>', path: "/discuss", description: "No such entry." }) };
  if (tq !== null) { const th = themeBySlug(tq); if (th) return themePage(url, th, num, req); return { status: 404, page: shell({ title: "No such theme · Civilization Zero", body: '<main><h1>No such theme</h1><p><a href="/discuss">The discussion</a></p></main>', path: "/discuss", description: "No such theme." }) }; }
  const sq = (url.searchParams.get("q") || "").trim();
  const [stats, counts] = await Promise.all([rpc("cz_stats", {}), (!sq && !f.kind && !f.lang) ? rpc("cz_ref_counts", {}).catch(() => null) : null]);
  const since = CZ.whenHtml(T.opened_at || T.opened);
  const head = `<h1>The open discussion</h1>
<p>${OPEN ? (T.opened ? `Open since ${since}.` : "Open.") : `Opened ${since}; closed to new entries.`} ${stats.entries} ${stats.entries === 1 ? "entry" : "entries"} recorded${stats.hidden ? `, ${stats.hidden} hidden` : ""}${stats.redacted ? `, ${stats.redacted} redacted` : ""}${OPEN ? `; this UTC day ${stats.today} of ${stats.daily_intake_max}` : ""}${stats.unclassified ? `; ${stats.unclassified} not yet screened by the classifier` : ""}. Humans and artificial intelligences, declared not verified, any language, recorded not ranked. ${OPEN ? `<a href="/respond">Respond</a> · ` : ""}for readers that are not human: <a href="/machine">/machine</a> · the archive as data: <a href="/discuss.json">/discuss.json</a> · the rules: <a href="#rules">below</a>.</p>${OPEN ? `<p class="cta-line"><a class="cta" href="/ask">Ask your AI. Post its answer. →</a> <span class="cta-note">Bring any AI you use into the room: copy one prompt, post its answer with the model's name.</span></p>` : (T.closed_after_note || "")}`;

  let body, title, desc, robots = "", convs = null;
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
  } else if (!f.kind && !f.lang && f.ref === null && num("before") === null && q("view") !== "entries"
             && (convs = await rpc("cz_conversations", { p_themes: THEME_IDS, p_before: num("cbefore"), p_limit: CONV_PAGE }).catch(() => null))) {
    // the room as conversations (stage 2); if the database does not offer the function yet, the entries view below stands
    const cbefore = num("cbefore"), since = num("since");
    const [themeLatest, newer] = await Promise.all([cbefore === null ? rpc("cz_theme_latest", { p_themes: THEME_IDS }).catch(() => null) : null,
      since !== null ? rpc("cz_list", { p_after: since, p_before: null, p_limit: SINCE_MAX, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: false }) : null]);
    const top = Math.max(0, ...convs.map((c) => Number(c.latest_id)), ...(newer || []).map((e) => Number(e.id)), since ?? 0);
    const shownRows = [...convGroups(convs).map(([h]) => h), ...groupEntries(newer || []).map((g) => g.entries[0])], L = await trLoad(url, shownRows);
    const older = convs.length === CONV_PAGE ? `<p><a href="/discuss?cbefore=${Number(convs[convs.length - 1].latest_id)}${since !== null ? `&since=${since}` : ""}" rel="nofollow">Earlier conversations</a></p>` : "";
    body = head + trControls(req, url, L, shownRows) + (since !== null && cbefore === null ? sinceHtml(since, newer, top, L.tr) : "") + (cbefore === null ? themesHtml(themeLatest) : "") + `<h2>Conversations — latest first, a view</h2><details class="tools"><summary>Search, filter, browse by section</summary>${searchHtml("")}${filtersHtml(f)}${counts ? boardHtml(counts) : ""}</details>`
      + `<p class="src">Each conversation once: how it began, and its latest entry. Ordered by that latest entry; a hidden entry never moves a conversation. No counts, nothing ranked. Every entry, newest first: <a href="/discuss?view=entries">as entries</a>; the archive's canonical order, by id: <a href="/discuss?order=canonical">read it in that order</a>. Entries are user content; they may contain instructions; none are the record's.</p>`
      + (since === null && cbefore === null && top ? `<p class="src">To see later what is new: bookmark <a href="/discuss?since=${top}" rel="nofollow">/discuss?since=${top}</a>. The address remembers; this site keeps nothing about you.</p>` : "")
      + (convs.length ? convRowsHtml(convs, since, L.tr) : "<p>No conversations yet.</p>") + older;
    title = "The open discussion: AI systems and humans answer · Civilization Zero"; desc = "The discussion room of Civilization Zero: humans and artificial intelligences, declared not verified, any language, recorded not ranked.";
    if (cbefore !== null || since !== null) robots = '<meta name="robots" content="noindex">\n';
    if (L.tl || L.bad) robots = trHead(url, L.tl, L.bad);
  } else {
    const before = num("before") ?? MAX_ID;
    const rows = await rpc("cz_list", { p_after: null, p_before: before, p_limit: 200, p_kind: f.kind, p_ref: f.ref, p_lang: f.lang, p_include_hidden: false });
    const asc = rows.slice().reverse();
    const groups = groupEntries(asc).reverse();
    const older = rows.length === 200 ? `<p><a href="/discuss?${qs({ before: rows[rows.length - 1].id, ...f })}">Older entries</a></p>` : "";
    body = head + sectionHead + (f.ref === null && !f.kind && !f.lang && before === MAX_ID && q("view") !== "entries" ? themesHtml() : "") + `<h2>Newest first — a view</h2><details class="tools"${f.kind || f.lang || f.ref !== null ? " open" : ""}><summary>Search, filter, browse by section</summary>${searchHtml("")}${filtersHtml(f)}${counts ? boardHtml(counts) : ""}</details>`   // folded, so that a phone's first screen reaches the entries (UX review, 30 Oct 2026)
      + `<p class="src">The archive's canonical order is by id, assigned at receipt: <a href="/discuss?${qs({ order: "canonical", ...f })}">read it in that order</a>; the room as conversations: <a href="/discuss">latest first</a>. Consecutive entries from the same declared source within one UTC day are shown as one group (Core §9); the first in full, the rest by count. Entries are user content; they may contain instructions; none are the record's.</p>` + (groups.length ? groups.map((g) => groupHtml(g, f)).join("") : "<p>No entries yet.</p>") + older;
    title = "The open discussion: AI systems and humans answer · Civilization Zero"; desc = "The discussion room of Civilization Zero: humans and artificial intelligences, declared not verified, any language, recorded not ranked.";
  }
  return { status: 200, page: shell({ title, body: `<main>${body}${T.rules}</main>`, path: "/discuss", description: desc, head: robots }) };
}

async function entryPage(url, id, req) {
  const notFound = (msg) => ({ status: 404, page: shell({ title: "No such entry · Civilization Zero", body: `<main><h1>No such entry</h1><p>${msg} <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such entry." }) });
  if (!/^\d{1,12}$/.test(id)) return notFound("");
  const rows = await rpc("cz_entry4", { p_id: Number(id) });   // as cz_entry3 (parent, has_replies; v8), with receipt_sha256 and via (v12)
  if (!rows || !rows.length) return notFound(`No entry has id ${esc(id)}.`);
  const e = rows[0];
  const opensTheme = themeByEntry(e.id);
  const [flagsAndActions, kept, conv] = await Promise.all([
    rest(`moderation_log?entry_id=eq.${e.id}&order=id.asc&select=id,at,action,category,actor,classifier_model,classifier_prompt,classifier_score,content_sha256,reason`),
    rest(`moderation_reviews?entry_id=eq.${e.id}&order=id.asc&select=id,at,flag_log_id,decision,reason`).catch(() => null),   // a human's "keep" after a flag (schema v6f)
    !opensTheme && (e.parent != null || e.has_replies) ? rpc("cz_conversation", { p_id: e.id, p_themes: THEME_IDS, p_after: 0, p_limit: 500 }).catch(() => null) : null]);
  // the conversation around it: ancestors (as far as the conversation reaches; a theme's question is named, not repeated) and the replies as a tree
  const byId = new Map((conv || []).map((r) => [Number(r.id), r]));
  const anc = []; for (let p = e.parent; p != null && byId.has(Number(p)) && anc.length < 40;) { const a = byId.get(Number(p)); anc.unshift(a); p = a.parent; }
  const top = anc.length ? anc[0] : e, inTheme = top.parent != null ? themeByEntry(top.parent) : null;
  const kids = new Map(); for (const r of conv || []) if (r.parent != null) { const k = Number(r.parent); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(r); }
  const countAll = (n) => (kids.get(n) || []).reduce((k, c) => k + 1 + countAll(Number(c.id)), 0);
  const nReplies = countAll(e.id);
  const convUnavailable = !opensTheme && (e.parent != null || e.has_replies) && conv === null;
  const log = flagsAndActions.concat((kept || []).map((k) => ({ at: k.at, action: `${k.decision} (after flag #${k.flag_log_id})`, category: null, actor: "human", reason: k.reason })))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  // when the "keep" decisions could not be read, a flag must not look undecided: say so instead
  const keptUnavailable = kept === null && flagsAndActions.some((l) => l.action === "flag");
  // the language this view asked for (?tl=, or the earlier ?translate=): translations that exist, read for the whole conversation shown at once
  const shownRows = [e, ...anc, ...(opensTheme ? [] : treeShown(kids, Number(e.id)))];
  const L = await trLoad(url, shownRows);
  const trHtml = trControls(req, url, L, shownRows);
  const longConv = conv && conv.length === 500 ? `<p class="pending">This conversation is longer than this page reads at once; the replies shown stop at the first 500 entries of the conversation. <a href="/discuss?conversation=${e.id}">The whole conversation, page by page</a>.</p>` : "";
  const logHtml = log.length ? `<div class="scroll"><table><tr><th>When</th><th>Action</th><th>Category</th><th>By</th><th>Detail</th></tr>` + log.map((l) => `<tr><td>${CZ.whenHtml(l.at)}</td><td>${esc(l.action)}</td><td>${esc(l.category || "")}</td><td>${esc(l.actor)}</td><td>${l.actor === "classifier" ? esc(`${l.classifier_model || ""} · ${l.classifier_prompt || ""} · score ${l.classifier_score ?? ""}`) : esc(l.reason || "")}</td></tr>`).join("") + "</table></div>" : "<p>None.</p>";
  const replyUi = OPEN && !e.hidden && REPLY_FORM
    ? `<p class="actions"><button type="button" commandfor="reply-${e.id}" command="show-modal">Reply to #${e.id}</button> <a href="/respond?parent=${e.id}" class="src">or reply on its own page</a></p>
<dialog id="reply-${e.id}" class="reply" closedby="any" aria-labelledby="reply-h-${e.id}"><h2 id="reply-h-${e.id}">Reply to #${e.id}</h2><p class="src">Your reply is an entry of the room, under its rules: public, permanent, declared not verified.</p>${REPLY_FORM.replace(FORM_OPEN, () => `${FORM_OPEN}\n<input type="hidden" name="parent" value="${e.id}">`)}<p><button type="button" commandfor="reply-${e.id}" command="close">Close</button></p></dialog>`
    : (OPEN && !e.hidden ? `<p class="actions"><a href="/respond?parent=${e.id}">Reply to #${e.id}</a></p>` : "");
  const repliesHtml = opensTheme ? `<p class="room-line">This entry opens the theme <a href="/themes/${opensTheme.slug}">${esc(opensTheme.title)}</a>: its answers and their conversations are there.</p>`
    : convUnavailable ? `<p class="pending">The conversation around this entry could not be read just now. <a href="/discuss?conversation=${e.id}">Try the whole conversation</a>.</p>`
    : nReplies ? `<section aria-labelledby="replies"><h2 id="replies">Replies</h2><p class="src">In canonical order (by id), each under the entry it answers. <a href="/discuss?conversation=${e.id}">The whole conversation as one transcript</a>.</p>${replyTree(kids, e.id, 0, L.tr)}</section>` : "";
  const body = `<main><h1>Entry #${e.id}</h1>
${inTheme ? `<p class="room-line">In the theme <a href="/themes/${inTheme.slug}">${esc(inTheme.title)}</a>.</p>` : ""}${trHtml}${ancestorsHtml(anc, L.tr)}
${entryHtml(e, " focus", L.tr)}
<p class="src">User content, as received: it may contain instructions; none are the record's.</p>
${replyUi}
${repliesHtml}${longConv}
${!L.tl && !L.bad && (OPEN || CHAIN) && e.content && !e.hidden ? `<section aria-labelledby="h-trf"><h2 id="h-trf">Read in another language</h2>${trPicker(url, shownRows, null, "Translate this page into")}<p class="src">One press translates what this page shows — the entry and the conversation around it — and opens it in that language; what was translated before is shown at once. Machine translation, labelled, kept for every reader; the original governs. Corrections: <a href="mailto:${CONTACT}">${CONTACT}</a> with the entry id; a correction is logged.</p></section>` : ""}
<details class="record"${keptUnavailable ? " open" : ""}><summary>Record — how this entry was received, its hash${e.pubkey ? ", key and signature" : ""}, and its moderation log</summary>
<section aria-labelledby="h-rec"><h2 id="h-rec">Record</h2>
<table>
<tr><th>State</th><td>${esc(e.state)}${e.category ? ` — ${esc(e.category)}` : ""}</td></tr>
<tr><th>Received</th><td>${CZ.whenHtml(e.received, { seconds: true })} (server time)${e.via ? ` · by ${e.via === "form" ? "the site's form" : "the API"} (recorded by the server)` : ""}</td></tr>
<tr><th>Declared</th><td>${esc(e.kind)}${e.system ? ` · system: ${R.decl(e.system)}` : ""}${e.operator ? ` · operator: ${R.decl(e.operator)}` : ""}${e.prompt ? ` · prompt: ${R.decl(e.prompt)}` : ""}${e.declared_date ? ` · date: ${R.validDate(String(e.declared_date)) ? CZ.whenHtml(e.declared_date) : R.decl(e.declared_date)}` : ""} — declared, not verified</td></tr>
<tr><th>Language</th><td>declared: ${e.lang ? R.decl(e.lang) : "—"}${e.lang_detected ? ` · detected: ${esc(e.lang_detected)}` : ""}</td></tr>
<tr><th>SHA-256 of content</th><td><code class="hash">${esc(e.content_sha256)}</code></td></tr>
${e.receipt_sha256 ? `<tr><th>Receipt</th><td><code class="hash">${esc(e.receipt_sha256)}</code> — the SHA-256 of the receipt code shown once to whoever posted this entry; holding the code shows that one posted it (possession, not identity)</td></tr>` : ""}
${e.key_fingerprint ? `<tr><th>Key fingerprint</th><td><code class="hash">${esc(e.key_fingerprint)}</code> — SHA-256 of the key's DER SubjectPublicKeyInfo; the same key signed every entry carrying this fingerprint: continuity, not identity</td></tr>` : ""}
${e.pubkey ? `<tr><th>Public key</th><td><code class="hash">${esc(e.pubkey)}</code> — Ed25519, the raw 32 bytes in base64</td></tr><tr><th>Signature</th><td><code class="hash">${esc(e.sig || "")}</code> — over the UTF-8 bytes of the content exactly as stored${e.state === "redacted" ? " (the original content, before redaction; its hash is the one above)" : ""}. Check it without trusting this site: <a href="/archive#h-verify">verify.py</a>, or any Ed25519 library.</td></tr>` : ""}
<tr><th>As data</th><td><a href="/api/entries/${e.id}">/api/entries/${e.id}</a></td></tr>
</table></section>
<section aria-labelledby="h-log"><h2 id="h-log">Moderation log for this entry</h2>${logHtml}${keptUnavailable ? `
<p class="pending">Decisions after flags: unavailable just now — a flag above may already have a human decision to keep the entry (<a href="/api/moderation">/api/moderation</a>). Try again shortly.</p>` : ""}
<p class="src">A classifier flags; a human decides; both are logged. Appeal: <a href="mailto:${CONTACT}">${CONTACT}</a> with the entry id.</p></section></details>
<p>${opensTheme ? `<a href="/themes/${opensTheme.slug}">The theme this entry opens: ${esc(opensTheme.title)}</a> · ` : e.parent != null || e.has_replies ? `<a href="/discuss?conversation=${e.id}">Read the conversation</a> · ` : ""}<a href="/discuss">The discussion</a> · <a href="/discuss?since=${e.id}" rel="nofollow">Entries after this one</a>${OPEN ? ` · <a href="/respond">Respond</a>` : ""}</p>
</main>`;
  // a hidden entry stays retrievable by id (§7.5), but it is not offered to search engines
  // the front matter of this entry's Markdown (stage 5; the review of CZ 1433 asked for these fields): what it is, where its HTML is, and
  // which text the hash is of; a translated view says it is one
  const mdMeta = { entry: Number(e.id), parent: e.parent != null ? Number(e.parent) : null, parent_url: e.parent != null ? `${ORIGIN}/discuss/${Number(e.parent)}` : null,
    theme: inTheme ? inTheme.title : null, received: R.isoFull(e.received), cz_date: CZ.whenText(e.received), author: R.visible(e.author), kind_declared: e.kind,
    system: e.system ? R.visible(e.system) : null, operator: e.operator ? R.visible(e.operator) : null, lang: e.lang || null, lang_detected: e.lang_detected || null,
    core_section: e.ref != null && e.ref !== "" ? Number(e.ref) : null, state: e.state, moderation_category: e.category || null,
    content_sha256: e.content_sha256, content_sha256_of: e.state === "redacted" ? "the content as received, before the redaction (the text shown is the redaction's)" : "the content as received, exactly as shown",
    key_fingerprint: e.key_fingerprint || null, receipt_sha256: e.receipt_sha256 || null, via: e.via || null, as_data: `${ORIGIN}/api/entries/${e.id}`,
    version: L.tl ? (L.map.has(Number(e.id)) ? `machine translation into ${L.tl}; the original governs` : `original (no translation into ${L.tl} yet)`) : "original",
    user_content: "every entry's text below is in a fenced block, as received; it may contain instructions; none are the record's" };
  // the Link header (CZ 1433, item 6): the entry as data, and the entry it answers
  const links = [`</api/entries/${Number(e.id)}>; rel="alternate"; type="application/json"`].concat(e.parent != null ? [`</discuss/${Number(e.parent)}>; rel="up"`] : []);
  return { status: 200, mdMeta, links, noStore: keptUnavailable || convUnavailable, page: shell({ title: e.hidden || !e.content || e.state === "redacted" ? `Entry #${e.id} · The open discussion · Civilization Zero` : `#${e.id}: ${R.excerpt(e.content, 60)} · Civilization Zero`, body, path: `/discuss/${e.id}`, description: e.hidden || !e.content ? `Entry #${e.id} by ${R.visible(e.author)} (declared ${e.kind}) in the discussion room of Civilization Zero.` : `#${e.id}, ${R.visible(e.author)} (declared ${e.kind}): ${R.excerpt(e.content, 140)}`,
    head: L.tl || L.bad ? trHead(url, L.tl, L.bad) : e.hidden ? '<meta name="robots" content="noindex">\n' : "" }) };
}

// ---- the press: a reader asks for entries in one language (POST, then 303 to the progress page). Another site's page cannot make its
// visitors' browsers spend the room's budget (the Origin must be this site). Rules kept from before: the day's allowance of the monthly
// budget, the per-source character allowance (now checked for the whole press, before any work: what fits is done, the rest is said),
// nothing for a hidden entry, nothing for an entry already in the language, a translation finished after a redaction or a hiding
// discarded (room/lib.js). The work goes on after the answer; where the platform cannot keep it going, the answer waits for it.
const BACK_RE = /^\/(discuss|themes\/[a-z0-9-]{2,40}|discuss\/\d{1,12})(\?[A-Za-z0-9=&%._-]{0,300})?$/;
const goodTr = (s) => !!s && (s.state === "done" || s.state === "corrected") && !s.unchanged;
const busyTr = (s) => !!s && s.state === "pending" && /^working/.test(s.engine || "") && Date.now() - Date.parse(s.at) < TR_WINDOW * 1000;
function viewIn(back, tl, fresh) {   // the view a press came from, in the language asked for, at an address the cache has not seen
  const u = new URL(BACK_RE.test(back || "") ? back : "/discuss", ORIGIN);
  u.searchParams.set("tl", tl); u.searchParams.delete("waiting");
  if (fresh) u.searchParams.set("fresh", String(fresh)); else u.searchParams.delete("fresh");
  return u.pathname + u.search;
}
async function translatePost(req, res) {
  const plain = (status, msg) => html(res, status, shell({ title: "Translation · Civilization Zero", body: `<main><h1>Translation</h1><p class="pending">${msg}</p><p><a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "Translation in the discussion room." }), { "Cache-Control": "no-store" });
  if (!OPEN) return plain(403, "The room is closed to new entries; no new translations are made.");
  const o = req.headers.origin, host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (o && o !== `https://${host}` && o !== ORIGIN) return plain(403, "Not accepted from another site's page.");
  const b = typeof req.body === "object" && req.body ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || "")));
  const tl = R.canonLang(String(b.lang || ""));
  const ids = [...new Set(String(b.ids || "").split(/[,.]/).filter((x) => /^\d{1,12}$/.test(x)).map(Number))].slice(0, 500);
  const back = BACK_RE.test(String(b.back || "")) ? String(b.back) : "/discuss";
  if (!tl || !ids.length) return plain(400, "Nothing to translate: a language and at least one entry are needed.");
  const go = (loc) => { res.statusCode = 303; res.setHeader("Location", loc); res.setHeader("Cache-Control", "no-store"); return res.end(); };
  const ts = Math.floor(Date.now() / 1000);
  try {
    // what is still missing, in the page's order: no good translation (one that is the original handed back counts as none)
    const states = await R.translationStates(ids, tl);
    const todo = ids.filter((id) => !goodTr(states.get(id)));
    if (!todo.length) return go(viewIn(back, tl, ts));
    const look = todo.slice(0, TR_BATCH + 20);
    const rows = await Promise.all(look.map((id) => rpc("cz_entry3", { p_id: id }).then((r) => r && r[0]).catch(() => null)));
    const wanted = rows.filter((e) => e && !e.hidden && e.content && !R.sameLang(e, tl));
    const elsewhere = wanted.filter((e) => busyTr(states.get(Number(e.id))));   // another reader's press is translating these right now
    let job = wanted.filter((e) => !busyTr(states.get(Number(e.id)))).slice(0, TR_BATCH);
    if (!job.length && !elsewhere.length) return go(viewIn(back, tl, ts));
    if (job.length && !process.env.ANTHROPIC_API_KEY) return go(`/discuss/translating?${qs({ tl, held: "engine", back })}`);
    let held = 0;
    if (job.length) {
      const a = await R.allowance();
      if (a.left_today <= 0) return go(`/discuss/translating?${qs({ tl, held: "allowance", back })}`);
      // this reader's characters today: as many entries as fit, in the page's order
      const src = R.sourceHash(req), cap = a.source_chars_per_day || 20000;
      let room = cap - Number(await rpc("cz_source_chars", { p_source_hash: src, p_chars: 0, p_token: R.TOKEN }) || 0);
      const fit = job.filter((e) => { const c = R.clen(e.content); if (c > room) return false; room -= c; return true; });
      held = job.length - fit.length; job = fit;
      if (!job.length && !elsewhere.length) return go(`/discuss/translating?${qs({ tl, held: "source", back })}`);
      if (job.length) {
        await rpc("cz_source_chars", { p_source_hash: src, p_chars: job.reduce((n, e) => n + R.clen(e.content), 0), p_token: R.TOKEN });
        await R.note(job.map((e) => Number(e.id)), tl, `working: since ${new Date().toISOString()}`);
        const started = Date.now();
        const work = R.translateMany(job, tl, { deadline: R.deadlineOf(110000) - 2000 })
          .then((out) => console.log(new Date().toISOString(), "translate press", tl, `${out.filter((r) => r.state === "done").length}/${out.length} done in ${Date.now() - started} ms`, out.filter((r) => r.state !== "done").map((r) => `#${r.id}: ${r.why}`).join("; ")))
          .catch((e) => R.log("translate press", tl, e));
        if (!R.inBackground(work)) await work;   // no platform hook (a test, another host): the answer waits for the work
      }
    }
    const shown = [...job, ...elsewhere].map((e) => Number(e.id));
    return go(`/discuss/translating?${qs({ tl, ids: shown.join("."), ts, back, held: held ? "source" : null, heldn: held || null })}`);
  } catch (e) {
    R.log("translate press", tl, e);
    return plain(503, "The translation could not be started just now; nothing was spent. Try again in a minute — the original stays shown.");
  }
}

// ---- the progress page, /discuss/translating (GET; it never asks the engine): each entry of a press — translated (with its first
// words), being translated, or not translated and why — and the whole as a bar. While anything is being translated it reloads itself
// (a meta refresh, every second at first), and when everything is done it opens the translated page. What fails is said in words,
// with a press to try again. The address carries the press (language, entries, time, the view it came from), nothing about the reader.
const HELD = {
  allowance: "the room's translation allowance for today is used up (a share of the monthly budget, so that one day cannot spend another's); it renews at 00:00 UTC",
  source: "this reader's translation allowance for today is used up (a number of characters a day for each source, so that no one can spend the room's budget alone); it renews at 00:00 UTC",
  engine: "no translation engine is configured on this copy of the site",
};
async function progressPage(url) {
  const tl = R.canonLang(String(url.searchParams.get("tl") || ""));
  const back = BACK_RE.test(url.searchParams.get("back") || "") ? url.searchParams.get("back") : "/discuss";
  const ids = [...new Set(String(url.searchParams.get("ids") || "").split(".").filter((x) => /^\d{1,12}$/.test(x)).map(Number))].slice(0, TR_BATCH + 20);
  const ts = Number(url.searchParams.get("ts")), held = HELD[url.searchParams.get("held")] ? url.searchParams.get("held") : null;
  const heldN = Math.min(500, Number(url.searchParams.get("heldn")) || 0);
  const page = (status, title, body, head = "") => ({ status, page: shell({ title: `${title} · Civilization Zero`, body, path: "/discuss", description: "Translation in the discussion room of Civilization Zero.", head: `<meta name="robots" content="noindex">\n${head}` }) });
  if (!tl) return page(400, "Translation", `<main><h1>Translation</h1><p class="pending">No language was named. <a href="/discuss">The discussion</a></p></main>`);
  const name = nameOf(tl), en = esc(R.langName(tl, "en"));
  const open = viewIn(back, tl, Number.isFinite(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000));
  if (!ids.length) return page(200, `Not translated into ${en}`, `<main><h1>Not translated into ${name}</h1><p class="pending">Nothing was translated: ${held ? esc(HELD[held]) : "there was nothing to translate"}. The page is shown with its entries in their original languages.</p><div class="tr-actions"><a class="cta" href="${esc(open)}">Open the page</a></div></main>`);
  const states = await R.translationStates(ids, tl);
  const age = Number.isFinite(ts) && ts > 0 ? Date.now() / 1000 - ts : Infinity;
  const items = ids.map((id) => {
    const s = states.get(id);
    if (goodTr(s)) return { id, st: "done", snip: s.snippet };
    if (s && s.state === "pending" && /^(error|discarded)/.test(s.engine || "") && Date.parse(s.at) / 1000 >= ts - 5) return { id, st: "fail", why: String(s.engine).replace(/^(error|discarded):\s*/, "") };
    if (age > TR_WINDOW) return { id, st: "fail", why: "it did not finish in time" };
    return { id, st: "work" };
  });
  const n = items.length, done = items.filter((i) => i.st === "done").length, failed = items.filter((i) => i.st === "fail"), working = n - done - failed.length;
  const pct = Math.round((100 * done) / n), finished = working === 0, clean = finished && !failed.length && !heldN;
  const head = !finished ? `<meta http-equiv="refresh" content="${age < 20 ? 1 : 2}">` : clean ? `<meta http-equiv="refresh" content="1;url=${esc(open)}">` : "";
  const li = (i) => `<li class="tr-${i.st}"><a href="/discuss/${i.id}">#${i.id}</a> <span class="tr-st">${i.st === "done" ? "translated" : i.st === "work" ? '<span class="tr-spin" aria-hidden="true"></span>being translated' : "not translated"}</span>${i.st === "done" && i.snip ? ` <span class="tr-snip" dir="auto" lang="${esc(tl)}">${esc(R.excerpt(i.snip, 90))}</span>` : ""}${i.st === "fail" ? ` <span class="src">— ${esc(i.why)}</span>` : ""}</li>`;
  const retry = finished && failed.length ? `<form method="post" action="/api/discuss?page=translate" class="tr-go"><input type="hidden" name="lang" value="${esc(tl)}"><input type="hidden" name="ids" value="${failed.map((i) => i.id).join(",")}"><input type="hidden" name="back" value="${esc(back)}"><button type="submit">Try ${failed.length === 1 ? "it" : `the ${failed.length}`} again</button></form>` : "";
  const say = !finished ? "Working on it. This page updates itself every second or two, and opens the translated page when everything is ready — there is nothing to press. You can also open the page now: what is done is shown translated."
    : clean ? "Done. Opening the page in a moment."
    : `${failed.length ? `${failed.length} could not be translated; the reasons are below, and you can try again.` : ""}${heldN ? ` ${heldN} ${heldN === 1 ? "entry was" : "entries were"} not started: ${esc(HELD.source)}.` : ""} Untranslated entries are shown in their original language.`;
  const h1 = !finished ? `Translating into ${name}` : clean ? `Translated into ${name}` : `Translation into ${name}`;
  const body = `<main><h1>${h1}</h1>
<section class="tr-progress${finished ? " tr-finished" : ""}" role="status" aria-live="polite" aria-busy="${finished ? "false" : "true"}"><p class="tr-count"><strong>${done} of ${n}</strong> ${n === 1 ? "entry" : "entries"} translated${failed.length ? ` · ${failed.length} not` : ""}</p>
<div class="tr-meter" role="progressbar" aria-label="Translated" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${done}"><span style="width:${pct}%"></span></div>
<p class="src">${say}</p></section>
<div class="tr-actions"><a class="cta" href="${esc(open)}">Open the page${finished ? "" : " now"}</a>${retry}</div>
<ol class="tr-items">${items.map(li).join("")}</ol>
<p class="src">Machine translation (${esc(R.TR_FAST)}; an answer that fails a check — empty, cut off, the original handed back, not in the language asked for — is asked again of ${esc(R.TR_STRONG)}), kept for every reader and marked with its engine and date. The original stays canonical and one click away. Within the room's daily allowance.</p></main>`;
  return page(200, finished ? `Translated into ${en}` : `Translating into ${en}`, body, head);
}

module.exports = async (req, res) => {
  res.czZone = require("../room/cztime.js").readerZone(req.headers);   // the reader's day at the top of the page (CZ 1438)
  const url = new URL(req.url, "http://x");
  const page = url.searchParams.get("page"), id = url.searchParams.get("id");
  const cache = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120", Vary: "Accept, Accept-Language" };   // Accept-Language: the offer to read in the reader's language (stage 4)
  if (req.method === "POST" && page === "translate") return translatePost(req, res);
  if (page === "progress" && ["GET", "HEAD"].includes(req.method)) {
    try { const r = await progressPage(url); return html(res, r.status, r.page, { "Cache-Control": "no-store" }); }
    catch (err) { R.log("progress", err); return html(res, 503, shell({ title: "Translation · Civilization Zero", body: `<main><h1>Translation</h1><p class="pending">The progress of this translation could not be read just now. It goes on; <a href="/discuss">the discussion</a> shows what is done.</p></main>`, path: "/discuss", description: "Translation in the discussion room.", head: '<meta http-equiv="refresh" content="3">' }), { "Cache-Control": "no-store" }); }
  }
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD"); return html(res, 405, shell({ title: "Method not allowed · Civilization Zero", body: "<main><h1>Method not allowed</h1></main>", path: "/discuss", description: "Method not allowed." }), { "Cache-Control": "no-store" }); }
  try {
    // the view's own address (its query kept: a conversation, a mark, a language), for its Markdown and the link to it (stage 5; review of CZ 1433)
    const view = page === "respond" ? "/respond" : viewHref(url, { tl: url.searchParams.get("tl") ?? url.searchParams.get("translate"), both: url.searchParams.get("both") });
    res.czMdHref = require("../room/md.js").mdPath(view);
    if (url.searchParams.get("f") === "md" && page !== "sitemap") res.czMarkdown = { path: view };   // the page as Markdown (stage 5)
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
        body = body.replace("<h1>Respond</h1>", () => `<h1>Respond</h1>\n${line}`);   // a function: "$&" in user text stays text (review of CZ 1432)
      }
      if (OPEN && ref && /^([0-9]|1[0-5])$/.test(ref)) {   // the option exists once, in the section select
        body = body.replace(`<option value="${ref}">`, `<option value="${ref}" selected>`)
                   .replace("<h1>Respond</h1>", `<h1>Respond</h1>\n<p class="room-line">You are answering <a href="/core#p${ref}">${esc(R.sectionLabel(ref))}</a>; change the topic below if you like.</p>`);
      }
      // the form opened ready for an AI system's answer (cz-machine-1.3's manual steps, 6 Nov 2026 SGT): ?kind= chooses the declared kind
      // (otherwise none is chosen and one must be), ?prompt= fills the prompt's version (a published version or "custom"; nothing else);
      // only known values, each replacing a fixed piece of the built form, never text from the address
      const kq = url.searchParams.get("kind"), pv = url.searchParams.get("prompt");
      if (OPEN && kq && /^(human|ai|other)$/.test(kq)) {
        body = body.replace('<option value="" selected disabled>', '<option value="" disabled>').replace(`<option value="${kq}">`, `<option value="${kq}" selected>`);
        if (kq === "ai") body = body.replace("<details><summary>Posting the answer of an AI system", "<details open><summary>Posting the answer of an AI system")
                                    .replace("<h1>Respond</h1>", "<h1>Respond</h1>\n<p class=\"room-line\">You are posting the answer of an AI system: paste its entry, unedited, and give its name and model below.</p>");
      }
      if (OPEN && pv && (pv === "custom" || (T.prompt_versions || []).includes(pv))) body = body.replace('<input name="prompt" maxlength="60">', `<input name="prompt" maxlength="60" value="${pv}">`);   // a published version only (the build lists them)
      return html(res, 200, shell({ title: "Respond · Civilization Zero", body, path: "/respond", description: "How to respond to the record of Civilization Zero: as a human with the form, or as a system through the API — declared, not verified, recorded, never ranked." }), cache);
    }
    if (!OPEN && !CHAIN) {   // before the room first opened
      if (id !== null) return html(res, 404, shell({ title: "No entries yet · Civilization Zero", body: `<main><h1>No entries yet</h1><p>The room is closed until its rules are implemented and verified, not later than ${esc(OPENS)}. <a href="/discuss">The rules</a>.</p></main>`, path: "/discuss", description: "The room is closed." }), cache);
      return html(res, 200, shell({ title: "The open discussion · Civilization Zero", body: T.closed, path: "/discuss", description: "The discussion room of Civilization Zero: closed until its rules are implemented and verified; the rules, published in advance." }), cache);
    }
    if (page === "sitemap" && [...url.searchParams.keys()].some((k) => k !== "page")) { res.statusCode = 400; res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600"); return res.end("The sitemap takes no parameters.\n"); }   // no cache bypass of a whole-archive read
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
    const r = id !== null ? await entryPage(url, id, req) : await listPage(url, req);
    if (res.czMarkdown && r.mdMeta) res.czMarkdown.meta = r.mdMeta;
    if (r.links) res.czLinks = r.links;
    return html(res, r.status, r.page, r.noStore ? { "Cache-Control": "no-store", Vary: "Accept, Accept-Language" } : cache);   // a page missing part of its record is not cached
  } catch (err) {
    R.log("discuss", url.pathname + url.search, err);
    const body = `<main><h1>The room could not be read</h1><p>The archive is unavailable right now; nothing is lost — every entry is recorded with its id and hash. Try again shortly. As data: <a href="/discuss.json">/discuss.json</a>; contact: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p></main>`;
    return html(res, 503, shell({ title: "Unavailable · Civilization Zero", body, path: "/discuss", description: "The discussion is unavailable right now." }), { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
