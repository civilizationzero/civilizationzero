// The first page, filled at request time: the day, the day's figure and the as-of time must be right for every reader at every
// moment, with no script on the reader's side (Blueprint 1.3.1 §5.1). Everything else on the page is static and comes from
// site/build.py via home-templates.json. CZ time counts days: nothing here counts years (24 Nov 2026, CZ 1455).
const T = require("./home-templates.json");
const CZ = require("../room/cztime.js");   // CZ time (the originator's decision of 30 Oct 2026): the page's calendar line is today's date in it
const FIG = require("../room/figure.js");   // the day's figure: sixteen rings, computed from the Core's SHA-256 and the day
const K = FIG.constants(T.figure.core_sha256);   // the rings' constants, from the hash the build computed from the Core's bytes; nothing is hashed here

const pad = (n) => String(n).padStart(2, "0");
const fmt = (n) => n.toLocaleString("en-US");

// now: the moment (the as-of time is in UTC); local: the reader's wall clock read in UTC (room/cztime.js, localMs), for the count of
// days, so that the day turns at midnight where the reader is (the originator's decision of 7 Nov 2026, CZ 1438)
function clock(now, local, zone) {
  const f = CZ.fields(local), D = f.D;
  return {
    "__TOTAL__": String(D), "__TOTAL_FMT__": fmt(D),
    "__ASOF_ISO__": `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}Z`,
    "__CZ_ISO__": f.ISO, "__CZ_STAMP__": f.STAMP, "__CZ_ZONE__": zone, "__CZ_UTC_ISO__": now.toISOString().slice(0, 10),
    "__FIG_RINGS__": FIG.rings(D, K),                             // the page: the sixteen arcs of the reader's day
    "__FIG_POS__": `[${FIG.positions(D, K).join(", ")}]`,         // the data form: where each ring stands that day
  };
}

