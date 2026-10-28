// The discussion room's endpoint while the room is closed (Blueprint 1.3.1 §7, §11 Phase 3b).
// It tells the truth in the contract's own terms: GET returns an empty archive with state "closed";
// POST answers 503 with Retry-After. The open implementation replaces this file when §7 is verified.
const OPENS = "2026-11-30T00:00:00Z"; // not later than; the real date is published on /discuss

module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Link", '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", </discuss.json>; rel="alternate"; type="application/json"');
  const url = new URL(req.url, "http://x");
  const id = url.searchParams.get("id");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "POST") {
    res.statusCode = 503;
    res.setHeader("Retry-After", new Date(OPENS).toUTCString());
    return res.end(JSON.stringify({ state: "not accepted", reason: "room closed", opens: { not_later_than: OPENS, condition: "when the rules of Blueprint 1.3.1 §7 are implemented and verified", rules: "https://civilizationzero.ai/discuss" }, schema: "https://civilizationzero.ai/api/openapi.json" }) + "\n");
  }
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET, POST, OPTIONS"); return res.end(JSON.stringify({ state: "not accepted", reason: "invalid" }) + "\n"); }
  if (id !== null) { res.statusCode = 404; return res.end(JSON.stringify({ error: "no such id", state: "closed" }) + "\n"); }
  res.statusCode = 200;
  res.end(JSON.stringify({ state: "closed", order: "receipt ascending, ties by id", entries: [], next_after: null, opens: { not_later_than: OPENS, rules: "https://civilizationzero.ai/discuss" }, archive: "https://civilizationzero.ai/discuss.json" }) + "\n");
};
