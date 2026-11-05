// The CZ badge (api/badge.js): today's day, the theme, the headers that let other sites show it. Run: node --test site/test/badge.test.js
const test = require("node:test"), assert = require("node:assert");
const badge = require("../api/badge.js"), CZ = require("../room/cztime.js");
function call(url, method = "GET") {
  const res = { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(x) { this.body = x || ""; } };
  badge({ url, method }, res); return res;
}
test("today's day, as an image other sites may show, cached until 00:00 UTC", () => {
  const r = call("/api/badge"), d = CZ.dayOf(Date.now());
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-type"], /^image\/svg\+xml/);
  assert.ok(r.body.includes(`>CZ ${d}</text>`) && r.body.includes(`day ${d} since Coordinate Zero`));
  assert.equal(r.headers["cross-origin-resource-policy"], "cross-origin");
  const b = Number(/(?:^|[ ,])max-age=(\d+)/.exec(r.headers["cache-control"])[1]), s = Number(/s-maxage=(\d+)/.exec(r.headers["cache-control"])[1]);
  assert.ok(b >= 1 && b <= 300 && s >= b && s <= 86400 && s === CZ.secondsToNextDay(Date.now()) || Math.abs(s - CZ.secondsToNextDay(Date.now())) <= 1);
  assert.ok(r.body.includes("prefers-color-scheme:dark"));
});
test("themes: light and dark fixed, anything else follows the reader", () => {
  assert.ok(!call("/api/badge?theme=light").body.includes("prefers-color-scheme") && call("/api/badge?theme=light").body.includes("fill:#fff"));
  assert.ok(call("/api/badge?theme=dark").body.includes("fill:#101010"));
  assert.ok(call("/api/badge?theme=%3Cscript%3E").body.includes("prefers-color-scheme:dark") && !call("/api/badge?theme=%3Cscript%3E").body.includes("<script"));
});
test("before Coordinate Zero, the minus sign; HEAD without a body; no POST", () => {
  assert.ok(badge.badge(-15975, "light").includes(">CZ −15975</text>"));
  assert.equal(call("/api/badge", "HEAD").body, "");
  assert.equal(call("/api/badge", "POST").statusCode, 405);
});
