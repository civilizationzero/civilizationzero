// CZ 1433, the originator's decisions on the review of proposals (batch A): the small notice that an entry cannot be recalled (2),
// the table of reasons on the colophon (3), the colophon's deployment and daily check (4), the citation layer (5), the Link headers
// and digests (6), paragraph anchors (15). Called directly, no network: GitHub is a stub. Run: node site/test/batch_a.test.js
process.env.CZ_SALT = "x".repeat(40);
const SITE = require("path").resolve(__dirname, "..");
process.chdir(SITE);
const fs = require("fs");
function call(handler, url, headers = {}, method = "GET") {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body: body || "" }); } };
    const r = handler({ url, method, headers }, res);
    if (r && r.then) r.catch((e) => resolve({ status: 599, body: String(e.stack) }));
  });
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const pub = (f) => fs.readFileSync(`${SITE}/public/${f}`, "utf8");
(async () => {
  const vj = JSON.parse(fs.readFileSync(`${SITE}/vercel.json`, "utf8"));
  const vLink = (src) => ((vj.headers.find((h) => h.source === src && !h.has && !h.missing) || { headers: [] }).headers.find((x) => x.key === "Link") || {}).value;
  // a GitHub that answers with a day's result, then one that does not answer
  const realFetch = global.fetch;
  let gh = { passed: 41, total: 41, checked_at: "2026-11-02T03:41:07Z", commit: "a".repeat(40), failed: [], run: "https://github.com/civilizationzero/civilizationzero/actions/runs/123" };
  global.fetch = async (u) => { if (gh === null) throw new Error("offline"); return { ok: true, status: 200, json: async () => gh }; };
  const page = require(SITE + "/api/page.js");

  // 6. the Link header of a static page: its Markdown first, then what vercel.json gives the same address (a function's header wins)
  for (const p of ["core", "record", "calendar"]) {
    const r = await call(page, `/api/page?p=${p}`);
    ok(r.headers.link === `</${p}.md>; rel="alternate"; type="text/markdown", ${vLink(`/${p}`)}`, `${p}: Link = Markdown + vercel.json's (${r.headers.link})`);
  }
  for (const p of ["about", "machine", "core.fa", "press", "how-it-is-built"]) {
    const r = await call(page, `/api/page?p=${p}`);
    ok(r.headers.link === `</${p}.md>; rel="alternate"; type="text/markdown"`, `${p}: Link names its Markdown`);
  }
  ok(!(await call(page, "/api/page?p=nothing")).headers.link, "a 404 has no Link");
  ok(/rel="cite-as"/.test(vLink("/core")) && /rel="cite-as"/.test(vLink("/core.(txt|json)")) && /rel="cite-as"/.test(vLink("/record.(txt|json)")), "vercel.json: cite-as on the texts in every form");

  // 4. the colophon: the deployment and the latest check
  process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
  let r = await call(page, "/api/page?p=how-it-is-built");
  ok(r.body.includes(`data-commit="${"a".repeat(40)}"`) && r.body.includes(">aaaaaaa</code>"), "colophon: the commit");
  ok(r.body.includes("41 of 41 checks passed, against this deployment.") && r.body.includes("actions/runs/123"), "colophon: the check, against this deployment");
  ok(/s-maxage=(\d+)/.exec(r.headers["cache-control"])[1] <= 3600, "colophon: an hour in the cache at most");
  ok(r.body.includes('<h2 id="reasons">Why the first page looks the way it does</h2>') && (r.body.match(/<tr><td>/g) || []).length > 30, "3: the table of reasons on the colophon");
  process.env.VERCEL_GIT_COMMIT_SHA = "b".repeat(40);
  gh = { ...gh, passed: 39, failed: ["one <b>thing</b>", "another"] };
  // the result read ten minutes ago stays (one read per instance per ten minutes): call the block directly for the other cases
  let b = page.deployBlock(gh, "b".repeat(40));
  ok(b.includes("39 of 41 checks passed, against commit") && b.includes("an earlier deployment") && b.includes("Failed: one &lt;b&gt;thing&lt;/b&gt;; another.") && b.includes('<p class="pending">The latest'), "colophon: a failure, an earlier deployment, escaped");
  b = page.deployBlock(null, undefined);
  ok(b.includes("cannot say which deployment") && b.includes("could not be read from the repository just now") && !b.includes("data-commit"), "colophon: nothing known, said so");
  b = page.deployBlock({ ...gh, run: "https://evil.example/x" }, "b".repeat(40));
  ok(!b.includes("evil.example"), "colophon: a run link only to the repository's runs");
  global.fetch = realFetch;

  // 3. the first page: one line, linking the table
  const home = JSON.parse(fs.readFileSync(`${SITE}/api/home-templates.json`, "utf8")).html;
  ok(home.includes('href="/how-it-is-built#reasons"') && !home.includes('id="h-deriv"') && !home.includes("<tr><th>Element</th>"), "3: the first page keeps a line, not the table");
  ok(pub("about.html").includes('the table of reasons is on <a href="/how-it-is-built#reasons">'), "3: /about points to the colophon");

  // 2. the notice, small, beside the button; in the reply dialog (the same form); in the contract
  const T = JSON.parse(fs.readFileSync(`${SITE}/api/discuss-templates.json`, "utf8"));
  ok(/<p class="src permanence">An entry cannot be edited or withdrawn\.[^<]*cannot be recalled\.<\/p>\n<button type="submit">/.test(T.respond_open), "2: the form says it before the button");
  ok(pub("machine.html").includes('<p class="src permanence">An entry cannot be edited or withdrawn.'), "2: /machine");
  const api = JSON.parse(pub("api/openapi.json"));
  ok(/cannot be recalled/.test(api.paths["/api/entries"].post.description), "2: the contract");

  // 15. paragraph anchors; 5. the citation layer
  const core = pub("core.html"), rec = pub("record.html");
  ok(core.includes('<p id="p0-1">') && core.includes('<p id="p3-2">') && core.includes('id="closing-1"') && rec.includes('<p id="s3-4-1">') && rec.includes('<li id="s3-4-2">'), "15: paragraph anchors");
  const ids = [...core.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  ok(new Set(ids).size === ids.length, "15: no anchor twice on /core");
  ok((core.match(/<p class="src cite">Cite: Civilization Zero \(2026\), CZ-CORE 1\.0, §\d+ /g) || []).length === 16, "5: a line to cite each section §0–§15");
  ok(core.includes('<meta name="citation_title" content="Civilization Zero — The Invariant Core (CZ-CORE 1.0): The One-Page Manifesto">') && core.includes('<link rel="cite-as" href="https://doi.org/10.5281/zenodo.23740317">'), "5: citation_* and cite-as on /core");
  ok(rec.includes('<meta name="citation_author" content="Civilization Zero">') && rec.includes("<tr><th>Cite as</th>"), "5: /record");
  const press = pub("press.html");
  ok(press.includes('<h2 id="cite">How to cite</h2>') && press.includes("The deposit.") && press.includes("The discussion.") && press.includes("&#123;"), "5: the press kit tells the three apart");
  const csl = JSON.parse(pub("cite/civilization-zero.csl.json"));
  ok(csl.length === 3 && csl[2].DOI && csl.every((c) => c.author[0].literal === "Civilization Zero"), "5: CSL-JSON");
  ok(/^TY {2}- GEN$/m.test(pub("cite/civilization-zero.ris")) && (pub("cite/civilization-zero.ris").match(/^ER {2}- $/gm) || []).length === 3, "5: RIS");
  ok((pub("cite/civilization-zero.bib").match(/^@misc\{/gm) || []).length === 3 && !pub("cite/civilization-zero.bib").includes("—"), "5: BibTeX, ASCII dashes");

  // 6. digests: the files' own, and never where the bytes could be compressed or cut
  const crypto = require("crypto");
  for (const f of ["core.txt", "record.txt"]) {
    const d = `sha-256=:${crypto.createHash("sha256").update(fs.readFileSync(`${SITE}/public/${f}`)).digest("base64")}:`;
    const rules = vj.headers.filter((h) => h.source === `/${f}` && h.missing);
    ok(rules.length === 2 && rules.every((h) => h.headers[0].value === d), `6: ${f} digests`);
    const re = new RegExp(rules[0].missing[0].value);
    ok(["gzip, deflate, br", "br", "gzip", "*", "zstd, br"].every((v) => re.test(v)) && !["identity", ""].some((v) => re.test(v)), `6: ${f}: the compression condition`);
  }

  console.log(`pass ${pass} fail ${fail}`); process.exitCode = fail ? 1 : 0;
})();
