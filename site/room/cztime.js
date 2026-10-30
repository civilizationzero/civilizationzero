// CZ time: dates counted from Coordinate Zero (design/CZ-TIME.md; the originator's decision of 30 October 2026, CZ 1430).
//
// CZ day 0 is 30 November 2022, the day that began at 00:00 UTC (CZ-CORE 1.0 §0). A CZ day is a UTC day. The day count D is
// exact and needs no calendar:  D = JDN − 2,459,914 = MJD − 59,913 = ⌊Unix seconds / 86,400⌋ − 19,326 = Rata Die − 738,489.
// The date is the count itself, written "CZ 1430" (CZ −1997 before Coordinate Zero): the originator's decision of 30 October 2026,
// after first choosing year and day. Times of day are UTC, after the date: "CZ 1430 15:20 UTC". The machine form is the same count,
// signed, in ASCII and without a space: CZ+1430, CZ-1997. Years of the record still begin on each 30 November (Year 4 on CZ 1461);
// "year and day" (Year 3, day 334; written 3:334, or CZ+3:334 / CZ−5:171 before zero) is a secondary reading, never the date.
//
// The other calendars are here to convert to and from CZ time: Gregorian (proleptic before 1582; astronomical years, 0 = 1 BCE),
// Julian (proleptic), Solar Hijri (K. Borkowski's algorithm as jalaali-js implements it, years −61 to 3177), Lunar Hijri (Umm
// al-Qura for 1343–1500 AH, the month starts as hijridate 2.6.0 compiles them from official sources; the tabular Islamic calendar
// outside them). No dependencies; required by api/home.js, api/page.js, api/calendar.js and room/lib.js.
"use strict";

const JDN0 = 2459914, MJD0 = 59913, UNIX0 = 19326, RD0 = 738489, DAY_MS = 86400000;
const MAX_DAYS = 3660000;   // about ±10,000 years from Coordinate Zero: the range this converter accepts
const fdiv = (a, b) => Math.floor(a / b);
const fmod = (a, b) => a - b * Math.floor(a / b);

// ---------------------------------------------------------------- Gregorian (H. Hinnant, "chrono-Compatible Low-Level Date Algorithms")
function daysFromCivil(y, m, d) {   // days since 1970-01-01
  y -= m <= 2 ? 1 : 0;
  const era = fdiv(y, 400), yoe = y - era * 400;
  const doy = fdiv(153 * (m > 2 ? m - 3 : m + 9) + 2, 5) + d - 1;
  return era * 146097 + yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = fdiv(z, 146097), doe = z - era * 146097;
  const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100));
  const mp = fdiv(5 * doy + 2, 153), d = doy - fdiv(153 * mp + 2, 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}
const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const gregorianLeap = (y) => fmod(y, 4) === 0 && (fmod(y, 100) !== 0 || fmod(y, 400) === 0);
const gregorianMonthDays = (y, m) => (m === 2 && gregorianLeap(y) ? 29 : ML[m - 1]);
const fromGregorian = (y, m, d) => daysFromCivil(y, m, d) - UNIX0;
const toGregorian = (D) => civilFromDays(D + UNIX0);

