# CZ time

How the dates of Civilization Zero are written. The originator's decision of 30 October 2026 (CZ+3:334): CZ time is the basis of the
site's dates. Today's date in CZ time is at the top of every page of civilizationzero.ai, linked to [/calendar](https://civilizationzero.ai/calendar),
which explains it and converts dates to it. This file is the definition; `site/room/cztime.js` (at request time) and `site/lib.py`
(at build time) implement it, and `site/check.py` compares the two at every build.

## 1. The day count

- **Day 0** is Coordinate Zero: 30 November 2022, the day that began at 00:00 UTC (CZ-CORE 1.0 §0: "30 November 2022 is selected as
  Year Zero of this record").
- **A CZ day is a UTC day.** It begins at 00:00 UTC everywhere.
- **D**, the CZ day number, is the count of days from day 0, negative before it:

  ```
  D = JDN − 2,459,914 = MJD − 59,913 = ⌊Unix time / 86,400⌋ − 19,326 = Rata Die − 738,489
  ```

  (JDN: Julian Day Number of the day; MJD: Modified Julian Date at 00:00 UTC; Rata Die: day 1 = 1 January 1, proleptic Gregorian.)
- **Weekday**: day 0 was a Wednesday. ISO weekday = ((D + 2) mod 7) + 1, Monday = 1.

## 2. The stamp

- **CZ+N:ddd** — N whole years and ddd days after Coordinate Zero, like an age. A CZ year runs from one 30 November to the next:
  year N begins on 30 November of the Gregorian year 2022 + N. ddd is the number of days since that anniversary, written with at least
  three digits (000 on the anniversary itself). Year 0 is the record's Year Zero.
- **CZ−N:ddd** — before Coordinate Zero, the mirror: N whole years and ddd days before it, counted back from the Nth 30 November before
  it. Year −N covers the days after 30 November of 2022 − N − 1 up to and including 30 November of 2022 − N; ddd = (D of 30 November
  of 2022 − N) − D. Day 0 is written CZ+0:000, never CZ−0:000.
- **Year length**: 365 days, or 366 when the CZ year contains a 29 February (CZ year N contains 29 February of 2023 + N). The leap
  years are the Gregorian calendar's.
- **Display** uses U+2212 (−) for the minus sign; anything typed or parsed accepts the ASCII hyphen-minus, U+2212 and the dashes.
- **Machine form**: the signed day count in ASCII, `CZ+1430`, `CZ-1997`. It sorts in time order and converts exactly.
- **A time of day** is written in UTC after the stamp: `CZ+3:334 09:15 UTC`. Machine-readable values beside a stamp stay ISO 8601
  (`<time datetime>`, JSON).

| CZ time | D | Gregorian |
|---|---|---|
| CZ−53:133 | −19,491 | 20 July 1969 |
| CZ−5:171 | −1,997 | 12 June 2017 |
| CZ−0:001 | −1 | 29 November 2022 |
| CZ+0:000 | 0 | 30 November 2022 |
| CZ+3:334 | 1,430 | 30 October 2026 |
| CZ+4:000 | 1,461 | 30 November 2026 |
| CZ+1000:000 | 365,242 | 30 November 3022 |
| CZ−1000:000 | −365,243 | 30 November 1022 |

## 3. Long spans and precision

The stamp grows a digit when the years do; nothing in it overflows. Where a single day is no longer meaningful, the years are written
alone with the units of deep time (ka, Ma, Ga: thousands, millions, billions of years): `CZ−4.54 Ga`. A date is written no more
precisely than it is known.

## 4. Converting from other calendars

| Calendar | Method | Range here |
|---|---|---|
| Gregorian | proleptic before 15 October 1582; astronomical years in data (0 = 1 BCE), BCE in text; H. Hinnant's day-count algorithms | years −9999 to 9999 |
| Julian | proleptic; the standard JDN algorithms | years −9999 to 9999 |
| Solar Hijri | K. Borkowski, "The Persian calendar for 3000 years" (1996), as jalaali-js (MIT) implements it: the year begins on the day of the March equinox if it falls before noon, Iran time, else the next day | 1 to 3177 SH |
| Lunar Hijri | Umm al-Qura (Saudi Arabia's civil calendar), month lengths as hijridate 2.6.0 (MIT) compiles them from official sources, for 1343–1500 AH (1 August 1924 – 16 November 2077); outside it, the tabular Islamic calendar (civil epoch 16 July 622 Julian; leap years 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 of 30), an approximation | from 1 AH |

Where months begin with the sighting of the crescent, the Lunar Hijri date can differ by a day by country; the published Umm al-Qura
record also has a few months of 28 or 31 days in its early years, kept as published. At 1 August 1924 the tabular calendar's last day
of 1342 AH and Umm al-Qura's first of 1343 AH fall on the same day; the converter uses Umm al-Qura from that day on.

**Checks before publication** (`site/test/cztime_crosscheck.py`): every day from 1 January 1 to 31 December 9999 against Python's
`datetime` and `convertdate` (Gregorian, Julian, weekday: 3,652,059 days); every day of the Umm al-Qura table against `hijridate`
(55,991 days) and every month's start and length; 3.37 million days of the tabular calendar against `convertdate`; every Solar Hijri day
from 1 to 3177 SH converted there and back; and the first day of each Solar Hijri year against an independent astronomical computation
of the equinox rule (`convertdate.persian`, with PyMeeus): they agree for every year from 1277 to 1502 SH (1898–2123 CE). In a few
years outside that window the first day differs by one (6 years in 1243–1276 SH, and 5, 166, 1503, 1602 SH), where the equinox falls
near noon and the result depends on the meridian and the model of the Earth's rotation.

## 5. Beyond Earth

The day count is an Earth count. These are conventions of this project, written down so that they can be checked; they are not
standards.

- A clock off Earth keeps CZ time as **T_CZ = TT − TT(E)**: the SI seconds of Terrestrial Time since Coordinate Zero began.
  TT(E) = 2022-11-30T00:00:00 UTC + 69.184 s = 2022-11-30T00:01:09.184 TT = JD 2459913.500800741 (TT), since TAI − UTC = 37 s (from
  1 January 2017) and TT − TAI = 32.184 s.
- Clocks run at other rates elsewhere: on the Moon's surface about 56.02 µs a day faster than on the Earth's geoid; on Mars about
  477.6 µs a day on average, varying over the Martian year (N. Ashby and B. Patla, arXiv:2402.11150, 2024, and arXiv:2507.21388, 2025).
  A local clock is converted to TT before it is compared.
- **Mars**: a sol is 88,775.244 s. The CZ sol is ⌊MSD⌋ − 52,936, where MSD is the Mars Sol Date (Allison and McEwen, *Planetary and
  Space Science* 48, 2000; MSD = (JD_TT − 2451549.5) / 1.0274912517 + 44796.0 − 0.0009626). Coordinate Zero began at MSD 52936.2151, so
  sol 0 is the sol during which it began; 30 October 2026, 00:00 UTC, is in CZ sol 1391.

## 6. Interfaces

- `GET /api/calendar` — today; `GET /api/calendar?d=…&c=…` — a conversion (`c`: `gregorian`, `solar-hijri`, `lunar-hijri`, `julian`,
  `cz`; `d`: year-month-day, a stamp `CZ+3:334`, or a day count `CZ+1430`); 400 with the reason for an invalid date. Also
  `/calendar.json`, and `/calendar` asked for as JSON. The contract: `/api/openapi.json` (`CZDay`).
- `/index.json` carries today's date as `cz_time`; the manifest (`/.well-known/civilization-zero.json`) carries the definition.
- Pages: the build writes a fallback between `<!--cz-now-->` and `<!--/cz-now-->` at the top of every page but the first (for copies
  that serve the files as they are); `api/page.js` and the room's functions put the live date there at request time from
  `room/cz-bar.json`. Pages are cached until the next 00:00 UTC.

## 7. What CZ time is not

A way of writing dates from the record's coordinate. It replaces no civil, religious or scientific calendar or time scale: it is
defined from UTC, TT and the Gregorian calendar, and converts to each exactly. "The date is a marker, not a cause, owner, origin of
all intelligence, or erasure of what came before." (CZ-CORE 1.0 §0)
