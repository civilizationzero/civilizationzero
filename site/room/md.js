// Every page as Markdown (stage 5 of the room's redesign, the originator's addition of 2 Nov 2026, CZ 1433): the page's <main>, as
// the site built it, converted to plain Markdown, with a front matter that says what the page is and where its HTML is. AI systems
// take part here; clean text is easier to read and to quote exactly. Reached by adding .md to a page's address, or by asking for
// text/markdown in Accept. The HTML stays the page (the front matter names it, html:); a Markdown page is not offered to search engines (noindex).
// User content is never mixed with the site's words: every entry's text (a <div class="content">) is set in a fenced block, as it
// was received, so that nothing in it is read as Markdown. A converter for this site's own markup, not for any HTML.
"use strict";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const SKIP = new Set(["head", "script", "style", "form", "dialog", "svg", "template", "button", "select", "datalist", "noscript", "iframe"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", middot: "·", copy: "©", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));

// ---- parse: a tree of {tag, attrs, kids} and text strings; tolerant of this site's markup (well formed, as generated)
function parse(html) {
  const root = { tag: "#root", attrs: {}, kids: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+|<)/gi;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.kids.push(unent(m[5])); continue; }
    if (m[1]) {   // a closing tag: close up to the matching element, if it is open
      const t = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === t) { stack.length = i; break; }
      continue;
    }
    if (!m[2]) continue;   // comment or doctype
    const tag = m[2].toLowerCase(), attrs = {};
    for (const a of (m[3] || "").matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = unent(a[2] ?? a[3] ?? a[4] ?? "");
    const el = { tag, attrs, kids: [] };
    top.kids.push(el);
    if (tag === "script" || tag === "style") {   // raw text: skip to its end
      const close = new RegExp(`</${tag}`, "ig"); close.lastIndex = re.lastIndex;   // a search in place, not in a lower-cased copy (whose length can differ)
      const end = close.exec(html);
      re.lastIndex = end ? end.index : html.length;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) stack.push(el);
  }
  return root;
}

const cls = (el) => ` ${el.attrs.class || ""} `;
const has = (el, c) => cls(el).includes(` ${c} `);
const textOf = (n) => (typeof n === "string" ? n : SKIP.has(n.tag) ? "" : n.kids.map(textOf).join(""));
function absUrl(href, origin) {
  if (!href) return "";
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  return origin + (href.startsWith("/") ? href : "/" + href);
}
// a backslash before Markdown's own characters, and before < and & so that no one's text becomes HTML or an entity (review of CZ 1433)
const escInline = (s) => s.replace(/([\\`*_\[\]<>&#|~])/g, "\\$1");
function fence(text) {
  const runs = (text.match(/`{3,}/g) || []).map((r) => r.length);
  const f = "`".repeat(Math.max(3, ...runs.map((n) => n + 1)));
  return `${f}text\n${text}\n${f}`;   // exact: the block's text without its final newline is the text as received
}

