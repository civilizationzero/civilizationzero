// The day's figure, computed when the first page is served (api/home.js). The same algorithm as site/figure.py, byte for byte:
// that file holds the definition and the reasons; site/check.py and test/home.test.js compare the two.
//   h = SHA-256(core.txt); ring i = 0..15; m[i] = the sixteen primes that follow 256;
//   a[i] = h[2i]; s[i] = h[2i+1] + 1; pos(i, day) = (a[i] + day * s[i]) mod m[i];
//   ring i shows the arc from pos(i, day - 1) to pos(i, day), in m[i]-ths of a turn, clockwise from the top.
// Nothing is hashed at request time and the hash is typed nowhere: the build computes it from the Core's bytes and writes it into
// api/home-templates.json (figure.core_sha256). A request costs sixteen multiplications and remainders and one string of 1.9 kB;
// the first page also writes the day's sixteen positions as numbers.
"use strict";
const M = [257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349];
const mod = (x, m) => ((x % m) + m) % m;   // the remainder with the sign of the divisor, as Python's % and CSS mod()

function constants(coreSha256) {
  const h = Buffer.from(String(coreSha256), "hex");
  if (h.length !== 32) throw new Error("the figure needs the SHA-256 of the Core, 32 bytes");
  return M.map((m, i) => [h[2 * i], h[2 * i + 1] + 1, m]);   // [a, s, m] for ring i
}
const positions = (day, K) => K.map(([a, s, m]) => mod(a + day * s, m));
const places = (day, K) => positions(day, K).map((p) => String(p).padStart(3, "0"));   // as the first page writes them with the figure: three digits, ring 0 (the innermost) first
const radius = (i) => 68 + 8 * i;   // the middle of ring i's unit, in a square of 48 units of 8
// the sixteen arcs; each carries its three constants, from which a browser with CSS mod() computes the same arc for any day
const rings = (day, K) => K.map(([a, s, m], i) =>
  `<circle r="${radius(i)}" pathLength="${m}" stroke-dasharray="${s} ${m - s}" stroke-dashoffset="${-mod(a + (day - 1) * s, m)}" style="--a:${a};--s:${s};--m:${m}"/>`).join("");
const tracks = () => M.map((_, i) => `<circle r="${radius(i)}"/>`).join("");

module.exports = { M, constants, positions, places, rings, tracks };

if (require.main === module) {   // node figure.js <sha256 of core.txt> [day ...]: one line of JSON for each day, as site/figure.py prints it
  const [sha, ...days] = process.argv.slice(2), K = constants(sha);
  for (const d of days.map(Number)) console.log(JSON.stringify({ day: d, positions: positions(d, K), rings: rings(d, K) }));
}
