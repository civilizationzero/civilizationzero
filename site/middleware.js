// Visit counts (schema v9, v12; the originator's decisions of CZ 1432 and CZ 1433). Vercel Routing Middleware, run at the edge
// before the cache, so that a page served from the cache is counted too. It never changes a response: whatever happens here, the
// request goes on. What it sends to the database, after the response (waitUntil): the page's path, the referring site's domain (not
// the address), the country code Vercel gives, and whether the client is a browser or which kind of automated client it is. Nothing
// about the client itself: since CZ 1433 no address and no description of the browser is sent, and no count of distinct visitors is
// made (v12). And how machines enter (v12): a request for a page as Markdown, for /llms.txt or for a canonical text, counted by
// address and kind of client. And a press on one of /ask's links to another company's assistant (CZ 1447), counted by the link's name
// alone. No cookie, no identifier, no script. The counts are public: /stats.
export const config = {
  runtime: "edge",
  // pages only: no API, no files (a dot followed by a file extension), no archive or well-known paths; and how machines enter (v12):
  // every page as Markdown, the summary for language models, the canonical texts
  matcher: ["/((?!api/|_vercel/|\\.well-known/|archive/|prompts/|signatures/|.*\\.(?:txt|json|png|ico|svg|xml|webmanifest|sig|tar|ots|tsr|pub|py|pem|crt|log|md|bib|ris|jpg|jpeg|webp|avif|gif|css|js|map)$).*)",
            "/(.*\\.md)", "/(llms\\.txt|core\\.txt|record\\.txt)"],
};

// automated clients, by kind; anything that is not a browser and matches none of these is "script". The first match wins, so a
// company's named agents come before its catch-all.
// Since CZ 1447 (16 Nov 2026) the agents of the companies that publish one user-agent token per purpose are counted apart, by purpose:
// "-training" (collects pages that may train its models), "-search" (indexes pages for its search), "-user" (fetches a page because a
// person asked it to), and "-other" for any other agent of that company. Until that day each company had one key ("openai",
// "anthropic", "perplexity", "meta", "duckduckgo"); those counts stay as they were, and /stats names them as counted together. Each
// token as the company documents it (read on 16 Nov 2026):
//   OpenAI      GPTBot, OAI-SearchBot, ChatGPT-User (OAI-AdsBot: other)     https://developers.openai.com/api/docs/bots
//   Anthropic   ClaudeBot, Claude-SearchBot, Claude-User; Claude-Agent, in the user agent of a browser Anthropic hosts that Claude
//               drives for a person   https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
//               https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf
//   Perplexity  PerplexityBot (search; not for training), Perplexity-User       https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md
//   Mistral     MistralAI-Training, MistralAI-Index, MistralAI-User             https://docs.mistral.ai/robots
//   Amazon      Amazonbot (its products; may train its models), Amzn-SearchBot, Amzn-User   https://developer.amazon.com/amazonbot
//   Meta        meta-externalagent (training and indexing), meta-webindexer, meta-externalfetcher; facebookexternalhit (link
//               previews); meta-externalads and facebookcatalog: other     https://developers.facebook.com/docs/sharing/webmasters/web-crawlers
//   DuckDuckGo  DuckDuckBot (search), DuckAssistBot (pages fetched for its AI-assisted answers; not for training)
//               https://duckduckgo.com/duckduckgo-help-pages/results/duckduckbot/  https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot
//   OpenAI's ChatGPT agent (its cloud browser) sends an ordinary browser's user agent and names itself by a header instead:
//   Signature-Agent "https://chatgpt.com", with RFC 9421 signatures (https://help.openai.com/fr-ca/articles/11845367-chatgpt-works-cloud-browser-allowlisting):
//   counted as "openai-agent", as Claude-Agent is "anthropic-agent" — a browser an AI drives for a person, not a person's page view
//   (agentOfRequest; review 1-2 C). Any other signed agent with a browser's user agent is an "other-bot".
// Google keeps one key: Google-Extended is a robots.txt token, not a client. A user agent is what a client says it is: anyone can send
// one of these names, so each count is at most the number of requests that agent made.
// Link previews that name other companies' crawlers in their user agents go first: iMessage's ("… facebookexternalhit/1.1 Facebot
// Twitterbot/1.0") is not Meta's, Telegram's ("TelegramBot (like TwitterBot)") is not X's (review 1-2 C).
const BOTS = [
  [/googlebot|google-inspectiontool|googleother|storebot-google|google-read-aloud|adsbot-google|mediapartners-google|google-site-verification|feedfetcher-google/i, "google"],
  [/bingbot|bingpreview|msnbot|adidxbot/i, "bing"], [/yandex/i, "yandex"], [/baiduspider/i, "baidu"],
  [/duckassistbot/i, "duckduckgo-assist"], [/duckduckbot/i, "duckduckgo-search"],
  [/applebot/i, "apple"],
  [/claude-user/i, "anthropic-user"], [/claude-agent/i, "anthropic-agent"], [/claude-searchbot/i, "anthropic-search"], [/claudebot/i, "anthropic-training"], [/anthropic/i, "anthropic-other"],
  [/chatgpt-user/i, "openai-user"], [/oai-searchbot/i, "openai-search"], [/gptbot/i, "openai-training"], [/chatgpt|openai/i, "openai-other"],
  [/perplexity-user/i, "perplexity-user"], [/perplexitybot/i, "perplexity-search"], [/perplexity/i, "perplexity-other"],
  [/mistralai-user/i, "mistral-user"], [/mistralai-index/i, "mistral-search"], [/mistralai-training/i, "mistral-training"], [/mistralai/i, "mistral-other"],
  [/amzn-user/i, "amazon-user"], [/amzn-searchbot/i, "amazon-search"], [/amazonbot/i, "amazon-training"],
  [/bytespider|tiktok/i, "bytedance"],
  [/facebot twitterbot|telegrambot/i, "link-preview"],
  [/meta-externalfetcher/i, "meta-user"], [/meta-webindexer/i, "meta-search"], [/meta-externalagent/i, "meta-training"], [/facebookexternalhit/i, "meta-preview"],
  [/meta-externalads|facebookcatalog/i, "meta-other"],
  [/twitterbot|xbot/i, "x"], [/linkedinbot/i, "linkedin"], [/slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|mastodon|bluesky|cardyb|embedly|iframely|redditbot|pinterestbot|pinterest\/0\./i, "link-preview"],   // Pinterest's crawler, not its in-app browser
  [/ahrefs|semrush|mj12bot|dotbot|petalbot|seznam|dataforseo|serpstat|screaming frog/i, "seo"],
  [/archive\.org_bot|ia_archiver|heritrix/i, "archive"],
  [/bot\b|bot\/|crawler|spider|crawl|slurp|fetcher|preview/i, "other-bot"],
];
export const BOT_KINDS = [...new Set([...BOTS.map(([, k]) => k), "openai-agent", "script"])];   // every key this file counts automated clients under (each has a name on /stats: test/visits.test.mjs)
const SELF = /^(civilizationzero\.ai|www\.civilizationzero\.ai|civilization-zero[a-z0-9-]*\.vercel\.app)$/i;

