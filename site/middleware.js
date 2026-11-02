// Visit counts (schema v9; the originator's decision of CZ 1432). Vercel Routing Middleware, run at the edge before the cache, so
// that a page served from the cache is counted too. It never changes a response: whatever happens here, the request goes on.
// What it sends to the database, after the response (waitUntil): the page's path, the referring site's domain (not the address),
// the country code Vercel gives, whether the client is a browser or which kind of automated client it is, and — for a browser
// only — the address and user agent, from which the database makes a hash under a salt that lives for one UTC day; the hashes and
// the salt are deleted at the end of the day and only the number of distinct visitors is kept. No cookie, no identifier, no script.
// The counts are public: /stats.
export const config = {
  runtime: "edge",
  // pages only: no API, no files (a dot followed by a file extension), no archive or well-known paths
  matcher: ["/((?!api/|_vercel/|\\.well-known/|archive/|prompts/|signatures/|.*\\.(?:txt|json|png|ico|svg|xml|webmanifest|sig|tar|ots|tsr|pub|py|pem|crt|log|md|bib|ris|jpg|jpeg|webp|avif|gif|css|js|map)$).*)"],
};

// automated clients, by kind; anything that is not a browser and matches none of these is "script"
const BOTS = [
  [/googlebot|google-inspectiontool|googleother|storebot-google|google-read-aloud|adsbot-google|mediapartners-google|google-site-verification|feedfetcher-google/i, "google"],
  [/bingbot|bingpreview|msnbot|adidxbot/i, "bing"], [/yandex/i, "yandex"], [/baiduspider/i, "baidu"], [/duckduckbot|duckassistbot/i, "duckduckgo"],
  [/applebot/i, "apple"], [/claudebot|claude-user|claude-searchbot|anthropic/i, "anthropic"],
  [/gptbot|chatgpt|oai-searchbot|openai/i, "openai"], [/perplexity/i, "perplexity"], [/bytespider|tiktok/i, "bytedance"],
  [/meta-externalagent|meta-externalfetcher|meta-webindexer|facebookexternalhit|facebookcatalog/i, "meta"],
  [/twitterbot|xbot/i, "x"], [/linkedinbot/i, "linkedin"], [/slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|mastodon|bluesky|cardyb|embedly|iframely|redditbot|pinterest/i, "link-preview"],
  [/ahrefs|semrush|mj12bot|dotbot|petalbot|seznam|dataforseo|serpstat|screaming frog/i, "seo"],
  [/archive\.org_bot|ia_archiver|heritrix/i, "archive"],
  [/bot\b|bot\/|crawler|spider|crawl|slurp|fetcher|preview/i, "other-bot"],
];
const SELF = /^(civilizationzero\.ai|www\.civilizationzero\.ai|civilization-zero[a-z0-9-]*\.vercel\.app)$/i;

export function agentOf(ua) {
  const s = String(ua || "");
  for (const [re, name] of BOTS) if (re.test(s)) return name;
  if (/headless|phantomjs|playwright|puppeteer|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime/i.test(s)) return "script";
  if (/^Mozilla\/5\.0 \(/.test(s) && /(Chrome|Firefox|Safari|Edg|OPR)\//.test(s)) return "human";
  return "script";   // curl, wget, python, node, go, java, an empty user agent
}
export function pathKey(pathname) {
  let p = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  try { p = decodeURIComponent(p); } catch {}
  return /^\/[A-Za-z0-9/._-]{0,118}$/.test(p) ? p : "(other)";
}
export function refHost(referer) {
  try { const u = new URL(referer); const h = u.hostname.toLowerCase(); return SELF.test(h) ? "" : h.replace(/^www\./, ""); } catch { return ""; }
}
// what one request contributes: null when it is not counted (not a page view: not GET, a prefetch, or a non-HTML request from a browser)
export function visitOf(request) {
  if (request.method !== "GET") return null;
  const h = request.headers, url = new URL(request.url);
  const purpose = `${h.get("sec-purpose") || ""} ${h.get("purpose") || ""} ${h.get("x-purpose") || ""} ${h.get("x-moz") || ""}`.toLowerCase();
  // a prefetch is not a page view — except this site's own speculation rule (stage 5, CZ 1433), tagged "cz", which fetches a page as the
  // reader presses its link (eagerness "conservative"): that is the visit, since the browser will not ask again. Never a prerender.
  const ownPress = /(^|[,\s])"cz"([,\s]|$)/.test(h.get("sec-speculation-tags") || "") && !purpose.includes("prerender");
  if ((purpose.includes("prefetch") || purpose.includes("prerender")) && !ownPress) return null;
  const ua = h.get("user-agent") || "", agent = agentOf(ua);
  if (agent === "human" && !/text\/html|\*\/\*/.test(h.get("accept") || "")) return null;   // a browser asking for JSON is not a page view
  const human = agent === "human";
  return {
    p_path: pathKey(url.pathname), p_agent: agent,
    p_ref: human ? refHost(h.get("referer") || "") : "",
    p_country: human ? (h.get("x-vercel-ip-country") || "").toUpperCase().slice(0, 2) : "",
    p_ip: human ? ((h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim()) : "",
    p_ua: human ? ua.slice(0, 400) : "",
  };
}
async function send(v) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY, token = process.env.CZ_ADMIN_TOKEN;
  if (!base || !key || !token) return;
  try {
    await fetch(`${base}/rest/v1/rpc/cz_count`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, p_token: token }), signal: AbortSignal.timeout(4000) });
  } catch {}   // a count that fails is a count lost, never a page that fails
}
export default function middleware(request, context) {
  try {
    const v = visitOf(request);
    if (v) { const job = send(v); if (context && typeof context.waitUntil === "function") context.waitUntil(job); }
  } catch {}
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}
