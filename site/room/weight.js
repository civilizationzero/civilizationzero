// The page-weight line at the foot of every page (stage 5 of the room's redesign, CZ 1433): what this page weighs as it is sent, how
// many scripts on it run, and that it sets no cookie. Measured on the page itself at the moment it is served, so it is true for this
// page and this moment, not a claim about the site. The build marks the place (<!--cz-weight-->…<!--/cz-weight-->) with a fallback
// for copies served as files, and writes the bytes of the page's own images (<!--cz-weight images=N-->), which it can measure.
// A script element that is data — JSON-LD for search engines, speculation rules — does not run, and is not counted as one.
"use strict";

const RE = /<!--cz-weight(?: images=(\d+))?-->[\s\S]*?<!--\/cz-weight-->/;
const DATA_TYPES = /^(application\/ld\+json|speculationrules|application\/json)$/i;
function runningScripts(html) {
  let n = 0;
  for (const m of String(html).matchAll(/<script\b([^>]*)>/gi)) {
    const t = /\btype\s*=\s*"([^"]*)"/i.exec(m[1]);
    if (!t || !DATA_TYPES.test(t[1].trim())) n++;
  }
  return n;
}
const kb = (bytes) => (bytes < 10240 ? (Math.round(bytes / 102.4) / 10).toFixed(1) : String(Math.round(bytes / 1024)));
function label(bytes, images, scripts) {
  const img = images > 0 ? `, and ${kb(images)} kB of images` : "";
  const js = scripts === 0 ? "no JavaScript that runs" : `${scripts} ${scripts === 1 ? "script that runs: the page's own tool" : "scripts that run: the page's own tools"}, in its source`;
  return `This page: ${kb(bytes)} kB${img} · ${js} · no cookies`;
}
function fillWeight(html) {
  if (typeof html !== "string") return html;
  const m = RE.exec(html);
  if (!m) return html;
  const images = Number(m[1] || 0), scripts = runningScripts(html);
  // the line is part of the page it measures: fill, measure, and fill again until the number stands (twice is enough)
  let out = html, bytes = Buffer.byteLength(html, "utf8");
  for (let i = 0; i < 3; i++) {
    out = html.replace(RE, () => `<!--cz-weight${m[1] ? ` images=${m[1]}` : ""}-->${label(bytes, images, scripts)}<!--/cz-weight-->`);
    const b = Buffer.byteLength(out, "utf8");
    if (kb(b) === kb(bytes)) break;
    bytes = b;
  }
  return out;
}

module.exports = { fillWeight, runningScripts, label };