// The same rule the host applies to every other page (vercel.json, R3-13): a format is chosen only when it is asked for
// without q=0, and HTML wins whenever HTML is acceptable, so a browser always gets the page. "*/*" gets HTML.
const Q0 = String.raw`\s*;\s*q\s*=\s*0(?:\.0{0,3})?\s*(?:,|$)`;
const WANTS = (type) => new RegExp(String.raw`^(?!.*text/html(?!${Q0}))(?!.*${type}${Q0}).*${type}.*`);
const JSON_RE = WANTS("application/json"), TXT_RE = WANTS("text/plain"), MD_RE = WANTS("text/markdown");
const negotiate = (accept) => JSON_RE.test(accept) ? "json" : TXT_RE.test(accept) ? "txt" : MD_RE.test(accept) ? "md" : "html";
// the speculation rules in the page (stage 5, CZ 1433) are data, allowed by their hash, read from the template as built
const SPEC_HASHES = [...String(T.html || "").matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${require("node:crypto").createHash("sha256").update(m[1], "utf8").digest("base64")}'`);

// One pass over the template: every placeholder is replaced where it stands, and nothing put in is read again — an entry's text that
// spells a placeholder stays as its author wrote it (as room/lib.js fills its shell)
function fill(s, c) {
  const keys = Object.keys(c).sort((a, b) => b.length - a.length);
  return s.replace(new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"), (m) => String(c[m]));
}

// One answer to the short invitation, in the third step (the originator's decision of 23 Nov 2026): of the latest 60 entries that are
// published, screened and with no decision pending — the most the database's function gives — the newest declared as an AI's and as an
// answer to the short invitation (room/lib.js, example). Read from the database at request time, within 1.5 seconds; if the database is
// slow or down, every form is served without it (the clock never waits on the room). The room's code is loaded only here. Since
// 24 Nov 2026 the same answer stands in all four forms, so that they say the same; the page no longer shows a count of entries or the
// latest ones, and asks the database for nothing else.
const ROOM_MS = 1500, EXAMPLE_ROWS = 60;
const HAS_ROOM = [T.html, T.json, T.txt].some((t) => String(t).includes("__ROOM_"));
async function room() {
  const R = require("../room/lib.js");
  const got = await R.rpc("cz_home_latest", { p_limit: EXAMPLE_ROWS });
  return R.example(Array.isArray(got) ? got : []);
}
async function roomOrNothing() {
  if (!HAS_ROOM) return null;
  let timer;
  try {
    return await Promise.race([room(), new Promise((resolve) => { timer = setTimeout(() => resolve(null), ROOM_MS); })]);
  } catch (e) {
    console.error(JSON.stringify({ at: "home.room", error: String(e && e.message || e).slice(0, 200) }));
    return null;
  } finally { clearTimeout(timer); }
}
// The answer as a member of the data form's third step: user content, so every character a line could be reordered or broken by is
// written as a JSON escape (the value parsed is the text as received); indented as the template is, eight spaces deep.
const UNSAFE = /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
function answerJson(x) {
  const o = { id: x.id, author: x.author, kind: "ai", prompt: "cz-short-1.0", [x.cut ? "beginning" : "text"]: x.text, url: `https://civilizationzero.ai/api/entries/${x.id}` };
  return ',\n        "recent_answer": ' + JSON.stringify(o, null, 2).replace(UNSAFE, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).replace(/\n/g, "\n        ");
}

const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");   // text between tags
const lineHtml = (l) => `<span>${l.split(" ").map((w) => `<span>${escText(w)}</span>`).join(" ")}</span>`;   // a line and its words
const LINK = '</index.json>; rel="alternate"; type="application/json", </index.txt>; rel="alternate"; type="text/plain", </index.md>; rel="alternate"; type="text/markdown", </api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"';
// What this function answers a client that asks for the data form: its headers, in the order it sets them. At most five minutes in a
// cache, and never past midnight in the reader's time zone, when the day turns; each zone's copy apart. The data and text forms name
// the page as canonical.
const dataHead = (type, ttl, vary) => [["Content-Type", type], ["Cache-Control", `public, max-age=0, s-maxage=${ttl}`], ["Vary", vary],
  ["Link", `<https://civilizationzero.ai/>; rel="canonical", ${LINK}`], ["X-Content-Type-Options", "nosniff"], ["Access-Control-Allow-Origin", "*"]];

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  let f = url.searchParams.get("f");
  if (!f) f = negotiate(String(req.headers["accept"] || ""));
  const md = f === "md";   // the page as Markdown (/index.md, or Accept: text/markdown): the HTML page, converted (room/md.js)
  if (md) f = "html";
  if (!(Object.hasOwn(T, f) && typeof T[f] === "string")) f = "html";   // ?f=constructor, ?f=figure and the like: only a form is a form (review of CZ 1432)
  const now = new Date(), zone = CZ.readerZone(req.headers);   // the reader's date: their network's time zone, read and kept nowhere
  const c = clock(now, CZ.localMs(now.getTime(), zone), zone);
  const ttl = Math.min(300, CZ.secondsToNextLocalDay(now.getTime(), zone)), vary = CZ.varyZone("Accept");
  const x = await roomOrNothing();
  const R = x ? require("../room/lib.js") : null;
  const send = (head, body) => { res.statusCode = 200; for (const [k, v] of head) res.setHeader(k, v); res.end(body); };
  // What this address answers a client that asks for application/json, at this moment and for this reader: its head and its body.
  // The data form is exactly that; the page and its text form show it — the same status, the same headers in the same order, the same
  // bytes — as the reading for readers that are not human (24 Nov 2026). Nothing shown there is written anywhere else.
  const head = dataHead("application/json; charset=utf-8", ttl, vary), body = fill(T.json, { ...c, "__ROOM_ANSWER__": x ? answerJson(x) : "" });
  if (f === "json") return send(head, body);
  const lines = ["200", ...head.map(([k, v]) => `${k}: ${v}`)];
  if (f === "txt") return send(dataHead("text/plain; charset=utf-8", ttl, vary), fill(T.txt, { ...c, "__ROOM_EXAMPLE__": x ? R.exampleText(x) : "", "__HOME_HEAD__": lines.join("\n"), "__HOME_JSON__": body }));
  // in the page: each line of the head an element of its own, so that a glimpse can end it with an ellipsis, and each of its words
  // one too, so that a line too long for a phone folds between words and never inside one; the body as text, its day marked as the
  // page marks the day
  const page = fill(T.html, { ...c, "__ROOM_EXAMPLE__": x ? R.exampleHtmlOf(x) : "", "__HOME_HEAD__": lines.map(lineHtml).join("\n"),
    "__HOME_JSON__": escText(body).replace(`"day": ${c.__TOTAL__},`, `"day": <b class="d">${c.__TOTAL__}</b>,`) });
  if (md) {
    const MD = require("../room/md.js");
    return MD.sendMarkdown(res, 200, MD.htmlToMarkdown(page, { path: "/" }), "/", "https://civilizationzero.ai",
      { "Cache-Control": `public, max-age=0, s-maxage=${ttl}`, Vary: vary });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
  res.setHeader("Vary", vary);
  res.setHeader("Link", LINK);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // the page: nothing loads from elsewhere, no script, no framing (as every page)
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" + (SPEC_HASHES.length ? `; script-src ${SPEC_HASHES.join(" ")}` : ""));
  res.end(require("../room/weight.js").fillWeight(page));   // the line at the foot: this page's weight as it is sent
};

module.exports.negotiate = negotiate;