export function agentOf(ua) {
  const s = String(ua || "");
  for (const [re, name] of BOTS) if (re.test(s)) return name;
  if (/headless|phantomjs|playwright|puppeteer|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime/i.test(s)) return "script";
  if (/^Mozilla\/5\.0 \(/.test(s) && /(Chrome|Firefox|Safari|Edg|OPR)\//.test(s)) return "human";
  // a browser inside an app on an iPhone or iPad (Facebook's, Instagram's, LinkedIn's): the system's web view, which names no browser
  if (/^Mozilla\/5\.0 \((?:iPhone|iPad|iPod);[^)]*\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Mobile\/\w+/.test(s)) return "human";
  return "script";   // curl, wget, python, node, go, java, an empty user agent
}
// the kind of client, from the request: its user agent, and the Signature-Agent header an agent that signs its requests sends (RFC 9421,
// Web Bot Auth), which no browser sends of itself
export function agentOfRequest(h) {
  const a = agentOf(h.get("user-agent") || ""), sig = h.get("signature-agent") || "";
  if (/^\s*"?https:\/\/chatgpt\.com\/?"?\s*$/i.test(sig)) return "openai-agent";
  return sig.trim() && a === "human" ? "other-bot" : a;
}
export function pathKey(pathname) {
  let p = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  try { p = decodeURIComponent(p).replace(/\/{2,}/g, "/"); } catch {}   // again after decoding: "/%2Fx" must not become "//x" (review of CZ 1436)
  return /^\/(?!\/)[A-Za-z0-9/._-]{0,118}$/.test(p) ? p : "(other)";
}
export function refHost(referer) {
  try { const u = new URL(referer); const h = u.hostname.toLowerCase(); return SELF.test(h) ? "" : h.replace(/^www\./, ""); } catch { return ""; }
}
// a machine's way in (v12): the address as counted — the site's own Markdown and text addresses, one key for every entry's Markdown
// and for every register record's; any other address that ends in .md is "(other)" (nothing a client types reaches /stats)
const PAGES_MD = /^\/(?:index|core|record|objections|ask|machine|about|archive|calendar|press|how-it-is-built|embed|stats|discuss|respond|adopt|civilization-zero-infographic|civilization-zero-evidence-atlas|civilization-zero-images|core\.[a-z]{2,3}(?:-[a-z0-9]{1,8})?)\.md$/;
export function entranceKey(pathname) {
  let p = String(pathname || "").replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  const l = p.toLowerCase();
  if (/^\/(?:llms|core|record)\.txt$/.test(l)) return l;
  if (!/\.md$/.test(l)) return null;
  if (/^\/discuss\/\d{1,12}\.md$/.test(l)) return "/discuss/{id}.md";
  if (/^\/adopt\/\d{1,12}\.md$/.test(l)) return "/adopt/{id}.md";
  if (/^\/themes\/[a-z0-9-]{2,40}\.md$/.test(l) || PAGES_MD.test(l)) return l;
  return "(other)";
}
// the assistants /ask links to (api/ask-open.json, made by build.py, has their addresses); a trailing slash is not one of them, since the
// site redirects it to the address without, which is then counted once
const ASK_OPEN = /^\/ask\/open\/(chatgpt|claude|perplexity)$/;
// what one request contributes: null when it is not counted (not a page view: not GET, a prefetch, or a non-HTML request from a
// browser); { entrance } for a machine's way in, counted apart, by kind of client only; { open } for a press on a link of /ask to an
// assistant, by the link's name only
export function visitOf(request) {
  if (request.method !== "GET") return null;
  const h = request.headers, url = new URL(request.url);
  if (url.pathname === "/discuss/translating") return null;   // the translation progress page updates itself every second or two (CZ 1445): not views
  const purpose = `${h.get("sec-purpose") || ""} ${h.get("purpose") || ""} ${h.get("x-purpose") || ""} ${h.get("x-moz") || ""}`.toLowerCase();
  // a press on one of /ask's links that open another company's assistant with the short invitation (CZ 1447): /ask/open/<name>, which
  // api/page.js answers with a redirect. Counted by the link's name only, and only when a browser, by its user agent, navigates there
  // itself: not a crawler, an AI's browser or a script; not a prefetch (the links are rel="nofollow", which the speculation rules and
  // polite crawlers leave alone); not another site's image, script, frame or fetch aimed at it (Sec-Fetch-Dest and Sec-Fetch-Mode,
  // when the browser sends them: older ones do not); and not an address that names another "open" in its query, so that what is
  // counted is where the reader is sent (review 1-2 A and C). No spelling of /ask/open/… is ever a page view: the raw address and the
  // address as counted, any case, are both tested (review 1-2 C).
  if (/^\/ask\/open(\/|$)/.test(url.pathname) || /^\/ask\/open(\/|$)/.test(pathKey(url.pathname).toLowerCase())) {
    const m = ASK_OPEN.exec(url.pathname), dest = h.get("sec-fetch-dest"), mode = h.get("sec-fetch-mode");
    const navigation = (!dest || dest === "document") && (!mode || mode === "navigate");
    return m && navigation && !url.searchParams.has("open") && !purpose.includes("prefetch") && !purpose.includes("prerender") && agentOfRequest(h) === "human"
      ? { open: true, p_name: m[1] } : null;
  }
  const way = entranceKey(url.pathname);
  if (way) return purpose.includes("prefetch") || purpose.includes("prerender") ? null : { entrance: true, p_path: way, p_agent: agentOfRequest(h) };
  // a prefetch is not a page view — except this site's own speculation rule (stage 5, CZ 1433), tagged "cz", which fetches a page as the
  // reader presses its link (eagerness "conservative"): that is the visit, since the browser will not ask again. Never a prerender.
  const ownPress = /(^|[,\s])"cz"([,\s]|$)/.test(h.get("sec-speculation-tags") || "") && !purpose.includes("prerender");
  if ((purpose.includes("prefetch") || purpose.includes("prerender")) && !ownPress) return null;
  const agent = agentOfRequest(h);
  if (agent === "human" && !/text\/html|\*\/\*/.test(h.get("accept") || "")) return null;   // a browser asking for JSON is not a page view
  const human = agent === "human";
  return {
    p_path: pathKey(url.pathname), p_agent: agent,
    p_ref: human ? refHost(h.get("referer") || "") : "",
    p_country: human ? (h.get("x-vercel-ip-country") || "").toUpperCase().slice(0, 2) : "",
    p_ip: "", p_ua: "",   // never sent since CZ 1433 (v12): the database's function still names them, and ignores them
  };
}
async function send(v) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY, token = process.env.CZ_ADMIN_TOKEN;
  if (!base || !key || !token) return;
  try {
    const { entrance, open, ...args } = v;
    const fn = open ? "cz_count_ask_open" : entrance ? "cz_count_entrance" : "cz_count";
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, p_token: token }), signal: AbortSignal.timeout(4000) });
    if (!r.ok) console.error(`count not kept: ${fn} answered ${r.status}`);   // in the host's logs, the function and the status only (review 1-2 C)
  } catch {}   // a count that fails is a count lost, never a page that fails
}
export default function middleware(request, context) {
  try {
    const v = visitOf(request);
    if (v) { const job = send(v); if (context && typeof context.waitUntil === "function") context.waitUntil(job); }
  } catch {}
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}
