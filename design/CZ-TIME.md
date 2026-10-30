# CZ time

How the dates of Civilization Zero are written: the originator's decisions of 30 October 2026 (CZ 1430). CZ time is the basis of the
site's dates; every date on civilizationzero.ai is written in it; the date is the count of days since Coordinate Zero. Today's date is at
the top of every page, linked to [/calendar](https://civilizationzero.ai/calendar), which explains it and holds a date converter and a
time converter. This file is the definition; `site/room/cztime.js` (at request time) and `site/lib.py` (at build time) implement it, and
`site/check.py` compares the two at every build.

## 1. The day count

- **Day 0** is Coordinate Zero: 30 November 2022, the day that began at 00:00 UTC (CZ-CORE 1.0 §0: "30 November 2022 is selected as
  Year Zero of this record").
- **A CZ day is a UTC day**: 24 hours, beginning at 00:00 UTC everywhere. The clock is unchanged; only the days are counted.
- **D**, the CZ day number, is the count of days from day 0, negative before it:

  ```
  D = JDN − 2,459,914 = MJD − 59,913 = ⌊Unix time / 86,400⌋ − 19,326 = Rata Die − 738,489
  ```

  (JDN: Julian Day Number of the day; MJD: Modified Julian Date at 00:00 UTC; Rata Die: day 1 = 1 January 1, proleptic Gregorian.)
- **Weekday**: day 0 was a Wednesday. ISO weekday = ((D + 2) mod 7) + 1, Monday = 1.

## 2. How a date is written

- **The date is the count**: `CZ 1430` (30 October 2026); `CZ 0` is Coordinate Zero; `CZ −1` is 29 November 2022; `CZ −1997` is 12 June
  2017. No months, no leap rules, no borrowed years: one number, the same for every reader. Display uses U+2212 (−) for the minus sign and
  no thousands separators (`CZ 365242`); anything typed or parsed accepts the hyphen-minus, U+2212 and the dashes, and Persian and Arabic
  digits.
- **A time of day** follows the date, in UTC: `CZ 1430 15:20 UTC`; with seconds, `CZ 1430 15:20:42 UTC`. (The colon is kept for hours and
  minutes, as everywhere; a space separates the day from the time.)
- **The machine form** is the same count, signed, in ASCII, without a space: `CZ+1430`, `CZ-1997`. It sorts in time order. Beside a date
  in a page, the ISO value stays in `<time datetime>`; the data forms (JSON, the API, the archive's files) keep ISO 8601.
- **Only days are counted** (the originator's decision of 30 October 2026, after the first two releases): a CZ date has no months and
  no years, and the pages say so in one line under the date ("CZ time counts only days."). The anniversaries of Coordinate Zero still fall
  on each 30 November (the fourth, the public launch, on CZ 1461; the fifth on CZ 1826). For machines, the API still gives the year of the
  record and the day within it (`cz.year`, `cz.day_of_year`, `cz.year_day`: CZ 1430 is year 3, day 334, `CZ+3:334`; before zero `CZ−5:171`,
  counted back from the fifth 30 November before it), a secondary reading the pages do not print; it was the site's first notation for a
  few hours on 30 October 2026, and the converter still reads it.

| CZ | Gregorian |
|---|---|
| CZ −19491 | 20 July 1969 |
| CZ −1997 | 12 June 2017 |
| CZ −1 | 29 November 2022 |
| CZ 0 | 30 November 2022 |
| CZ 1430 | 30 October 2026 |
| CZ 1461 | 30 November 2026 — the public launch, on the fourth anniversary |
| CZ 2048 | 9 July 2028 — the first scheduled review of the Core |
| CZ 365242 | 30 November 3022 |
| CZ −365243 | 30 November 1022 |

## 3. Every date on the site

- Every date the site prints is a CZ date, and a link to the converter for that day (`/calendar?d=CZ+1430`). A moment is the date and
  its time in UTC: `CZ 1429 18:46 UTC` (an entry of the discussion), `CZ 1428 18:29 UTC` (the room's opening).
- **Not converted**: the canonical texts (CZ-CORE 1.0, CZ-IR 1.0) and their translations, which keep their own words (Core §15: "The origin
  must remain intact"); Coordinate Zero's own date, 30 November 2022, which is the anchor every CZ date is counted from and is written once
  where CZ time is explained (the first page's header, the line under the date on every other page, the footer); the converter's page,
  which shows the other calendars on purpose; data forms (ISO 8601); citations' years.
- The objections register's source text (`record/OBJECTIONS-1.0.md`) is unchanged; its page shows its dates in CZ time.
- **At the top of every page** but the first: the date (`CZ 1430`, a link to /calendar) and two links, the date converter and the time
  converter; under them one line, "Day 1430 since Coordinate Zero, 30 November 2022". **The first page's header**: the date as its heading,
  then "Day 1430 / since Coordinate Zero, 30 November 2022", "CZ time counts only days.", and the links (date converter, time converter, how
  it works). Coordinate Zero's Gregorian date appears there once. No years are described in either (the originator's decision of 30 October
  2026). The converting happens on `/calendar`, never in the page: the site stays a record, not a converter; its result gives the count of
  days from Coordinate Zero ("1430 days after Coordinate Zero"), not years.

## 4. Converting from other calendars

Each calendar is written in its own script only: the Gregorian and the Julian in Latin letters, the Solar Hijri in Persian (هجری شمسی,
۸ آبان ۱۴۰۵, with Persian digits), the Lunar Hijri in Arabic (التقويم الهجري, ١٩ جمادى الأولى ١٤٤٨ هـ, with Arabic-Indic digits).

| Calendar | Method | Range here |
|---|---|---|
| Gregorian | proleptic before 15 October 1582; astronomical years in data (0 = 1 BCE), BCE in text; H. Hinnant's day-count algorithms | years −9999 to 9999 |
| Julian | proleptic; the standard JDN algorithms | years −9999 to 9999 |
| Solar Hijri | K. Borkowski, "The Persian calendar for 3000 years" (1996), as jalaali-js (MIT) implements it: the year begins on the day of the March equinox if it falls before noon, Iran time, else the next day | 1 to 3177 SH |
| Lunar Hijri | Umm al-Qura (Saudi Arabia's civil calendar), month lengths as hijridate 2.6.0 (MIT) compiles them from official sources, for 1343–1500 AH (1 August 1924 – 16 November 2077); outside it, the tabular Islamic calendar (civil epoch 16 July 622 Julian; leap years 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 of 30), an approximation | from 1 AH |

Where months begin with the sighting of the crescent, the Lunar Hijri date can differ by a day by country; the published Umm al-Qura
record also has a few months of 28 or 31 days in its early years, kept as published. At 1 August 1924 the tabular calendar's last day
of 1342 AH and Umm al-Qura's first of 1343 AH fall on the same day; the converter uses Umm al-Qura from that day on.

**The time converter** takes a local date (in any of the calendars), a time and a time zone (any IANA zone; the page offers common ones),
and gives the CZ date and the UTC time of that moment, the zone's offset, and the local time at which a CZ day begins there (03:30 in
Tehran, 08:00 in Kuala Lumpur). Offsets come from the runtime's time zone database, so summer time and a zone's history are counted
(16:17:40 in New York on 20 July 1969 is CZ −19491 20:17:40 UTC). In a gap or overlap of summer time, the first offset is used.

**Checks before publication** (`site/test/cztime_crosscheck.py`): every day from 1 January 1 to 31 December 9999 against Python's
`datetime` and `convertdate` (Gregorian, Julian, weekday: 3,652,059 days); every day of the Umm al-Qura table against `hijridate`
(55,991 days) and every month's start and length; 3.37 million days of the tabular calendar against `convertdate`; every Solar Hijri day
from 1 to 3177 SH converted there and back; and the first day of each Solar Hijri year against an independent astronomical computation
of the equinox rule (`convertdate.persian`, with PyMeeus): they agree for every year from 1277 to 1502 SH (1898–2123 CE). In a few
years outside that window the first day differs by one (6 years in 1243–1276 SH, and 5, 166, 1503, 1602 SH), where the equinox falls
near noon and the result depends on the meridian and the model of the Earth's rotation. `site/test/cztime_functions.test.js` checks the
pages, the converters and the API.

## 5. Long spans and precision

The count grows a digit at a time and never overflows: a thousand years after Coordinate Zero is CZ 365242. Where a single day is no
longer meaningful, the years are written alone with the units of deep time (ka, Ma, Ga: thousands, millions, billions of years):
`CZ −4.54 Ga`. A date is written no more precisely than it is known.

## 6. Beyond Earth

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
  sol 0 is the sol during which it began; CZ 1430 00:00 UTC is in CZ sol 1391.

## 7. Interfaces

- `GET /api/calendar` — today; `GET /api/calendar?d=…&c=…` — a conversion (`c`: `gregorian`, `solar-hijri`, `lunar-hijri`, `julian`,
  `cz`; `d`: year-month-day, or a CZ date `CZ 1430` / `CZ+1430`; year and day `CZ+3:334` is read too); 400 with the reason for an invalid
  date. Also `/calendar.json`, and `/calendar` asked for as JSON. The contract: `/api/openapi.json` (`CZDay`: `cz.date` "CZ 1430",
  `cz.machine` "CZ+1430", `cz.day`, `cz.year`, `cz.day_of_year`, `cz.year_day`).
- `/index.json` carries today's date as `cz_time`; the manifest (`/.well-known/civilization-zero.json`) carries the definition.
- Pages: the build writes a fallback between `<!--cz-now-->` and `<!--/cz-now-->` at the top of every page but the first (for copies
  that serve the files as they are: no date, links to this site); `api/page.js` and the room's functions put the live date there at
  request time from `room/cz-bar.json`. Pages are cached until the next 00:00 UTC, when the date turns.

## 8. What CZ time is not

A way of writing dates from the record's coordinate. It replaces no civil, religious or scientific calendar or time scale: it is
defined from UTC, TT and the Gregorian calendar, and converts to each exactly. "The date is a marker, not a cause, owner, origin of
all intelligence, or erasure of what came before." (CZ-CORE 1.0 §0)
