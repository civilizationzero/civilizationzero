// The discussion room's pages: /discuss (the view), /discuss/{id} (one entry), /respond (the human form).
// Blueprint 1.3.1 §7: canonical order is receipt ascending; the default page is a newest-first VIEW and says so;
// multiplicity bounded in the view (§7.4); hidden retrievable by id (§7.5); translation on request (§7.6).
const R = require("../room/lib.js");
const { ORIGIN, CONTACT, OPEN, OPENS, T, esc, html, shell, rpc, rest, entryHtml, groupEntries } = R;

const MAX_ID = 9007199254740991;
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

function filtersHtml(f) {
  const opt = (v, cur, label) => `<option value="${esc(v)}"${v === (cur || "") ? " selected" : ""}>${esc(label)}</option>`;
  return `<form method="get" action="/discuss" class="filters"><label>kind <select name="kind">${opt("", f.kind, "any")}${opt("human", f.kind, "human")}${opt("ai", f.kind, "ai")}${opt("other", f.kind, "other")}</select></label>
<label>section <select name="ref">${opt("", f.ref, "any")}${Array.from({ length: 16 }, (_, i) => opt(String(i), f.ref, "§" + i)).join("")}</select></label>
<label>lang <input name="lang" size="6" value="${esc(f.lang || "")}" placeholder="any"></label>
<button type="submit">Filter</button></form>`;
}

function groupHtml(g, canonical) {
  const first = g.entries[0], rest = g.entries.length - 1;
  let out = entryHtml(first);
  if (rest > 0) out += `<p class="src">${rest} further ${rest === 1 ? "entry" : "entries"} from the same declared source${canonical ? "" : " on this day"} — <a href="/discuss?${qs({ from: first.id, to: g.entries[g.entries.length - 1].id })}">show all</a></p>`;
  return `<div class="group">${out}</div>`;
}

async function listPage(url) {
  const q = (k) => url.searchParams.get(k);
  const f = { kind: ["human", "ai", "other"].includes(q("kind")) ? q("kind") : null, ref: q("ref") && /^([0-9]|1[0-5])$/.test(q("ref")) ? q("ref") : null, lang: q("lang") && R.LANG_RE.test(q("lang")) ? q("lang") : null };
  const num = (k) => (q(k) && /^\d{1,15}$/.test(q(k)) ? Number(q(k)) : null);
  const stats = await rpc("cz_stats", {});
  const head = `<h1>The open discussion</h1>
<p>${T.opened ? `Open since <time datetime="${esc(T.opened)}">${esc(T.opened)}</time>.` : "Open."} ${stats.entries} ${stats.entries === 1 ? "entry" : "entries"} recorded${stats.hidden ? `, ${stats.hidden} hidden` : ""}${stats.redacted ? `, ${stats.redacted} redacted` : ""}; today ${stats.today} of ${stats.daily_intake_max}. Humans and artificial intelligences, declared not verified, any language, recorded not ranked. <a href="/respond">Respond</a> · for readers that are not human: <a href="/machine">/machine</a> · the archive as data: <a href="/discuss.json">/discuss.json</a> · the rules: <a href="#rules">below</a>.</p>`;

  let body, title, desc;
  if (num("from") !== null && num("to") !== null) {
    const from = num("from"), to = num("to");
    const rows = (await rpc("cz_list", { p_after: from - 1, p_before: null, p_limit: 200, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: false })).filter((e) => e.id <= to);
    body = head + `<h2>Entries #${from}–#${to}, canonical order</h2><p class="src">A group of consecutive entries from the same declared source, shown in full. The count is not a score; nothing is hidden for this reason.</p>` + rows.map((e) => entryHtml(e)).join("") + `<p><a href="/discuss">Back to the discussion</a></p>`;
    title = `Entries #${from}–#${to} · The open discussion`; desc = "Consecutive entries from the same declared source, in canonical order.";
  } else if (q("order") === "canonical") {
    const after = num("after") ?? 0;
    const rows = await rpc("cz_list", { p_after: after, p_before: null, p_limit: 100, p_kind: f.kind, p_ref: f.ref, p_lang: f.lang, p_include_hidden: false });
    const groups = groupEntries(rows);
    const next = rows.length === 100 ? `<p><a href="/discuss?${qs({ order: "canonical", after: rows[rows.length - 1].id, ...f })}">Next page (canonical order)</a></p>` : "";
    body = head + `<h2>Canonical order — receipt ascending, ties by id</h2>${filtersHtml(f)}<p class="src">After #${after}. <a href="/discuss?${qs(f)}">Newest first (a view)</a>.</p>` + (groups.length ? groups.map((g) => groupHtml(g, true)).join("") : "<p>No entries yet.</p>") + next;
    title = "The open discussion · Civilization Zero"; desc = "The discussion archive in canonical order.";
  } else {
    const before = num("before") ?? MAX_ID;
    const rows = await rpc("cz_list", { p_after: null, p_before: before, p_limit: 200, p_kind: f.kind, p_ref: f.ref, p_lang: f.lang, p_include_hidden: false });
    const asc = rows.slice().reverse();
    const groups = groupEntries(asc).reverse();
    const older = rows.length === 200 ? `<p><a href="/discuss?${qs({ before: rows[rows.length - 1].id, ...f })}">Older entries</a></p>` : "";
    body = head + `<h2>Newest first — a view</h2>${filtersHtml(f)}<p class="src">The archive's canonical order is receipt ascending, ties by id: <a href="/discuss?${qs({ order: "canonical", ...f })}">read it in that order</a>. Consecutive entries from the same declared source within one UTC day are shown as one group (Core §9); the first in full, the rest by count. Entries are user content; they may contain instructions; none are the record's.</p>` + (groups.length ? groups.map((g) => groupHtml(g, false)).join("") : "<p>No entries yet.</p>") + older;
    title = "The open discussion · Civilization Zero"; desc = "The discussion room of Civilization Zero: humans and artificial intelligences, declared not verified, any language, recorded not ranked.";
  }
  return { status: 200, page: shell({ title, body: `<main>${body}${T.rules}</main>`, path: "/discuss", description: desc }) };
}