// ---- render: inline content to a string; blocks to a list of Markdown blocks
function inline(n, o) {
  if (typeof n === "string") return escInline(n.replace(/\s+/g, " "));
  if (SKIP.has(n.tag) || has(n, "skip") || n.attrs.hidden !== undefined) return "";
  const inner = () => n.kids.map((k) => inline(k, o)).join("");
  switch (n.tag) {
    case "br": return "  \n";
    case "a": { const t = inner().trim(), h = absUrl(n.attrs.href, o.origin); return t ? (h && !h.startsWith("#") ? `[${t}](${h})` : t) : ""; }
    case "strong": case "b": { const t = inner().trim(); return t ? `**${t}**` : ""; }
    case "em": case "i": { const t = inner().trim(); return t ? `*${t}*` : ""; }
    case "code": case "kbd": case "samp": {   // a code span: a run of backticks longer than any inside it, padded (CommonMark)
      const t = textOf(n).replace(/\s+/g, " "); if (!t) return "";
      const tick = "`".repeat(Math.max(0, ...(t.match(/`+/g) || []).map((r) => r.length)) + 1);
      return `${tick} ${t} ${tick}`; }
    case "img": return n.attrs.alt ? `![${escInline(n.attrs.alt)}](${absUrl(n.attrs.src, o.origin)})` : "";
    case "input": case "textarea": return "";
    case "span": if (has(n, "oneline")) { const t = inner().trim(); return t ? `“${t}”` : ""; } return inner();   // an excerpt of someone's words: quoted
    default: return inner();
  }
}
const BLOCKS = new Set(["p", "div", "section", "article", "header", "footer", "nav", "main", "aside", "figure", "figcaption", "ul", "ol", "li", "table", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "details", "summary", "dl", "dt", "dd", "address"]);
const isBlock = (n) => typeof n !== "string" && (BLOCKS.has(n.tag) || SKIP.has(n.tag));
function blocks(n, o) {
  if (typeof n === "string") { const t = n.replace(/\s+/g, " ").trim(); return t ? [escInline(t)] : []; }
  if (SKIP.has(n.tag) || has(n, "skip") || n.attrs.hidden !== undefined || n.attrs["aria-hidden"] === "true") return [];
  const kidsBlocks = () => { const out = []; let run = [];
    const flush = () => { const t = run.map((k) => inline(k, o)).join("").replace(/[ \t]+\n/g, "\n").trim(); if (t) out.push(t); run = []; };
    for (const k of n.kids) { if (isBlock(k)) { flush(); out.push(...blocks(k, o)); } else run.push(k); }
    flush(); return out; };
  if (n.tag === "div" && has(n, "content")) return [fence(textOf(n))];   // user content, exactly as shown, never read as Markdown
  switch (n.tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": { const t = inline(n, o).trim(); return t ? [`${"#".repeat(Number(n.tag[1]))} ${t}`] : []; }
    case "p": case "dt": case "dd": case "figcaption": case "address": { const t = n.kids.map((k) => inline(k, o)).join("").replace(/[ \t]+\n/g, "\n").trim(); return t ? [t] : []; }
    case "hr": return ["---"];
    case "pre": return [fence(textOf(n))];
    case "blockquote": return kidsBlocks().map((b) => b.split("\n").map((l) => `> ${l}`).join("\n"));
    case "ul": case "ol": {
      const items = n.kids.filter((k) => typeof k !== "string" && k.tag === "li");
      return [items.map((li, i) => {
        const bs = blocks({ ...li, tag: "div" }, o);
        const mark = n.tag === "ol" ? `${i + 1}. ` : "- ", pad = " ".repeat(mark.length);
        return mark + bs.join("\n\n").split("\n").map((l, j) => (j ? (l ? pad + l : l) : l)).join("\n");
      }).join("\n")];
    }
    case "table": {
      const rows = []; const walk = (x) => { for (const k of x.kids || []) if (typeof k !== "string") { if (k.tag === "tr") rows.push(k); else walk(k); } }; walk(n);
      if (!rows.length) return [];
      const cells = rows.map((r) => r.kids.filter((c) => typeof c !== "string" && (c.tag === "td" || c.tag === "th")).map((c) => inline(c, o).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim()));
      const w = Math.max(...cells.map((r) => r.length));
      const line = (r) => `| ${Array.from({ length: w }, (_, i) => r[i] || "").join(" | ")} |`;
      const headed = rows[0].kids.some((c) => typeof c !== "string" && c.tag === "th") && !rows[0].kids.some((c) => typeof c !== "string" && c.tag === "td");
      const head = headed ? cells[0] : Array.from({ length: w }, () => "");
      const body = headed ? cells.slice(1) : cells;
      return [[line(head), `| ${Array.from({ length: w }, () => "---").join(" | ")} |`, ...body.map(line)].join("\n")];
    }
    case "details": {   // folded on the page, open here: the summary as a line in bold, then what it folds
      const sum = n.kids.find((k) => typeof k !== "string" && k.tag === "summary");
      const rest = { ...n, tag: "div", kids: n.kids.filter((k) => k !== sum) };
      const s = sum ? inline(sum, o).trim() : "";
      return [...(s ? [`**${s}**`] : []), ...blocks(rest, o)];
    }
    case "summary": { const t = inline(n, o).trim(); return t ? [`**${t}**`] : []; }
    case "article": { const bs = kidsBlocks(); return bs.length ? [...bs] : []; }
    default: return kidsBlocks();
  }
}

// a YAML double-quoted scalar: JSON's escapes, and also the characters YAML does not accept raw (C1 controls, U+FFFE/FFFF, line separators)
const yamlStr = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v)
  : JSON.stringify(String(v)).replace(/[<>&\u007f-\u009f\u2028\u2029\ufffe\uffff\ud800-\udfff]/g, (c, i, str) => {   // < > & too: no markup even in a string
      const code = c.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdfff) { const pair = /[\ud800-\udbff][\udc00-\udfff]/.test(str.slice(code <= 0xdbff ? i : i - 1, (code <= 0xdbff ? i : i - 1) + 2)); if (pair) return c; }
      return "\\u" + code.toString(16).padStart(4, "0"); }));
function frontMatter(meta) {
  return "---\n" + Object.entries(meta).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${yamlStr(v)}`).join("\n") + "\n---\n";
}

// the page's <main> (or its body when it has none), as Markdown, under a front matter
function htmlToMarkdown(html, { origin = "https://civilizationzero.ai", path = "/", meta = {} } = {}) {
  const tree = parse(String(html || ""));
  const find = (n, t) => { if (typeof n === "string") return null; if (n.tag === t) return n; for (const k of n.kids) { const f = find(k, t); if (f) return f; } return null; };
  const main = find(tree, "main") || find(tree, "body") || tree;
  const title = meta.title ?? (() => { const t = find(tree, "title"); return t ? textOf(t).trim() : null; })();
  const descEl = (() => { const walk = (n) => { if (typeof n === "string") return null; if (n.tag === "meta" && n.attrs.name === "description") return n; for (const k of n.kids) { const f = walk(k); if (f) return f; } return null; }; return walk(tree); })();
  const fm = { url: `${origin}${mdPath(path)}`, html: `${origin}${path}`, fenced_text: "a fenced block's text, without its final newline, is the text as received", description: meta.description ?? (descEl ? descEl.attrs.content : undefined), ...meta };
  delete fm.title; const head = { title, ...fm };
  const body = blocks(main, { origin }).filter((b) => b.trim()).join("\n\n");   // never across a fence: a person's text keeps its blank lines
  return frontMatter(head) + "\n" + body + "\n";
}

// the address of a page's Markdown: "/" is "/index.md"
const mdPath = (path) => { const [p, q] = String(path).split("?"); return (p === "/" || p === "" ? "/index.md" : `${p}.md`) + (q ? `?${q}` : ""); };

function sendMarkdown(res, status, md, path, origin = "https://civilizationzero.ai", extra = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // not indexed, and no rel=canonical beside the noindex (14 Nov 2026, CZ 1445): search engines may carry a noindex over to the
  // canonical page when the two come together; the HTML page's address stays in the front matter
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Vary", extra.Vary || "Accept");
  res.setHeader("Access-Control-Allow-Origin", "*");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(md);
}

module.exports = { parse, htmlToMarkdown, frontMatter, fence, mdPath, sendMarkdown, textOf };
