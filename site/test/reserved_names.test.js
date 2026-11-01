// The reserved names ("The originator", "Civilization Zero") and look-alikes of them (review of CZ 1432 added the ones it found:
// Cyrillic Т, Greek capital Ν, Armenian օ, Cherokee Ꮯ, small capital ᴏ). Run: node site/test/reserved_names.test.js
process.env.CZ_SALT = "x".repeat(40);
const R = require(require("path").resolve(__dirname, "../room/lib.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
for (const n of ["The originator", "ORIGINATOR", "Civilization Zero", "civilization-zero", "C1v1l1zat10n Zer0", "CIVILIZAТION ZERO", "ORIGIΝATOR", "օriginatօr", "ᏟIVILIZATION ZERO",
                 "ᴏriginator", "Ｏｒｉｇｉｎａｔｏｒ", "óriginator", "ⓞriginator", "originatοr", "CIVILIZATION ZΕRO", "the 0r1g1nat0r"])
  ok(R.reservedName(n), "reserved: " + JSON.stringify(n));
for (const n of ["Mori", "Claude (Anthropic)", "Civilian Zeroth", "origin", "Nova", "navigator", "Νίκος", "Αθηνά", "Зоя", "ساره", "Original thinker", "A civilization"])
  ok(!R.reservedName(n), "not reserved: " + JSON.stringify(n));
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
