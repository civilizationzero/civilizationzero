// classify(): retries a cut-off answer, accepts a verdict whose JSON was cut after "score", counts every attempt's cost (review of CZ 1432).
// Run: node site/test/classify_stub.test.js — Anthropic and Supabase are stubbed (global fetch); nothing leaves the machine.
process.env.CZ_SALT = "x".repeat(40); process.env.ANTHROPIC_API_KEY = "test"; process.env.SUPABASE_URL = "http://db.invalid"; process.env.SUPABASE_ANON_KEY = "k";
const R = require(require("path").resolve(__dirname, "../room/lib.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function run(answers) {
  const calls = [], asked = [];
  global.fetch = async (url, opt) => {
    const body = opt && opt.body ? JSON.parse(opt.body) : {};
    if (String(url).includes("anthropic")) { const a = answers.shift(); asked.push(body.max_tokens); return { ok: true, json: async () => ({ model: "m", stop_reason: a.stop, content: a.text == null ? [] : [{ type: "text", text: a.text }], usage: { input_tokens: 1000, output_tokens: 100 } }) }; }
    const name = (/rpc\/(\w+)/.exec(url) || [])[1]; calls.push({ name, body });
    const res = name === "cz_budget_status" ? { month: "2026-11", cap_cents: 3000, spent_cents: 0, today_cents: 0, days_remaining: 29, source_chars_per_day: 20000 } : null;
    return { ok: true, status: 200, text: async () => JSON.stringify(res) };
  };
  const quiet = console.error; console.error = () => {};
  await R.classify(3, "An entry long enough to classify, about section six of the Core.");
  console.error = quiet;
  return { calls, asked, store: calls.filter((c) => c.name === "cz_translation_store").map((c) => c.body), flags: calls.filter((c) => c.name === "cz_flag") };
}
(async () => {
  const each = (1000 * 100 + 100 * 500) / 1e6;   // cents per stubbed call at the default prices
  let r = await run([{ text: '{"category": "none", "score": 0.05, "l', stop: "max_tokens" }, { text: '{"category": "none", "score": 0.05, "lang": "en"}', stop: "end_turn" }]);
  ok(JSON.stringify(r.asked) === "[200,800]" && r.store.length === 1 && r.store[0].p_state === "done" && Math.abs(r.store[0].p_cost_cents - 2 * each) < 1e-9, `cut off, then whole: done, both attempts counted ${JSON.stringify(r.asked)} ${JSON.stringify(r.store)}`);
  ok(r.calls.some((c) => c.name === "cz_set_lang_detected" && c.body.p_lang === "en") && !r.flags.length, "language recorded, no flag");
  r = await run([{ text: '{"category": "none", "score": 0.05, "l', stop: "max_tokens" }, { text: '{"category": "none", "score": 0.05, "la', stop: "max_tokens" }]);
  ok(r.store.length === 1 && r.store[0].p_state === "done" && !r.flags.length, "cut off twice after score: the verdict is read, screened, no flag");
  r = await run([{ text: '{"category": "advertising_spam", "score": 0.92, "lang": "en"}', stop: "end_turn" }]);
  ok(JSON.stringify(r.asked) === "[200]" && r.flags.length === 1 && r.flags[0].body.p_category === "advertising_spam" && r.store[0].p_state === "done", "a whole answer: one call, flagged");
  r = await run([{ text: '{"category": "none", "sco', stop: "max_tokens" }, { text: '{"category": "none", "sco', stop: "max_tokens" }]);
  ok(r.store.length === 1 && r.store[0].p_state === "pending" && /no JSON/.test(r.store[0].p_engine) && Math.abs(r.store[0].p_cost_cents - 2 * each) < 1e-9, "no verdict: pending, and the two failed attempts still counted");
  r = await run([{ text: null, stop: "refusal" }]);
  ok(r.store[0].p_state === "done" && /declined to classify/.test(r.store[0].p_engine) && JSON.stringify(r.asked) === "[200]", "a refusal: screened, named");
  r = await run([{ text: "", stop: "end_turn" }, { text: '{"category":"none","score":0,"lang":"fa"}', stop: "end_turn" }]);
  ok(JSON.stringify(r.asked) === "[200,800]" && r.store[0].p_state === "done", "empty, then whole");
  // translate(): an entry redacted or hidden while its translation was being made keeps the cost, not the text (review of CZ 1432)
  async function tr(after) {
    const calls = [];
    global.fetch = async (url, opt) => {
      const body = opt && opt.body ? JSON.parse(opt.body) : {};
      if (String(url).includes("anthropic")) return { ok: true, json: async () => ({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "<translation>متن اصلی، با چیزی خصوصی در آن.</translation>" }], usage: { input_tokens: 100, output_tokens: 100 } }) };
      const name = (/rpc\/(\w+)/.exec(url) || [])[1]; calls.push({ name, body });
      const res = name === "cz_budget_status" ? { month: "2026-11", cap_cents: 3000, spent_cents: 0, today_cents: 0, days_remaining: 29, source_chars_per_day: 20000 }
        : name === "cz_translation_get" ? [] : name === "cz_source_chars" ? 10 : name === "cz_entry3" ? (after ? [after] : []) : null;
      return { ok: true, status: 200, text: async () => JSON.stringify(res) };
    };
    const quiet = console.error; console.error = () => {};
    const out = await R.translate({ id: 7, content: "The original text, with something private in it.", hidden: false }, "fa", { headers: { "x-real-ip": "203.0.113.1" } });
    console.error = quiet;
    return { out, store: calls.filter((c) => c.name === "cz_translation_store").map((c) => c.body), notes: calls.filter((c) => c.name === "cz_translation_note").map((c) => c.body) };
  }
  let t = await tr({ id: 7, content: "The original text, with something private in it.", hidden: false });
  ok(t.out.state === "done" && t.store.length === 1 && t.store[0].p_state === "done" && t.store[0].p_text === "متن اصلی، با چیزی خصوصی در آن.", "unchanged entry: the translation is stored");
  t = await tr({ id: 7, content: "The original text, with [removed: private data] in it.", hidden: false, state: "redacted" });
  ok(t.out.state === "pending" && t.store.length === 0 && t.notes.length === 1 && /^discarded/.test(t.notes[0].p_note) && t.notes[0].p_cost_cents > 0, "redacted meanwhile: discarded (a note, never over a good translation), cost kept");
  t = await tr({ id: 7, content: null, hidden: true, state: "hidden" });
  ok(t.out.state === "pending" && t.store.length === 0 && t.notes.length === 1, "hidden meanwhile: discarded");
  console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
})();
