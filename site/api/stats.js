// /stats and /stats.json: the visit counts (schema v9), public — the site keeps no other record of its readers.
// Counted by the routing middleware (middleware.js) before the cache: page views by browsers, the number of distinct visitors per
// UTC day (from a hash under a salt that lives one day; the hashes and the salt are deleted at the end of the day), referring
// domains, countries (Vercel's two-letter code), and automated clients by kind, counted apart. No cookie, no identifier, no script.
"use strict";
const R = require("../room/lib.js");
const CZ = require("../room/cztime.js");
const { esc, rpc, json, html, shell } = R;

const n = (x) => Number(x || 0).toLocaleString("en-US");
const table = (head, rows) => rows.length ? `<div class="scroll"><table><thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : "<p>None yet.</p>";
const BOT_NAMES = { google: "Google", bing: "Bing", yandex: "Yandex", baidu: "Baidu", duckduckgo: "DuckDuckGo", apple: "Apple", anthropic: "Anthropic (Claude)", openai: "OpenAI (ChatGPT, GPTBot)",
  perplexity: "Perplexity", bytedance: "ByteDance", meta: "Meta (Facebook, link previews and crawler)", x: "X (link previews)", linkedin: "LinkedIn", "link-preview": "Other link previews (messengers, Mastodon, Bluesky…)",
  seo: "SEO tools", archive: "Web archives", "other-bot": "Other crawlers", script: "Scripts and checks (including this site's own)" };

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD"); return json(res, 405, { error: "method not allowed" }); }
  if ([...url.searchParams.keys()].some((k) => k !== "f")) return json(res, 400, { error: "this page takes no parameters" }, { "Cache-Control": "public, max-age=0, s-maxage=600" });
  const cache = { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=300" };
  if (url.searchParams.get("f") === "md") res.czMarkdown = { path: "/stats" };   // the page as Markdown (stage 5)
  let s;
  try { s = await rpc("cz_visit_stats", { p_days: 30 }); }
  catch (err) {
    R.log("stats", err);
    return html(res, 503, shell({ title: "Visits · Civilization Zero", body: "<main><h1>Visits</h1><p>The counts cannot be read right now. Try again shortly.</p></main>", path: "/stats", description: "Visits to Civilization Zero." }), { "Retry-After": "60", "Cache-Control": "no-store" });
  }
  if (url.searchParams.get("f") === "json") {
    return json(res, 200, { what: "Visits to civilizationzero.ai, counted per UTC day by the server, without cookies or identifiers. views: page views by browsers; visitors: distinct visitors that day (approximate; today's still counting); automated: requests by crawlers, link previews and scripts, counted apart. Counting began on first_day.", ...s }, cache);
  }
  const days = s.days || [], tot = days.reduce((a, d) => ({ v: a.v + (d.views || 0), a: a.a + (d.automated || 0) }), { v: 0, a: 0 });
  const today = new Date().toISOString().slice(0, 10);
  const body = `<main><h1>Visits</h1>
<p>How many people read this site, counted by the server and published here, as everything else is. No cookies, no scripts, no identifiers: for each UTC day the server counts page views by browsers, where they came from (the referring site's domain), and the country code its host gives. To count distinct visitors it keeps, for the current day only, a hash of each address and browser under a salt made for that day; at the end of the day it keeps the number and deletes the hashes and the salt. Crawlers, link previews and scripts — this site's own checks among them — are counted apart. ${s.first_day ? `Counting began on ${CZ.whenHtml(s.first_day)}.` : ""} The same counts as data: <a href="/stats.json">/stats.json</a>.</p>
<h2 id="h-days">The last 30 days</h2>
<p class="src">${n(tot.v)} page views by browsers; ${n(tot.a)} automated requests. A visitor is counted once per day: the same person on two days is two.</p>
${table(["Day", "Page views", "Visitors", "Automated"], days.map((d) => `<tr><td>${CZ.whenHtml(d.day)}${d.day === today ? " (today, still counting)" : ""}</td><td class="num">${n(d.views)}</td><td class="num">${d.visitors == null ? "—" : n(d.visitors)}</td><td class="num">${n(d.automated)}</td></tr>`))}
<h2 id="h-pages">Pages</h2>
${table(["Page", "Views"], (s.pages || []).map((p) => `<tr><td>${p.key.startsWith("/") ? `<a href="${esc(p.key)}">${esc(p.key)}</a>` : esc(p.key)}</td><td class="num">${n(p.n)}</td></tr>`))}
<h2 id="h-refs">Where readers came from</h2>
<p class="src">The domain of the page a reader followed a link from, when the browser said so. Most visits say nothing (typed, bookmarked, or from an app).</p>
${table(["Site", "Visits"], (s.refs || []).map((r) => `<tr><td>${esc(r.key)}</td><td class="num">${n(r.n)}</td></tr>`))}
<h2 id="h-countries">Countries</h2>
${table(["Country", "Page views"], (s.countries || []).map((c) => `<tr><td>${esc(c.key)}</td><td class="num">${n(c.n)}</td></tr>`))}
<h2 id="h-automated">Automated clients</h2>
${table(["Kind", "Requests"], (s.automated || []).map((b) => `<tr><td>${esc(BOT_NAMES[b.key] || b.key)}</td><td class="num">${n(b.n)}</td></tr>`))}
</main>`;
  return html(res, 200, shell({ title: "Visits · Civilization Zero", body, path: "/stats", description: "How many people read Civilization Zero: page views and visitors per day, counted by the server without cookies or identifiers, and published." }), cache);
};