// ---------------------------------------------------------------- Julian (proleptic; astronomical years)
const julianLeap = (y) => fmod(y, 4) === 0;
const julianMonthDays = (y, m) => (m === 2 && julianLeap(y) ? 29 : ML[m - 1]);
function fromJulian(y, m, d) {
  const a = fdiv(14 - m, 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - 32083 - JDN0;
}
function toJulian(D) {
  const c = D + JDN0 + 32082, dd = fdiv(4 * c + 3, 1461), e = c - fdiv(1461 * dd, 4), mm = fdiv(5 * e + 2, 153);
  return [dd - 4800 + fdiv(mm, 10), mm + 3 - 12 * fdiv(mm, 10), e - fdiv(153 * mm + 2, 5) + 1];
}

// ---------------------------------------------------------------- Solar Hijri (Iran, Afghanistan)
// K. Borkowski, "The Persian calendar for 3000 years" (Earth, Moon and Planets 74, 1996), as jalaali-js (MIT) implements it: the
// year begins on the day of the March equinox if the equinox falls before noon at 52.5° E, else on the next day; the "breaks" are
// the years where the 33-year pattern of leap years shifts. Defined here for the years −61 to 3177; outside them, nothing is computed.
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const tdiv = (a, b) => Math.trunc(a / b), tmod = (a, b) => a - Math.trunc(a / b) * b;   // the algorithm's own division
function jalCal(jy) {
  if (!Number.isInteger(jy) || jy < BREAKS[0] || jy >= BREAKS[BREAKS.length - 1]) return null;
  const gy = jy + 621;
  let leapJ = -14, jp = BREAKS[0], jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += tdiv(jump, 33) * 8 + tdiv(tmod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += tdiv(n, 33) * 8 + tdiv(tmod(n, 33) + 3, 4);
  if (tmod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = tdiv(gy, 4) - tdiv((tdiv(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;   // 1 Farvardin is this day of March of the Gregorian year gy
  if (jump - n < 6) n = n - jump + tdiv(jump + 4, 33) * 33;
  let leap = tmod(tmod(n + 1, 33) - 1, 4);   // years since the last leap year (0: this one is)
  if (leap === -1) leap = 4;
  return { gy, march, leap };
}
const solarHijriLeap = (jy) => { const r = jalCal(jy); return r ? r.leap === 0 : null; };
const solarHijriMonthDays = (jy, jm) => (jm <= 6 ? 31 : jm <= 11 ? 30 : solarHijriLeap(jy) ? 30 : 29);
function fromSolarHijri(jy, jm, jd) {
  const r = jalCal(jy);
  return r ? fromGregorian(r.gy, 3, r.march) + (jm - 1) * 31 - tdiv(jm, 7) * (jm - 7) + jd - 1 : null;
}
function toSolarHijri(D) {   // the year that contains D began on 1 Farvardin in March of D's Gregorian year, or of the one before
  const jy = toGregorian(D)[0] - 621;
  for (const y of [jy, jy - 1]) {
    const r = jalCal(y);
    if (!r) continue;
    const k = D - fromGregorian(r.gy, 3, r.march);   // days since 1 Farvardin of y
    if (k < 0 || k >= (r.leap === 0 ? 366 : 365)) continue;
    return k <= 185 ? [y, 1 + tdiv(k, 31), tmod(k, 31) + 1] : [y, 7 + tdiv(k - 186, 30), tmod(k - 186, 30) + 1];
  }
  return null;
}

// ---------------------------------------------------------------- Lunar Hijri
// Umm al-Qura, the civil calendar of Saudi Arabia, for 1343–1500 AH (1 August 1924 – 16 November 2077): the length of every month
// as hijridate 2.6.0 (MIT) compiles them from official sources (archived Umm al-Qura publications; data of King Abdulaziz City for
// Science and Technology). One character a month, Muharram 1343 to Dhu al-Hijjah 1500: 9 = 29 days, 0 = 30, 8 = 28, 1 = 31 (the
// published record has a few months of 28 and 31 days in its early years). Months observed by sighting of the crescent can begin a
// day earlier or later, by country. Outside the table: the tabular Islamic calendar (civil epoch: 1 Muharram 1 AH = Friday
// 16 July 622, Julian; leap years 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 of each 30), which is an arithmetical approximation.
const UAQ = "090090008000990909090909090919080090990090099009990090090099090909009918090909000810909099090090090909990090090909090909" +
  "090090900990909090090909090909090090990909009909090909090900009099099009000909909909090909090900090909090909090909090909" +
  "090909090900090909080009090909090900090909090909090909090909090909090900090909009009090909090909090990909000909090990900" +
  "909090909090090909009900090909099009909900090909099090900900090909090909909090909090090909090909090090990909090090099090" +
  "909009090909090909090909090099090009009909090900990909090900900909090909090909090900090909009099090909090900990909090900" +
  "090999090900090909099009090090990909090009099090909009090909090909009090909090909009009099090900909090990909000909099090" +
  "900090909909900900090990990090090909090909090090909090909090090909099090090090909909090009090990909009009099099009000909" +
  "909900900900990990900090909099090090090909099090090900909099090900090909909090090090909909000090990999000090099099900090" +
  "090909909090090090990909090090900909909090090090990909009009099099000900909909900900900990909090900909090990900090909099" +
  "090090090909909090090099090909090090909090909090090099090990090009909909090009090990909000909099090900900909909090900909" +
  "090909090900909009909090900090990990900090099099090009090909909009009090990909009009090990909009009099090909000909909090" +
  "900099090909900090909090990090900909099090900090909909900900090990990090009099099009009090909900909009090909090909090090" +
  "909909009009090990909000909099099000090909909090090090990909090090909090990090090099099009090009909909009009090909909009" +
  "090090990909009009099090909000909909909000900990990900900099099090090090909909090090900990909090900900909909090090090990" +
  "990090009099099009009009909900909000990909090900909090990900900909099090900090909909090090090990909090090900990909090090" +
  "099090990090009909909090009090990909000909099090900900990909090900909090909090909009009909909000";
const UAQ_Y0 = 1343, UAQ_Y1 = 1500;
const UAQ_START = (() => {   // UAQ_START[i]: the CZ day of the first day of month i (0 = Muharram 1343); the last is 1 Muharram 1501
  const a = [2423999 - JDN0];   // 1 Muharram 1343 = 1 August 1924 = JDN 2,423,999
  for (const c of UAQ) a.push(a[a.length - 1] + (c === "0" ? 30 : c === "1" ? 31 : c === "8" ? 28 : 29));
  return a;
})();
const ISLAMIC_EPOCH = 1948440 - JDN0;   // 1 Muharram 1 AH (civil epoch)
const tabularFrom = (y, m, d) => d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + fdiv(3 + 11 * y, 30) + ISLAMIC_EPOCH - 1;
function tabularTo(D) {
  const y = fdiv(30 * (D - ISLAMIC_EPOCH) + 10646, 10631);
  const m = Math.min(12, Math.ceil((D - (29 + tabularFrom(y, 1, 1))) / 29.5) + 1);
  return [y, m, D - tabularFrom(y, m, 1) + 1];
}
const tabularLeap = (y) => fmod(14 + 11 * y, 30) < 11;
const inUAQ = (y) => y >= UAQ_Y0 && y <= UAQ_Y1;
function lunarHijriMonthDays(y, m) {
  if (inUAQ(y)) { const i = (y - UAQ_Y0) * 12 + m - 1; return UAQ_START[i + 1] - UAQ_START[i]; }
  return m % 2 === 1 ? 30 : m < 12 ? 29 : tabularLeap(y) ? 30 : 29;
}
const fromLunarHijri = (y, m, d) => (inUAQ(y) ? UAQ_START[(y - UAQ_Y0) * 12 + m - 1] + d - 1 : tabularFrom(y, m, d));
function toLunarHijri(D) {   // [y, m, d, "umm-al-qura" | "tabular"]
  if (D >= UAQ_START[0] && D < UAQ_START[UAQ_START.length - 1]) {
    let lo = 0, hi = UAQ_START.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (UAQ_START[mid] <= D) lo = mid; else hi = mid - 1; }
    return [UAQ_Y0 + Math.floor(lo / 12), (lo % 12) + 1, D - UAQ_START[lo] + 1, "umm-al-qura"];
  }
  return [...tabularTo(D), "tabular"];
}

// ---------------------------------------------------------------- CZ time
const anniversary = (N) => fromGregorian(2022 + N, 11, 30);   // the CZ day on which CZ year N begins; N < 0: N years before
function parts(D) {   // { sign: +1 | -1, year, day, days_in_year }
  if (D >= 0) {
    let N = Math.floor(D / 365.2425);
    while (anniversary(N) > D) N--;
    while (anniversary(N + 1) <= D) N++;
    const a = anniversary(N);
    return { sign: 1, year: N, day: D - a, days_in_year: anniversary(N + 1) - a };
  }
  let N = Math.max(0, Math.floor(-D / 365.2425));
  while (anniversary(-N - 1) >= D) N++;
  while (N > 0 && anniversary(-N) < D) N--;
  const a = anniversary(-N);
  return { sign: -1, year: N, day: a - D, days_in_year: a - anniversary(-N - 1) };
}
const pad = (n, w) => String(n).padStart(w, "0");
// the stamp; the minus sign is U+2212 for reading, or "-" (ASCII) where it is to be typed or parsed by machines
const stamp = (D, minus = "−") => { const p = parts(D); return `CZ${p.sign < 0 ? minus : "+"}${p.year}:${pad(p.day, 3)}`; };   // year and day
const czDay = (D, minus = "−") => `CZ ${D < 0 ? minus : ""}${Math.abs(D)}`;   // the date as the pages print it: CZ 1430, CZ −1997
const machine = (D) => `CZ${D < 0 ? "-" : "+"}${Math.abs(D)}`;
function fromStamp(sign, N, ddd) {   // the CZ day, or null when ddd is not a day of that year
  if (!Number.isInteger(N) || !Number.isInteger(ddd) || N < 0 || ddd < 0 || N > 9999) return null;
  if (sign >= 0) { const a = anniversary(N); return ddd < anniversary(N + 1) - a ? a + ddd : null; }
  const a = anniversary(-N);
  return ddd < a - anniversary(-N - 1) ? a - ddd : null;
}
const dayOf = (ms) => Math.floor(ms / DAY_MS) - UNIX0;   // the CZ day of a moment (milliseconds since 1970, UTC)
const secondsToNextDay = (ms) => Math.max(1, Math.ceil(((Math.floor(ms / DAY_MS) + 1) * DAY_MS - ms) / 1000));
const isoWeekday = (D) => fmod(D + 2, 7) + 1;   // CZ day 0 was a Wednesday (3)

// ---------------------------------------------------------------- names and formatting
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SOLAR = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];
const SOLAR_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const LUNAR = ["Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Ula", "Jumada al-Akhirah", "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah"];
const LUNAR_AR = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const WEEKDAYS_FA = ["دوشنبه", "سه\u200cشنبه", "چهارشنبه", "پنج\u200cشنبه", "جمعه", "شنبه", "یکشنبه"];
const WEEKDAYS_AR = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"];
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹", AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const digitsIn = (n, set) => String(n).replace(/[0-9]/g, (c) => set[c]);
const yearText = (y) => (y > 0 ? String(y) : `${1 - y} BCE`);   // astronomical year 0 is 1 BCE
const isoDate = (y, m, d) => `${y < 0 ? "-" : y > 9999 ? "+" : ""}${pad(Math.abs(y), 4)}-${pad(m, 2)}-${pad(d, 2)}`;
const fmtInt = (n) => (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("en-US");

// Everything a CZ day is, in every calendar here. A calendar that does not reach the day (before its year 1, or outside the range of
// its algorithm) is null.
function describe(D) {
  const p = parts(D), w = isoWeekday(D);
  const [gy, gm, gd] = toGregorian(D), [jy, jm, jd] = toJulian(D);
  const sh = toSolarHijri(D), lh = D >= ISLAMIC_EPOCH ? toLunarHijri(D) : null;
  return {
    cz: { date: czDay(D), machine: machine(D), day: D, year: p.year, day_of_year: p.day, days_in_year: p.days_in_year, year_day: stamp(D, "-") },
    weekday: WEEKDAYS[w - 1], iso_weekday: w,
    gregorian: { date: isoDate(gy, gm, gd), year: gy, month: gm, day: gd, text: `${gd} ${MONTHS[gm - 1]} ${yearText(gy)}`, leap_year: gregorianLeap(gy) },
    julian: { date: isoDate(jy, jm, jd), year: jy, month: jm, day: jd, text: `${jd} ${MONTHS[jm - 1]} ${yearText(jy)}`, leap_year: julianLeap(jy) },
    solar_hijri: sh && sh[0] >= 1 ? { year: sh[0], month: sh[1], day: sh[2], month_name: SOLAR[sh[1] - 1], text: `${sh[2]} ${SOLAR[sh[1] - 1]} ${sh[0]} SH`,
      native: `${digitsIn(sh[2], FA_DIGITS)} ${SOLAR_FA[sh[1] - 1]} ${digitsIn(sh[0], FA_DIGITS)}`,
      native_long: `${WEEKDAYS_FA[w - 1]} ${digitsIn(sh[2], FA_DIGITS)} ${SOLAR_FA[sh[1] - 1]} ${digitsIn(sh[0], FA_DIGITS)}`, leap_year: solarHijriLeap(sh[0]) } : null,
    lunar_hijri: lh && lh[0] >= 1 ? { year: lh[0], month: lh[1], day: lh[2], month_name: LUNAR[lh[1] - 1], text: `${lh[2]} ${LUNAR[lh[1] - 1]} ${lh[0]} AH`,
      native: `${digitsIn(lh[2], AR_DIGITS)} ${LUNAR_AR[lh[1] - 1]} ${digitsIn(lh[0], AR_DIGITS)} هـ`,
      native_long: `${WEEKDAYS_AR[w - 1]} ${digitsIn(lh[2], AR_DIGITS)} ${LUNAR_AR[lh[1] - 1]} ${digitsIn(lh[0], AR_DIGITS)} هـ`, method: lh[3] } : null,
    jdn: D + JDN0, mjd: D + MJD0, unix_day: D + UNIX0, rata_die: D + RD0,
    begins_utc: `${isoDate(gy, gm, gd)}T00:00:00Z`,
  };
}

// ---------------------------------------------------------------- reading a date someone typed
const CALENDARS = ["gregorian", "solar-hijri", "lunar-hijri", "julian", "cz"];
const CAL_NAME = { gregorian: "Gregorian", "solar-hijri": "Solar Hijri", "lunar-hijri": "Lunar Hijri", julian: "Julian", cz: "CZ time" };
// digits of every script people type dates in here become ASCII; the minus signs become "-"; Arabic comma and joiners are removed
function normalizeInput(s) {
  return String(s ?? "").normalize("NFKC").slice(0, 80)
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[−‐-―﹣－]/g, "-").replace(/،/g, ",").replace(/[​-‏ـ‪-‮⁦-⁩]/g, "").trim();
}
// month names compared without case, spaces, hyphens, apostrophes and the usual variants of Arabic letters
const nameKey = (s) => s.toLowerCase().replace(/[\s\-'’ʿʾ`.]/g, "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ی");
const MONTH_NAMES = {
  gregorian: [["january", "jan", "ژانویه", "ژانویه", "يناير", "كانون الثاني"], ["february", "feb", "فوریه", "فبراير", "شباط"], ["march", "mar", "مارس", "آذار"],
    ["april", "apr", "آوریل", "أبريل", "ابريل", "نيسان"], ["may", "مه", "می", "مايو", "أيار"], ["june", "jun", "ژوئن", "يونيو", "حزيران"],
    ["july", "jul", "ژوئیه", "جولای", "يوليو", "تموز"], ["august", "aug", "اوت", "آگوست", "أغسطس", "آب"], ["september", "sep", "sept", "سپتامبر", "سبتمبر", "أيلول"],
    ["october", "oct", "اکتبر", "أكتوبر", "تشرين الأول"], ["november", "nov", "نوامبر", "نوفمبر", "تشرين الثاني"], ["december", "dec", "دسامبر", "ديسمبر", "كانون الأول"]],
  "solar-hijri": [["farvardin", "فروردین"], ["ordibehesht", "ordibehest", "اردیبهشت"], ["khordad", "خرداد"], ["tir", "تیر"], ["mordad", "amordad", "مرداد", "امرداد"],
    ["shahrivar", "شهریور"], ["mehr", "مهر"], ["aban", "آبان"], ["azar", "آذر"], ["dey", "dei", "دی"], ["bahman", "بهمن"], ["esfand", "espand", "اسفند"]],
  "lunar-hijri": [["muharram", "moharram", "محرم"], ["safar", "صفر"], ["rabi al-awwal", "rabiulawwal", "rabi i", "ربيع الأول", "ربیع الاول"],
    ["rabi al-thani", "rabi al-akhir", "rabiulakhir", "rabiussani", "rabi ii", "ربيع الآخر", "ربيع الثاني", "ربیع الثانی"],
    ["jumada al-ula", "jumada al-awwal", "jumadal ula", "jumada i", "جمادى الأولى", "جمادى الأول", "جمادی الاول", "جمادی الاولی"],
    ["jumada al-akhirah", "jumada al-akhira", "jumada al-thani", "jumada ii", "جمادى الآخرة", "جمادى الثانية", "جمادی الثانی", "جمادی الآخر", "جمادی الاخری"],
    ["rajab", "رجب"], ["shaban", "sha'ban", "شعبان"], ["ramadan", "ramazan", "رمضان"], ["shawwal", "شوال"],
    ["dhu al-qadah", "dhu al-qidah", "dhul qadah", "dhul qidah", "zulqadah", "ذو القعدة", "ذی القعده", "ذیقعده"],
    ["dhu al-hijjah", "dhul hijjah", "zulhijjah", "ذو الحجة", "ذی الحجه", "ذیحجه"]],
};
MONTH_NAMES.julian = MONTH_NAMES.gregorian;
const MONTH_KEYS = Object.fromEntries(Object.entries(MONTH_NAMES).map(([c, ms]) => [c, ms.map((vs) => vs.map(nameKey))]));
function monthFrom(word, cal) {   // [month, calendar] or null; an exact name first, then an unambiguous beginning of three letters or more
  const k = nameKey(word);
  if (!k) return null;
  const order = [cal, ...["gregorian", "solar-hijri", "lunar-hijri"].filter((c) => c !== cal && !(cal === "julian" && c === "gregorian"))];
  for (const c of order) { const i = MONTH_KEYS[c].findIndex((vs) => vs.includes(k)); if (i >= 0) return [i + 1, c]; }
  if ([...k].length < 3) return null;
  for (const c of order) {
    const hits = MONTH_KEYS[c].map((vs, i) => (vs.some((v) => v.startsWith(k)) ? i + 1 : 0)).filter(Boolean);
    if (hits.length === 1) return [hits[0], c];
    if (hits.length > 1) return null;
  }
  return null;
}
const ERA_BCE = /(^|[^a-z])(b\.?\s?c\.?\s?e?\.?)(?=$|[^a-z])|ق\.\s?م|قبل از میلاد|قبل الميلاد/i;
const ERA_OTHER = /(^|[^a-z])(c\.?e\.?|a\.?d\.?|a\.?h\.?|s\.?h\.?|h\.?s\.?)(?=$|[^a-z])|هـ\.?\s?ش\.?|ه\.?\s?ش\.?|هـ\.?\s?ق\.?|ه\.?\s?ق\.?|هـ|(^|\s)(ش|ق|م)(?=$|\s)|میلادی|شمسی|قمری|هجری|هجري/gi;

// { ok: true, day, calendar, read } or { ok: false, error }
function parse(input, calendar, todayMs) {
  let cal = CALENDARS.includes(calendar) ? calendar : "gregorian";
  const s = normalizeInput(input);
  if (!s || /^(today|now|امروز|اليوم)$/i.test(s)) {
    const D = dayOf(todayMs);
    return { ok: true, day: D, calendar: cal, read: "today", native: "today", today: true };
  }
  // CZ time: CZ+3:334, −5:171, 3:334 (year and day); CZ+1430, CZ-1997 (the day count); with or without "CZ"
  let m = /^(?:cz\s*)?([+-])?\s*(\d{1,5})\s*:\s*(\d{1,3})$/i.exec(s);
  if (m) {
    const D = fromStamp(m[1] === "-" ? -1 : 1, Number(m[2]), Number(m[3]));
    if (D === null) return { ok: false, error: `${s} is not a day: a CZ year has 365 or 366 days, numbered 000 to 364 or 365.` };
    return { ok: true, day: D, calendar: "cz", read: `${czDay(D)} (year and day ${stamp(D)})`, native: czDay(D) };
  }
  // the date, the day count: CZ 1430, CZ+1430, CZ −1997, "day 1430", or the bare number with CZ chosen; a time of day after it
  // (CZ 1430 15:20, CZ 1430:15.20, with or without UTC) is read and kept with the day
  m = /^(?:cz\s*|(?:cz\s*)?day\s*)([+-])?\s*(\d{1,7})(?:(?:\s+|\s*[:T]\s*)(\d{1,2})[:.٫](\d{2})(?:[:.٫](\d{2}))?)?\s*(?:utc|z)?$/i.exec(s)
    || (cal === "cz" ? /^([+-])?\s*(\d{1,7})$/.exec(s) : null);
  if (m) {
    const D = (m[1] === "-" ? -1 : 1) * Number(m[2]);
    if (Math.abs(D) > MAX_DAYS) return { ok: false, error: "Out of range: this converter covers about 10,000 years on either side of Coordinate Zero." };
    const time = m[3] !== undefined && Number(m[3]) <= 23 && Number(m[4]) <= 59 && Number(m[5] || 0) <= 59 ? ` ${pad(Number(m[3]), 2)}:${m[4]}${m[5] ? `:${m[5]}` : ""} UTC` : "";
    return { ok: true, day: D, calendar: "cz", read: czDay(D) + time, native: czDay(D) + time, time: time.trim() || null };
  }
  if (cal === "cz") return { ok: false, error: "A CZ date is the day count: CZ 1430 (or CZ −1997 before Coordinate Zero). To convert from another calendar, choose it." };
  // a date: three numbers, or two and a month's name
  const bce = ERA_BCE.test(s);
  const t = s.replace(ERA_BCE, " ").replace(ERA_OTHER, " ");
  const neg = /^\s*-\s*\d/.test(t);
  const nums = (t.match(/\d+/g) || []).map((x) => ({ v: Number(x), long: x.length >= 3, raw: x }));
  const words = t.replace(/\d+/g, " ").replace(/[-/.,:;()\s]+/g, " ").trim();
  let y, mo, d;
  if (words) {
    const found = monthFrom(words, cal);
    if (!found) return { ok: false, error: `"${words}" is not a month's name this converter knows. Write the date as numbers, year first: 2026-10-30.` };
    [mo, cal] = found;
    if (nums.length !== 2) return { ok: false, error: "Give a day, a month and a year." };
    const yi = nums[0].long || nums[0].v > 31 ? 0 : nums[1].long || nums[1].v > 31 ? 1 : -1;
    if (yi < 0) return { ok: false, error: "Write the year in full (four digits), so that it cannot be read as a day." };
    y = nums[yi].v; d = nums[1 - yi].v;
    if (yi === 0 && neg) y = -y;
  } else {
    if (nums.length === 1 && nums[0].raw.length === 8) {
      // eight digits without separators, as phones' number pads make people type: year first (19790306, ISO 8601's basic form),
      // or day first (06031979) when that is the only reading that is a date
      const r = nums[0].raw, yf = [Number(r.slice(0, 4)), Number(r.slice(4, 6)), Number(r.slice(6))], df = [Number(r.slice(4)), Number(r.slice(2, 4)), Number(r.slice(0, 2))];
      const fits = ([, mm, dd]) => mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
      if (fits(yf)) [y, mo, d] = yf; else if (fits(df)) [y, mo, d] = df;
      else return { ok: false, error: `${r} is not a date: write it year-month-day, for example 2026-10-30 or 20261030.` };
      if (neg) y = -y;
    } else if (nums.length !== 3) return { ok: false, error: "Write the date as year-month-day — 2026-10-30, 2026/10/30 or 20261030 — or choose CZ for a CZ date such as CZ 1430." };
    else if (nums[0].long || nums[0].v > 31) { [y, mo, d] = [nums[0].v, nums[1].v, nums[2].v]; if (neg) y = -y; }
    else if (nums[2].long || nums[2].v > 31) {
      [d, mo, y] = [nums[0].v, nums[1].v, nums[2].v];
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];   // 10/30/2026: month first
    } else return { ok: false, error: "Write the year in full (four digits), year first: 2026-10-30." };
  }
  if (bce) { if (y <= 0) return { ok: false, error: "A year before the common era is written as a positive number with BCE, or as an astronomical year with a minus sign." }; y = 1 - y; }
  if (mo < 1 || mo > 12) return { ok: false, error: `There is no month ${mo}.` };
  if (Math.abs(y) > 9999) return { ok: false, error: "Out of range: this converter covers the years −9999 to 9999." };
  let D, len;
  if (cal === "gregorian") { len = gregorianMonthDays(y, mo); D = fromGregorian(y, mo, Math.min(d, len)); }
  else if (cal === "julian") { len = julianMonthDays(y, mo); D = fromJulian(y, mo, Math.min(d, len)); }
  else if (cal === "solar-hijri") {
    if (y < 1 || !jalCal(y)) return { ok: false, error: "The Solar Hijri calendar is converted here for the years 1 to 3177." };
    len = solarHijriMonthDays(y, mo); D = fromSolarHijri(y, mo, Math.min(d, len));
  } else {
    if (y < 1) return { ok: false, error: "The Hijri era begins with the year 1 (622 CE)." };
    len = lunarHijriMonthDays(y, mo); D = fromLunarHijri(y, mo, Math.min(d, len));
  }
  if (d < 1 || d > len) return { ok: false, error: `${CAL_NAME[cal]} month ${mo} of ${yearText(y)} has ${len} days.` };
  if (Math.abs(D) > MAX_DAYS) return { ok: false, error: "Out of range: this converter covers about 10,000 years on either side of Coordinate Zero." };
  const name = cal === "solar-hijri" ? `${d} ${SOLAR[mo - 1]} ${y} SH` : cal === "lunar-hijri" ? `${d} ${LUNAR[mo - 1]} ${y} AH` : `${d} ${MONTHS[mo - 1]} ${yearText(y)}`;
  // in the calendar's own script: Solar Hijri in Persian, Lunar Hijri in Arabic, Gregorian and Julian in Latin letters (30 Oct 2026)
  const native = cal === "solar-hijri" ? `${digitsIn(d, FA_DIGITS)} ${SOLAR_FA[mo - 1]} ${digitsIn(y, FA_DIGITS)}`
    : cal === "lunar-hijri" ? `${digitsIn(d, AR_DIGITS)} ${LUNAR_AR[mo - 1]} ${digitsIn(y, AR_DIGITS)} هـ` : `${d} ${MONTHS[mo - 1]} ${yearText(y)}${cal === "julian" ? " (Julian)" : ""}`;
  return { ok: true, day: D, calendar: cal, read: `${name} (${CAL_NAME[cal]}${cal === "lunar-hijri" ? (inUAQ(y) ? ", Umm al-Qura" : ", tabular") : ""})`, native };
}

// ---------------------------------------------------------------- the time bar and the first page's line, filled at request time
// The bar's markup comes from the build (room/cz-bar.json, written by site/build.py with the stylesheet); the build leaves a
// fallback between <!--cz-now--> and <!--/cz-now--> in every page, for copies of the site that serve the files as they are.
const SELECT_FOR_LANG = { fa: "solar-hijri", ar: "lunar-hijri" };
function fields(ms) {   // today, as the pages print it
  const D = dayOf(ms), p = parts(D), [gy, gm, gd] = toGregorian(D), next = anniversary(p.year + 1);
  return { ISO: isoDate(gy, gm, gd), STAMP: czDay(D), YEARDAY: stamp(D), YEAR: String(p.year), DOY: pad(p.day, 3), DOYN: String(p.day), DAYS: String(D), DAYS_FMT: fmtInt(D),
           NEXT_YEAR: String(p.year + 1), NEXT_DAY: String(next), TO_NEXT: String(next - D), D, p };
}
// one pass over a template: __CZ_<FIELD>__ from fields(), __CZ_SEL_<calendar>__ as " selected" for the chosen calendar, __CZ_VALUE__
const fillTemplate = (tpl, f, sel, value = "", extra = {}) => tpl.replace(/__CZ_(SEL_[a-z-]+|[A-Z0-9_]+)__/g, (m0, k) =>
  k.startsWith("SEL_") ? (k.slice(4) === sel ? " selected" : "") : k === "VALUE" ? value
    : Object.prototype.hasOwnProperty.call(extra, k) ? extra[k] : Object.prototype.hasOwnProperty.call(f, k) && typeof f[k] === "string" ? f[k] : m0);
const BAR_RE = /<!--cz-now(?::(\w+))?-->[\s\S]*?<!--\/cz-now-->/;
let BAR = null;
function barTemplates() { if (!BAR) { try { BAR = require("./cz-bar.json"); } catch { BAR = {}; } } return BAR; }
function fillBar(html, ms) {
  if (typeof html !== "string" || !html.includes("<!--cz-now")) return html;
  const T = barTemplates(), f = fields(ms);
  const lang = (/<html lang="([a-zA-Z-]+)"/.exec(html) || [])[1] || "en";
  const sel = SELECT_FOR_LANG[lang.split("-")[0].toLowerCase()] || "gregorian";
  return html.replace(BAR_RE, (all, variant) => (typeof T[variant || "bar"] === "string" ? fillTemplate(T[variant || "bar"], f, sel) : all));
}

// ---------------------------------------------------------------- every date on the site (the originator's decision of 30 Oct 2026)
// A day or a moment as the pages print it: the CZ stamp, and for a moment its time of day in UTC (a CZ day is a UTC day: 24 hours,
// 00:00 to 24:00 UTC); a link to the converter for that day; the ISO value stays in the datetime attribute, for machines.
function whenParts(v) {
  const s = String(v ?? "").trim();
  const m = /^(-?\d{4,6})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { D: fromGregorian(Number(m[1]), Number(m[2]), Number(m[3])), time: null, iso: s };
  const t = Date.parse(s.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})$/, "$1:00"));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return { D: dayOf(t), time: [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()], iso: d.toISOString().replace(/\.\d{3}Z$/, "Z") };
}
function whenText(v, { seconds = false } = {}) {
  const w = whenParts(v);
  if (!w) return String(v ?? "");
  return czDay(w.D) + (w.time ? ` ${pad(w.time[0], 2)}:${pad(w.time[1], 2)}${seconds ? `:${pad(w.time[2], 2)}` : ""} UTC` : "");
}
const escHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const converterHref = (D) => `/calendar?d=${encodeURIComponent(machine(D))}`;
function whenHtml(v, { seconds = false, link = true } = {}) {
  const w = whenParts(v);
  if (!w) return escHtml(v);
  const attr = w.time ? (seconds ? w.iso : `${w.iso.slice(0, 16)}Z`) : w.iso;
  const el = `<time datetime="${escHtml(attr)}">${escHtml(whenText(v, { seconds }))}</time>`;
  return link ? `<a class="cz-date" href="${converterHref(w.D)}">${el}</a>` : el;
}

// ---------------------------------------------------------------- the time converter: a local time anywhere ↔ CZ time
// The time zones come from the build (room/cz-bar.json, "zones"); any IANA zone is accepted. The offset at a moment is read from the
// runtime's time zone database (Intl), so summer time and the zones' history are counted.
const utcMs = (y, m, d, hh = 0, mi = 0, ss = 0) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(hh, mi, ss, 0); return t.getTime(); };
const ZONE_FMT = new Map();
function validZone(z) {
  if (typeof z !== "string" || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(z)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; }
}
function zoneOffsetMin(zone, ms) {   // minutes east of UTC at that moment
  let f = ZONE_FMT.get(zone);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", era: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }); ZONE_FMT.set(zone, f); }
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  let y = Number(p.year);
  if (/^B/i.test(p.era || "")) y = 1 - y;
  return Math.round((utcMs(y, Number(p.month), Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - Math.floor(ms / 1000) * 1000) / 60000);
}
function localToUTC(zone, y, m, d, hh, mi, ss) {   // the moment a local wall time names (in a gap or an overlap of summer time, the first offset)
  const wall = utcMs(y, m, d, hh, mi, ss);
  let off = zoneOffsetMin(zone, wall), ms = wall - off * 60000;
  const off2 = zoneOffsetMin(zone, ms);
  if (off2 !== off) { ms = wall - off2 * 60000; off = off2; }
  return { ms, offset: off };
}
// "13:30", "13:30:15", "13.30", "13h30", "13 30", "1330", "930", "۱۳:۳۰", "1:30 pm", "۱:۳۰ ب.ظ", "١:٣٠ م" → [h, m, s] or null
const AM = /\s*(?:a\.?\s?m\.?|ق\.?\s?ظ\.?|صباحاً|صباحا|ص)$/i, PM = /\s*(?:p\.?\s?m\.?|ب\.?\s?ظ\.?|مساءً|مساء|م)$/i;
function parseTime(s) {
  let x = normalizeInput(s).replace(/\s+/g, " ").trim(), half = null;
  if (AM.test(x)) { half = "am"; x = x.replace(AM, ""); } else if (PM.test(x)) { half = "pm"; x = x.replace(PM, ""); }
  const m = /^(\d{1,2})(?:\s*[:.٫h ]\s*(\d{2}))?(?:\s*[:.٫ ]\s*(\d{2}))?$/i.exec(x) || /^(\d{1,2})(\d{2})(\d{2})?$/.exec(x);   // or digits only: 1330, 930
  if (!m) return null;
  const t = [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
  if (half) { if (t[0] < 1 || t[0] > 12) return null; t[0] = (t[0] % 12) + (half === "pm" ? 12 : 0); }
  return t[0] <= 23 && t[1] <= 59 && t[2] <= 59 ? t : null;
}
const offsetText = (min) => `UTC${min < 0 ? "−" : "+"}${pad(Math.floor(Math.abs(min) / 60), 2)}:${pad(Math.abs(min) % 60, 2)}`;
// { ok, utc_ms, offset, day, utc: "hh:mm:ss", local: { y, m, d, time } } or { ok: false, error }
function convertTime(dayD, t, zone) {
  const g = toGregorian(dayD);
  if (g[0] < 1 || g[0] > 9999) return { ok: false, error: "Times are converted here for the years 1 to 9999." };
  const r = localToUTC(zone, g[0], g[1], g[2], t[0], t[1], t[2]);
  const u = new Date(r.ms);
  return { ok: true, utc_ms: r.ms, offset: r.offset, day: dayOf(r.ms), utc: `${pad(u.getUTCHours(), 2)}:${pad(u.getUTCMinutes(), 2)}:${pad(u.getUTCSeconds(), 2)}`,
           local: { day: dayD, time: `${pad(t[0], 2)}:${pad(t[1], 2)}${t[2] ? `:${pad(t[2], 2)}` : ""}` } };
}
// the local time at which a CZ day begins in a zone (its 00:00 UTC), e.g. "03:30" in Tehran, "19:00 the day before" in New York
function dayStartLocal(D, zone) {
  const ms = (D + UNIX0) * DAY_MS, off = zoneOffsetMin(zone, ms), local = new Date(ms + off * 60000);
  return { time: `${pad(local.getUTCHours(), 2)}:${pad(local.getUTCMinutes(), 2)}`, offset: off, before: off < 0 };
}

// a Cache-Control whose s-maxage (with stale-while-revalidate) would reach past 00:00 UTC is cut to end there, when the date turns
function capCache(cc, ms) {
  const m = /s-maxage=(\d+)/.exec(String(cc || ""));
  if (!m) return cc;
  const swr = Number((/stale-while-revalidate=(\d+)/.exec(cc) || [])[1] || 0), left = secondsToNextDay(ms);
  return Number(m[1]) + swr <= left ? cc : `public, max-age=0, s-maxage=${Math.min(Number(m[1]), left)}`;
}

module.exports = {
  JDN0, MJD0, UNIX0, RD0, MAX_DAYS, CALENDARS, CAL_NAME,
  fromGregorian, toGregorian, gregorianLeap, gregorianMonthDays, fromJulian, toJulian, julianLeap, julianMonthDays,
  jalCal, fromSolarHijri, toSolarHijri, solarHijriLeap, solarHijriMonthDays,
  fromLunarHijri, toLunarHijri, lunarHijriMonthDays, tabularFrom, tabularTo, UAQ_START, UAQ_Y0, UAQ_Y1,
  anniversary, parts, stamp, czDay, machine, fromStamp, dayOf, secondsToNextDay, isoWeekday, isoDate, fmtInt, describe, parse, normalizeInput,
  fields, fillTemplate, fillBar, barTemplates, capCache, whenParts, whenText, whenHtml, converterHref, escHtml,
  utcMs, validZone, zoneOffsetMin, localToUTC, parseTime, offsetText, convertTime, dayStartLocal, WEEKDAYS_FA, WEEKDAYS_AR, FA_DIGITS, AR_DIGITS, digitsIn, MONTHS, SOLAR, SOLAR_FA, LUNAR, LUNAR_AR, WEEKDAYS,
};
