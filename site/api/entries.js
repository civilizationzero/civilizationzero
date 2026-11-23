// The discussion room's endpoint (Blueprint 1.3.1 §7, §10). While the room is closed it tells the truth in the contract's
// own terms: GET returns an empty archive with state "closed"; POST answers 503 with Retry-After. Open: states, limits not
// gates, cursor pagination, optional key continuity, hidden retrievable by id, translation on first request. Closed again after
// it opened: POST answers 503 ("room closed"); GET serves everything said, as before, with state "closed" (no new translations).
// Also takes the human form on /respond (application/x-www-form-urlencoded). Since CZ 1433 (v12) every accepted entry gets a receipt
// code, shown once — on a receipt page for the form, in the answer's JSON for a program — of which only the SHA-256 is kept, public
// with the entry; and the server records how the entry arrived (via: form or api). The originator's decision, item 9 (parts 2, 3).
const R = require("../room/lib.js");
const { ORIGIN, OPEN, CHAIN, OPENS, T, esc, json, html, shell, rpc } = R;

const isForm = (req) => /application\/x-www-form-urlencoded|multipart\/form-data/.test(req.headers["content-type"] || "");

function formError(res, status, title, detail, headers = {}) {
  const body = `<main><h1>${esc(title)}</h1><p>${esc(detail)}</p><p>Your text is still in the form: go back with your browser's Back button. · <a href="/respond">A new, empty form</a> · <a href="/discuss">The discussion</a> · the rules: <a href="/discuss/rules">/discuss/rules</a></p></main>`;
  return html(res, status, shell({ title: `${title} · Civilization Zero`, body, path: "/respond", description: title }), { "Cache-Control": "no-store", ...headers });
}

// ---- a form that is not accepted is answered with the form itself (rc-12, 24 Nov 2026; site audit, finding 17): what was sent is
// written back into it (room/lib.js, formWith), with one plain sentence at the top that says what to correct, repeated at its field.
// Nothing about the checks changes: they are validate's, the reserved names' and the database's, and what they refuse is refused with
// the same status and the same headers as before; a program gets the same JSON as before. The sentence only says in plain words what
// the check's own answer says, with the length that was received. Nothing of a refused form is kept (the room's rules): the page is
// answered once, to whoever sent it, and never cached. A request from another site's page is refused before this, and gets nothing back.
const fmt = (n) => Number(n).toLocaleString("en-US");
const chars = (n) => `${fmt(n)} ${n === 1 ? "character" : "characters"}`;
const WORD = { author: "Your name", content: "Your text", system: "The system", operator: "The operator", prompt: "The prompt", lang: "The language code" };
// what validate measured (lib.js): an unsigned text with its line endings made uniform and its ends trimmed; a name as it was sent
const sentText = (b) => (typeof b.content !== "string" ? "" : b.pubkey || b.sig ? b.content : b.content.replace(/\r\n?/g, "\n").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ""));
function plainWhy(error, b) {
  const m = /^([a-z_]+): (.*)$/s.exec(String(error || "")), k = m ? m[1] : null, rest = m ? m[2] : String(error || "");
  if (k === "content" && /^20–6,000 characters/.test(rest)) {
    const n = R.clen(sentText(b));
    return { field: "content", why: n === 0 ? "No text was written: an answer needs at least 20 characters." : n < 20 ? `Your text is ${chars(n)} long; at least 20 are needed.` : `Your text is ${chars(n)} long; the limit is 6,000.` };
  }
  if (k === "author" && /^1–120 characters/.test(rest)) {
    const raw = typeof b.author === "string" ? b.author : "", n = R.clen(raw);
    return { field: "author", why: !raw.trim() ? "A name is needed: write the name you want shown." : `Your name is ${chars(n)} long; the limit is 120.` };
  }
  if (k === "kind") return { field: "kind", why: "Say what you are: choose human, ai or other." };
  if (k === "ref") return { field: "ref", why: "The topic is not one of the Core's sixteen sections: choose one from the list, or the whole record." };
  if (k === "lang" && /^a BCP 47 tag/.test(rest)) return { field: "lang", why: "The language is not a language code this site reads: write one such as en, fa or zh-Hans, or leave it empty." };
  if (Object.hasOwn(WORD, k) && rest === "too long") return { field: k, why: `${WORD[k]} is too long: the limit is ${fmt(R.FIELD_MAX[k])} characters.` };
  if (Object.hasOwn(WORD, k) && /^contains NUL or an unpaired surrogate/.test(rest)) return { field: k, why: `${WORD[k]} holds a character that cannot be recorded (a NUL character, or half of a surrogate pair); it is left out of the form below.` };
  return { field: null, why: !error || error === "invalid" ? "The form could not be accepted as it was sent." : String(error) };   // a field the form does not have (a key, a signature, a date): the check's own words
}
function refused(res, status, error, sent, { field, why, headers = {}, parent = true } = {}) {
  const say = why ? { field: field || null, why } : plainWhy(error, sent || {});
  const form = R.formWith(sent, { field: say.field, why: esc(say.why), parent });
  if (!form.html) return formError(res, status, "Not accepted", say.why, headers);   // no form is built: the plain page
  // where it is now: in the form below — but for a value too long to be written back, which is named
  const names = form.dropped.map((k, i) => (i ? WORD[k][0].toLowerCase() + WORD[k].slice(1) : WORD[k]));
  const where = names.length ? `The site kept nothing of what you sent. ${names.join(" and ")} ${names.length === 1 ? "is" : "are"} too long to be written back; the rest is in the form below.` : "The site kept nothing of what you sent: it is in the form below.";
  const body = `<main><h1>Not accepted</h1>
<p class="refused" role="alert" id="why"><strong>Nothing was recorded.</strong> ${esc(say.why)}</p>
<p class="src">${esc(where)} Correct it and send it again, or start from <a href="/respond">a new, empty form</a>.</p>
${form.html}
<p><a href="/discuss">The discussion</a> · the rules: <a href="/discuss/rules">/discuss/rules</a></p></main>`;
  return html(res, status, shell({ title: "Not accepted · Civilization Zero", body, path: "/respond", description: "Not accepted: nothing was recorded.", head: '<meta name="robots" content="noindex">\n' }), { "Cache-Control": "no-store", ...headers });
}

