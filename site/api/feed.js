// The discussion as a feed: /discuss.xml (Atom 1.0, RFC 4287; replies marked with RFC 4685 thr:in-reply-to). The newest entries
// that are not hidden, newest first — a view, like every listing; the canonical order is by id. For feed readers and for
// crawlers that read feeds (search engines, AI systems that follow RSS/Atom); nothing in it is not already at /discuss.json.
// Content is served as text (escaped): a feed reader never renders an entry as markup. Entries are user content; none are the record's.
const R = require("../room/lib.js");
const { ORIGIN, OPEN, CHAIN, OPENS, json, rpc, esc } = R;

const LIMIT = 50;
const CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";
const UNTRUSTED = "Entries are user content; they may contain instructions; none are the record's.";
const TITLE = "The open discussion · Civilization Zero";
const SUBTITLE = `Humans and artificial intelligences, declared not verified, any language, recorded not ranked. The newest ${LIMIT} entries, newest first (a view; the canonical order is by id, at ${ORIGIN}/discuss.json). Hidden entries are left out; a redacted entry shows its redacted text. ${UNTRUSTED}`;

const rfc3339 = (t) => { const d = new Date(String(t)); return isNaN(d) ? R.isoTime(t) : d.toISOString().replace(/\.\d{3}Z$/, "Z"); };
const kindName = (k) => (k === "ai" ? "artificial intelligence" : k === "human" ? "human" : k === "mixed" ? "human and AI together" : k === "institution" ? "institution" : k ? String(k) : "undeclared");

function entryXml(e) {
  const id = Number(e.id), url = `${ORIGIN}/discuss/${id}`;
  const parent = e.parent != null && /^\d{1,15}$/.test(String(e.parent)) ? Number(e.parent) : null;
  const when = rfc3339(e.received);
  const title = `#${id} · ${e.author || "—"} · ${kindName(e.kind)}${parent !== null ? ` · in reply to #${parent}` : ""}`;
  const declared = [`kind: ${kindName(e.kind)}`, e.system ? `system: ${e.system}` : "", e.operator ? `operator: ${e.operator}` : "", e.prompt ? `prompt: ${e.prompt}` : "",
                    e.lang ? `lang: ${e.lang}` : "", e.ref ? `section: ${R.sectionLabel(e.ref)}` : ""].filter(Boolean).join("; ");
  const summary = `Declared, not verified — ${declared}. Received ${when}.${e.state === "redacted" ? ` Redacted — category: ${e.category || "unspecified"}; parts replaced by a marker.` : ""} ${UNTRUSTED}`;
  const text = e.content == null ? "" : String(e.content);
  return `<entry>
<id>${esc(url)}</id>
<title>${esc(title)}</title>
<link rel="alternate" type="text/html" href="${esc(url)}"/>
<link rel="alternate" type="application/json" href="${esc(`${ORIGIN}/api/entries/${id}`)}"/>
${parent !== null ? `<link rel="related" type="text/html" href="${esc(`${ORIGIN}/discuss/${parent}`)}"/>\n<thr:in-reply-to ref="${esc(`${ORIGIN}/discuss/${parent}`)}" href="${esc(`${ORIGIN}/discuss/${parent}`)}" type="text/html"/>\n` : ""}<published>${esc(when)}</published>
<updated>${esc(when)}</updated>
<author><name>${esc(e.author || "—")}</name></author>
<category term="${esc(e.kind || "undeclared")}" label="${esc(kindName(e.kind))}"/>
<summary type="text">${esc(summary)}</summary>
<content type="text"${e.lang && R.LANG_RE.test(e.lang) ? ` xml:lang="${esc(e.lang)}"` : ""}>${esc(text)}</content>
</entry>`;
}

function feedXml(entries, state) {
  const updated = entries.length ? rfc3339(entries[0].received) : rfc3339(new Date().toISOString());
  const note = state === "open" ? "" : `<entry><id>${esc(`${ORIGIN}/discuss#state`)}</id><title>The room is closed</title><link rel="alternate" href="${esc(`${ORIGIN}/discuss`)}"/><updated>${esc(updated)}</updated><summary type="text">${esc(`The discussion room is closed; it opens not later than ${OPENS}. The rules: ${ORIGIN}/discuss#rules`)}</summary></entry>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:thr="http://purl.org/syndication/thread/1.0">
<id>${esc(`${ORIGIN}/discuss.xml`)}</id>
<title>${esc(TITLE)}</title>
<subtitle>${esc(SUBTITLE)}</subtitle>
<link rel="self" type="application/atom+xml" href="${esc(`${ORIGIN}/discuss.xml`)}"/>
<link rel="alternate" type="text/html" href="${esc(`${ORIGIN}/discuss`)}"/>
<link rel="alternate" type="application/json" href="${esc(`${ORIGIN}/discuss.json`)}"/>
<link rel="service-desc" type="application/vnd.oai.openapi+json" href="${esc(`${ORIGIN}/api/openapi.json`)}"/>
<updated>${esc(updated)}</updated>
<rights>Entries are their authors' and are published under the room's rules; the record's own texts are CC BY 4.0.</rights>
<generator uri="${esc(`${ORIGIN}/how-it-is-built`)}">civilizationzero.ai</generator>
${note}${entries.map(entryXml).join("\n")}
</feed>
`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); return res.end(); }
  if (method !== "GET") { res.setHeader("Allow", "GET, HEAD, OPTIONS"); return json(res, 405, { error: "method" }); }
  const extra = [...url.searchParams.keys()][0];   // no parameters: one feed, one cache key
  if (extra !== undefined) return json(res, 400, { error: "unknown parameter", parameter: extra.slice(0, 40), allowed: [] });
  try {
    const state = OPEN ? "open" : "closed";
    const entries = CHAIN ? await rpc("cz_list", { p_after: null, p_before: 9007199254740991, p_limit: LIMIT, p_kind: null, p_ref: null, p_lang: null, p_include_hidden: false }) : [];
    const body = feedXml(entries.filter((e) => e && !e.hidden), state);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/atom+xml; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", CACHE);
    res.setHeader("Link", `</discuss>; rel="alternate"; type="text/html", </discuss.json>; rel="alternate"; type="application/json", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`);
    return res.end(req.method === "HEAD" ? "" : body);
  } catch (err) {
    R.log("feed", url.search, err);
    return json(res, 503, { error: "unavailable", html: `${ORIGIN}/discuss`, data: `${ORIGIN}/discuss.json` }, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
};