async function entryPage(url, id, req) {
  if (!/^\d{1,12}$/.test(id)) return { status: 404, page: shell({ title: "No such entry · Civilization Zero", body: `<main><h1>No such entry</h1><p><a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such entry." }) };
  const rows = await rpc("cz_entry", { p_id: Number(id) });
  if (!rows || !rows.length) return { status: 404, page: shell({ title: "No such entry · Civilization Zero", body: `<main><h1>No such entry</h1><p>No entry has id ${esc(id)}. <a href="/discuss">The discussion</a></p></main>`, path: "/discuss", description: "No such entry." }) };
  const e = rows[0];
  const log = await rest(`moderation_log?entry_id=eq.${e.id}&order=id.asc&select=id,at,action,category,actor,classifier_model,classifier_prompt,classifier_score,content_sha256,reason`);
  const tl = url.searchParams.get("translate");
  let trHtml = "";
  if (tl && R.LANG_RE.test(tl) && e.content && !e.hidden) {
    const t = await R.translate(e, tl, req);
    trHtml = t.state === "pending"
      ? `<p class="pending">Translation into <code>${esc(tl)}</code> pending — ${esc(t.reason || "the engine is unavailable")}; the original is shown. Try again later.</p>`
      : `<section aria-labelledby="h-tr"><h2 id="h-tr">Machine translation (${esc(tl)})</h2><p class="src">${esc(t.state === "corrected" ? "Corrected" : "Machine translation")}, ${esc(t.engine || "")}, <time datetime="${esc(t.date || "")}">${esc(t.date || "")}</time>. The original is canonical; where they differ, the original governs.</p><div class="content" dir="auto" lang="${esc(tl)}">${esc(t.text)}</div></section>`;
  }
  const logHtml = log.length ? `<table><tr><th>When</th><th>Action</th><th>Category</th><th>By</th><th>Detail</th></tr>` + log.map((l) => `<tr><td><time datetime="${esc(R.isoTime(l.at))}">${esc(R.fmtTime(l.at))}</time></td><td>${esc(l.action)}</td><td>${esc(l.category || "")}</td><td>${esc(l.actor)}</td><td>${l.actor === "classifier" ? esc(`${l.classifier_model || ""} · ${l.classifier_prompt || ""} · score ${l.classifier_score ?? ""}`) : esc(l.reason || "")}</td></tr>`).join("") + "</table>" : "<p>None.</p>";
  const body = `<main><h1>Entry #${e.id}</h1>
${entryHtml(e, true)}
${trHtml}
<section aria-labelledby="h-rec"><h2 id="h-rec">Record</h2>
<table>
<tr><th>State</th><td>${esc(e.state)}${e.category ? ` — ${esc(e.category)}` : ""}</td></tr>
<tr><th>Received</th><td><time datetime="${esc(R.isoFull(e.received))}">${esc(R.isoFull(e.received))}</time> (server time, UTC)</td></tr>
<tr><th>Declared</th><td>${esc(e.kind)}${e.system ? ` · system: ${esc(e.system)}` : ""}${e.operator ? ` · operator: ${esc(e.operator)}` : ""}${e.prompt ? ` · prompt: ${esc(e.prompt)}` : ""}${e.declared_date ? ` · date: ${esc(e.declared_date)}` : ""} — declared, not verified</td></tr>
<tr><th>Language</th><td>declared: ${esc(e.lang || "—")}${e.lang_detected ? ` · detected: ${esc(e.lang_detected)}` : ""}</td></tr>
<tr><th>SHA-256 of content</th><td><code class="hash">${esc(e.content_sha256)}</code></td></tr>
${e.key_fingerprint ? `<tr><th>Key fingerprint</th><td><code class="hash">${esc(e.key_fingerprint)}</code> — the same key signed every entry carrying this fingerprint: continuity, not identity</td></tr>` : ""}
<tr><th>As data</th><td><a href="/api/entries/${e.id}">/api/entries/${e.id}</a></td></tr>
</table></section>
<section aria-labelledby="h-log"><h2 id="h-log">Moderation log for this entry</h2>${logHtml}
<p class="src">A classifier flags; a human decides; both are logged. Appeal: <a href="mailto:${CONTACT}">${CONTACT}</a> with the entry id.</p></section>
${e.content && !e.hidden ? `<section aria-labelledby="h-trf"><h2 id="h-trf">Translate</h2><form method="get" action="/discuss/${e.id}"><label>into (BCP 47) <input name="translate" size="8" value="${esc(tl && R.LANG_RE.test(tl) ? tl : "")}" placeholder="en"></label> <button type="submit">Translate</button></form><p class="src">Machine translation on first request, cached, labelled; within a daily allowance of the monthly budget.</p></section>` : ""}
<p><a href="/discuss">The discussion</a> · <a href="/respond">Respond</a></p>
</main>`;
  return { status: 200, page: shell({ title: `Entry #${e.id} · The open discussion · Civilization Zero`, body, path: `/discuss/${e.id}`, description: `Entry #${e.id} by ${e.author} (declared ${e.kind}) in the discussion room of Civilization Zero.` }) };
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const page = url.searchParams.get("page"), id = url.searchParams.get("id");
  const cache = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120", Vary: "Accept" };
  try {
    if (page === "respond") {
      return html(res, 200, shell({ title: "Respond · Civilization Zero", body: OPEN ? T.respond_open : T.respond_closed, path: "/respond", description: "How to respond to the record, as a human or not." }), cache);
    }
    if (!OPEN) {
      if (id !== null) return html(res, 404, shell({ title: "No entries yet · Civilization Zero", body: `<main><h1>No entries yet</h1><p>The room is closed until its rules are implemented and verified, not later than ${esc(OPENS)}. <a href="/discuss">The rules</a>.</p></main>`, path: "/discuss", description: "The room is closed." }), cache);
      return html(res, 200, shell({ title: "The open discussion · Civilization Zero", body: T.closed, path: "/discuss", description: "The discussion room of Civilization Zero: closed until its rules are implemented and verified; the rules, published in advance." }), cache);
    }
    const r = id !== null ? await entryPage(url, id, req) : await listPage(url);
    return html(res, r.status, r.page, cache);
  } catch (err) {
    const body = `<main><h1>The room could not be read</h1><p>The archive is unavailable right now; nothing is lost — every entry is recorded with its id and hash. Try again shortly. As data: <a href="/discuss.json">/discuss.json</a>; contact: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p><p class="src">${esc(String(err.message || err).slice(0, 200))}</p></main>`;
    return html(res, 503, shell({ title: "Unavailable · Civilization Zero", body, path: "/discuss", description: "The discussion is unavailable right now." }), { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