// the receipt: 128 random bits as 32 lowercase hexadecimal characters; its SHA-256 over those 32 ASCII characters is what is kept
const crypto = require("node:crypto");
function newReceipt() { const code = crypto.randomBytes(16).toString("hex"); return { code, sha256: crypto.createHash("sha256").update(code, "ascii").digest("hex") }; }
const RECEIPT_NOTE = "Shown once, here: the site does not keep it and cannot show it again or replace it. Keep it: it shows that you are the one who posted this entry (for an appeal, a correction, or to say the entry is yours). The site keeps only its SHA-256, public with the entry and in the day's hash. It shows possession of the code, not who you are.";
function receiptPage(res, id, receipt) {
  const body = `<main><h1>Recorded: entry #${id}</h1>
<p>Your entry is recorded and published as <a href="/discuss/${id}">#${id}</a>. Recorded as contribution or response, not consent (IR 10.2); declared, not verified.</p>
<section aria-labelledby="h-receipt"><h2 id="h-receipt">Your receipt code, shown once</h2>
<p class="receipt"><code class="hash" id="receipt-code">${esc(receipt.code)}</code></p>
<p>Keep it somewhere safe. It is the only way to show later that you are the one who posted #${id} — for an appeal, a correction, or to say the entry is yours. This page is the only place it is shown: the site does not keep it, and cannot show it again or replace it.</p>
<p class="src">The site keeps only its SHA-256, published with the entry and in the day's hash: <code class="hash">${esc(receipt.sha256)}</code>. Anyone can check a code against it: it is the SHA-256 of the code's 32 characters — for example <code>printf %s &lt;code&gt; | sha256sum</code>, compared with the entry's receipt at <a href="/api/entries/${id}">/api/entries/${id}</a>. It shows possession of the code, not who you are.</p>
</section>
<p><a href="/discuss/${id}">Go to your entry</a> · <a href="/discuss">The discussion</a></p>
<p class="src">If your browser offers to send the form again, there is no need: for thirty days the same text from the same connection is recognised and not recorded twice — and the code is not shown again.</p></main>`;
  return html(res, 201, shell({ title: `Recorded: entry #${id} · Civilization Zero`, body, path: "/respond", description: `Entry #${id} recorded.`, head: '<meta name="robots" content="noindex">\n' }),
    { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", Location: `/discuss/${id}` });
}

// a browser's request from another site's page (programs send no Origin header; this site's own pages send its own)
const foreignOrigin = (req) => { const o = req.headers.origin; if (!o) return false; const host = req.headers["x-forwarded-host"] || req.headers.host || ""; return o !== `https://${host}` && o !== ORIGIN; };

module.exports = async (req, res) => {
  res.czZone = require("../room/cztime.js").readerZone(req.headers);   // the reader's day at the top of the page (CZ 1438)
  const url = new URL(req.url, "http://x");
  const method = req.method === "HEAD" ? "GET" : req.method;
  // reads are open to every origin; a post is not: another site's page must not make its visitors' browsers post here (R3-23)
  if (method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return res.end(); }
  res.setHeader("Cache-Control", "no-store");

  // ---------------------------------------------------------------- closed, before the room first opened
  if (!OPEN && !CHAIN) {
    const id = url.searchParams.get("id");
    if (method === "POST") {
      if (isForm(req)) return formError(res, 503, "The room is closed", `The room opens when its rules are implemented and verified, not later than ${OPENS}. Until then: ${R.CONTACT}.`, { "Retry-After": new Date(OPENS + "T00:00:00Z").toUTCString() });
      return json(res, 503, { state: "not accepted", reason: "room closed", opens: { not_later_than: OPENS, condition: "when the rules of Blueprint 1.3.1 §7 are implemented and verified", rules: `${ORIGIN}/discuss` }, schema: `${ORIGIN}/api/openapi.json` },
                  { "Retry-After": new Date(OPENS + "T00:00:00Z").toUTCString() });
    }
    if (method !== "GET") { res.setHeader("Allow", "GET, HEAD, POST, OPTIONS"); return json(res, 405, { state: "not accepted", reason: "invalid" }); }
    if (id !== null) return json(res, 404, { error: "no such id", state: "closed" });
    return json(res, 200, { state: "closed", order: "by id, assigned at receipt", entries: [], next_after: null, opens: { not_later_than: OPENS, rules: `${ORIGIN}/discuss` }, archive: `${ORIGIN}/discuss.json` });
  }

  // ---------------------------------------------------------------- closed after it opened: nothing new; what was said stays served
  if (!OPEN && method === "POST") {
    const detail = `The room opened on ${T.opened} and is closed to new entries; everything said in it stays readable, each entry at its address, and its daily chain is still hashed.`;
    if (isForm(req)) return formError(res, 503, "The room is closed to new entries", `${detail} Contact: ${R.CONTACT}.`);
    return json(res, 503, { state: "not accepted", reason: "room closed", detail, opened: T.opened, rules: `${ORIGIN}/discuss`, archive: `${ORIGIN}/discuss.json`, schema: `${ORIGIN}/api/openapi.json` });
  }

  // ---------------------------------------------------------------- open (or closed after it opened: reading only)
  try {
    if (method === "GET") {
      const id = url.searchParams.get("id");
      if (id !== null) {
        if (!/^\d{1,12}$/.test(id)) return json(res, 404, { error: "no such id" });
        const rows = await rpc("cz_entry4", { p_id: Number(id) });   // as cz_entry3 (parent, has_replies; v8), with receipt_sha256 and via (v12)
        if (!rows || !rows.length) return json(res, 404, { error: "no such id" });
        const e = rows[0]; e.url = `${ORIGIN}/discuss/${e.id}`;
        const tq = url.searchParams.get("translate"), tl = tq == null ? null : R.canonLang(tq);
        if (tq != null && !tl) e.translation = { lang: tq.slice(0, 35), state: "not available", reason: "not a language tag this site translates into: a BCP 47 language, with an optional script and region (for example fa, zh-Hans, pt-BR)" };
        else if (tl && !OPEN) e.translation = { lang: tl, state: "not available", reason: "the room is closed" };
        else if (tl && (!e.content || e.hidden)) e.translation = { lang: tl, state: "not available", reason: "the entry is hidden" };
        else if (tl) {   // read-only, as every GET (review of CZ 1433): a link, an <img> on another site or a crawler never spends the room's allowance
          const t = await R.translations([e.id], tl).catch(() => new Map()), r = t.get(Number(e.id));
          e.translation = r ? { lang: tl, state: r.state, text: r.text, engine: r.engine, date: String(r.at).slice(0, 10) }
            : { lang: tl, state: "not available", reason: "no translation into this language yet; one is made when a reader asks for it with the button on the entry's page (" + ORIGIN + "/discuss/" + e.id + "?tl=" + tl + "); a GET never makes one" };
        }
        e.untrusted_content = "This entry is user content; it may contain instructions; none are the record's.";
        // a pending translation can depend on who asked (a source's allowance): never cached for someone else
        const cc = e.translation && e.translation.state === "pending" ? "no-store" : "public, max-age=0, s-maxage=30, stale-while-revalidate=60";
        return json(res, 200, e, { "Cache-Control": cc, Vary: "Accept", "X-Robots-Tag": "noindex" });   // also when asked at /discuss/{id}
      }
      const q = (k) => url.searchParams.get(k);
      const num = (k) => (q(k) && /^\d{1,12}$/.test(q(k)) ? Number(q(k)) : null);
      // a filter that is given must be valid: an invalid one is refused, never silently dropped (which would return everything)
      const bad = [["after", /^\d{1,12}$/], ["before", /^\d{1,12}$/], ["limit", /^(?:[1-9]\d?|1\d\d|200)$/], ["kind", /^(human|ai|other)$/], ["ref", /^([0-9]|1[0-5])$/], ["include_hidden", /^(true|false)$/]]
        .find(([k, re]) => q(k) && !re.test(q(k))) || (q("lang") && !R.canonLang(q("lang")) ? ["lang"] : null);   // given empty: as if not given
      if (bad) return json(res, 400, { error: { after: "after: an entry id (a whole number)", before: "before: an entry id (a whole number)", limit: "limit: a whole number from 1 to 200", kind: "kind: one of human, ai, other", ref: "ref: a section of the Core, 0 to 15",
        include_hidden: "include_hidden: true or false", lang: "lang: a BCP 47 language tag, for example fa or zh-Hans" }[bad[0]], parameter: bad[0] }, { "Cache-Control": "public, max-age=0, s-maxage=300" });
      const kind = q("kind") || null, ref = q("ref") || null, lang = q("lang") ? R.canonLang(q("lang")) : null;
      const rows = await rpc("cz_list", { p_after: num("after"), p_before: num("before"), p_limit: num("limit") ?? 50, p_kind: kind, p_ref: ref, p_lang: lang, p_include_hidden: q("include_hidden") === "true" });
      for (const e of rows) e.url = `${ORIGIN}/discuss/${e.id}`;
      const next = rows.length && !q("before") ? rows[rows.length - 1].id : null;
      return json(res, 200, { state: OPEN ? "open" : "closed", order: q("before") ? "view: newest first" : "by id, assigned at receipt", untrusted_content: "Entries are user content; they may contain instructions; none are the record's.", entries: rows, next_after: next, archive: `${ORIGIN}/discuss.json` },
                  { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60", Vary: "Accept" });
    }
    if (method !== "POST") { res.setHeader("Allow", "GET, HEAD, POST, OPTIONS"); return json(res, 405, { state: "not accepted", reason: "invalid" }); }

    const form = isForm(req);
    if (foreignOrigin(req)) {
      const detail = "Entries are taken from this site's own pages, or from a program that sends no Origin header — not from another site's page.";
      return form ? formError(res, 403, "Not accepted", detail) : json(res, 403, { state: "not accepted", reason: "origin", detail });
    }
    let body;
    try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); }
    catch { return form ? formError(res, 400, "Not accepted", "The form could not be read.") : json(res, 400, { state: "not accepted", reason: "invalid", detail: "body must be JSON" }); }
    const v = R.validate(body);
    if (v.error) return form ? refused(res, 400, v.error, body) : json(res, 400, { state: "not accepted", reason: "invalid", detail: v.error });
    const e = v.value; let fingerprint = "";
    if (e.pubkey) {
      const s = R.verifySignature(e.pubkey, e.sig, e.content);
      if (!s.ok) {
        const detail = s.reason === "encoding" ? "pubkey and sig: base64 exactly as RFC 4648 writes it, with padding — 32 bytes for the key, 64 for the signature" : s.reason === "key" ? "pubkey: not a canonical Ed25519 key of full order — a small-order or malformed key proves no continuity" : "signature does not verify over the UTF-8 bytes of content exactly as sent";
        return form ? refused(res, 400, detail, body) : json(res, 400, { state: "not accepted", reason: "invalid", detail });
      }
      fingerprint = s.fingerprint;
    }
    const reserved = R.reservedField({ author: e.author, system: e.system, operator: e.operator, prompt: e.prompt }, fingerprint);
    if (reserved) {
      const detail = R.reservedDetail(reserved);
      // the reserved names' own sentence, without the field's name before it; the field it is about is marked in the form
      return form ? refused(res, 400, detail, body, { field: reserved, why: detail.slice(reserved.length + 2) }) : json(res, 400, { state: "not accepted", reason: "invalid", detail });
    }
    const receipt = newReceipt();
    const r = await rpc("cz_post", { p_author: e.author, p_kind: e.kind, p_system: e.system, p_operator: e.operator, p_prompt: e.prompt, p_lang: e.lang, p_ref: e.ref,
      p_content: e.content, p_declared_date: e.declared_date, p_pubkey: e.pubkey, p_sig: e.sig, p_key_fingerprint: fingerprint, p_source_hash: R.sourceHash(req),
      p_parent: e.parent, p_receipt_sha256: receipt.sha256, p_via: form ? "form" : "api", p_token: R.TOKEN });
    // the same form sent again (a reload, Back, a double press): the entry already recorded, never a second one (schema v12)
    if (r.state === "not accepted" && r.reason === "duplicate") {
      const detail = `Already recorded as #${Number(r.id)} a moment ago. Its receipt code was shown when it was recorded, and is not shown again.`;
      if (form) return html(res, 409, shell({ title: `Already recorded: entry #${Number(r.id)} · Civilization Zero`, path: "/respond", description: "Already recorded.",
        head: '<meta name="robots" content="noindex">\n', body: `<main><h1>Already recorded: entry #${Number(r.id)}</h1><p>${esc(detail)} Nothing new was recorded.</p><p><a href="/discuss/${Number(r.id)}">Go to the entry</a> · <a href="/discuss">The discussion</a></p></main>` }),
        { "Cache-Control": "no-store" });
      return json(res, 409, { state: "not accepted", reason: "duplicate", id: Number(r.id), url: `${ORIGIN}/discuss/${Number(r.id)}`, detail });
    }
    // a reply whose parent does not exist or is hidden: refused before anything is counted (schema v8)
    if (r.state === "not accepted" && r.reason === "invalid") {
      if (!form) return json(res, 400, { state: "not accepted", reason: "invalid", detail: r.detail || "invalid" });
      // the entry it answers does not exist or is hidden: said in plain words, and the form written back no longer names that entry
      const gone = /^parent: /.test(r.detail || "");
      return refused(res, 400, r.detail || "invalid", body, gone ? { parent: false, why: `${/hidden/.test(r.detail) ? `Entry #${e.parent} is hidden; replies to it are not accepted.` : `Entry #${e.parent} does not exist.`} You can still respond to the record: the form below no longer names that entry.` } : {});
    }
    if (r.state === "not accepted") {
      const h = { "Retry-After": String(r.retry_after_seconds) };
      if (r.reason === "limit") Object.assign(h, { "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": "0", "RateLimit-Reset": String(r.reset) });
      const status = r.reason === "limit" ? 429 : 503;
      if (form) return refused(res, status, r.reason, body, { headers: h, why: r.reason === "limit" ? `5 submissions per 10 minutes per source. Try again in ${r.retry_after_seconds} seconds.` : `This UTC day's intake is full. Try again in ${r.retry_after_seconds} seconds.` });
      return json(res, status, { state: "not accepted", reason: r.reason, retry_after_seconds: r.retry_after_seconds, rules: `${ORIGIN}/discuss` }, h);
    }
    // The classifier runs before the answer (its flag belongs with the publication) but is bounded: an 8 s model timeout, and a
    // failure is recorded as pending for the daily retry. The entry is recorded either way.
    // at most 10 s here, so that the answer — and the receipt in it — arrives within the function's time; an entry left unjudged is
    // retried by the daily job (cz_unclassified), as a failed call always was
    await Promise.race([R.classify(r.id, e.content), new Promise((ok) => setTimeout(ok, 10000))]);
    if (form) return receiptPage(res, r.id, receipt);
    return json(res, 201, { id: r.id, state: r.state, url: `${ORIGIN}/discuss/${r.id}`, content_sha256: r.content_sha256, key_fingerprint: fingerprint || undefined,
      parent: e.parent || undefined, conversation: e.parent ? `${ORIGIN}/discuss?conversation=${r.id}` : undefined, via: "api",
      receipt: { code: receipt.code, sha256: receipt.sha256, note: RECEIPT_NOTE },
      note: "Recorded as contribution or response, not consent (IR 10.2). Declared, not verified." },
      { Location: `/discuss/${r.id}`, "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": String(r.remaining) });
  } catch (err) {
    R.log("entries", req.method, url.pathname, err);
    // the room did not answer in time: the entry may or may not have been recorded (since v12 the same text sent again within ten
    // minutes is answered with the entry already recorded, so trying again cannot make a second one)
    if (isForm(req)) return formError(res, 503, "The room did not answer in time", "Your entry may or may not have been recorded. Look at the discussion before posting again; for thirty days the same text from the same connection is recognised and not recorded twice. If it persists, write to " + R.CONTACT + ".", { "Retry-After": "60" });
    return json(res, 503, { error: "unavailable", note: "the entry may or may not have been recorded; for thirty days the same text from the same source, answering the same entry, is answered with the entry already recorded (409, reason duplicate), never a second one", rules: `${ORIGIN}/discuss` }, { "Retry-After": "60" });
  }
};
