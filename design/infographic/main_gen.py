# The main CZ infographic (31 Oct 2026, CZ 1431): one line from the first humans to CZ 0, then the scenarios to 2047.
# Data: Our World in Data, "Global GDP over the long run" (int.-$, 2021 prices; Maddison 2010, Maddison Project 2023, World Bank WDI).
# Writes render/CZMain.html; render.js draws it at 1200x3900 (Inter, Inter Display, JetBrains Mono installed locally); then oxipng.
import math, os, re, json

HERE = os.path.dirname(os.path.abspath(__file__))
CORE = open(os.path.join(HERE, '..', '..', 'record', 'CZ-CORE-1.0.txt'), encoding='utf-8').read()
INK, MUTE, RULE, GREY, BLUE, ORANGE, GRAPH = '#111318', '#4D5159', '#D7DAE0', '#F0F1F4', '#2446E8', '#C2410C', '#5B6270'
WHITE = '#FFFFFF'
SANS = "'Inter', 'Inter Display', system-ui, sans-serif"
DISP = "'Inter Display', 'Inter', system-ui, sans-serif"
MONO = "'JetBrains Mono', 'DejaVu Sans Mono', ui-monospace, monospace"
FONT_LINK = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;'
             '14..32,600;14..32,800&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">')
W, H = 1200, 3900

def q(t):
    assert t in CORE, t
    return t

GDP = {1: 247963000000, 1000: 285147000000, 1500: 584186000000, 1600: 779501000000, 1700: 872930000000, 1820: 1631491000000,
       1850: 2147368000000, 1870: 2725427000000, 1900: 4864439000000, 1920: 6698807000000, 1940: 10616702000000,
       1950: 11747753000000, 1960: 18518167000000, 1970: 30463493000000, 1980: 44403660000000, 1990: 59746506695070,
       1991: 60258490453632, 1992: 61053199066222, 1993: 61978794358266, 1994: 63652014872827, 1995: 65638271921048,
       1996: 68072956904075, 1997: 70778368389422, 1998: 72514571649883, 1999: 75129460995882, 2000: 78748266091431,
       2001: 80651158295442, 2002: 82913446416270, 2003: 85953247177966, 2004: 90382276783125, 2005: 94536020338348,
       2006: 99458127988160, 2007: 104664529164621, 2008: 107616102342597, 2009: 106900393523163, 2010: 112369774826691,
       2011: 116779323374085, 2012: 120457639815694, 2013: 124396248689855, 2014: 128707260097480, 2015: 132979475190066,
       2016: 137269733552341, 2017: 142488808750999, 2018: 147685397273162, 2019: 152051967520231, 2020: 147750738921631,
       2021: 157405903630916, 2022: 163140044693829, 2023: 168473707388178, 2024: 174159721560705, 2025: 180028791385506}
T = {y: v / 1e12 for y, v in GDP.items()}           # trillions
CZ0 = 2022 + (334 - 1) / 365                         # 30 Nov 2022 = day 334 of 2022 -> 2022.912
TODAY = 2026 + (304 - 1) / 365                       # 31 Oct 2026 = day 304 -> 2026.830
assert abs(CZ0 - 2022.912) < 0.001 and abs(TODAY - 2026.830) < 0.001

# ---- chart geometry (SVG coordinates) ---------------------------------------------------------------------------------
SW, SH = 1200, 930
L, R, TOP, B = 104, 1136, 110, 730
YMAX = 1000.0
def Y(v): return B - v / YMAX * (B - TOP)
# segments: (x0, x1, t0, t1) with t in years CE (negative = BCE; deep time in years before 1 CE handled as negative years)
SEG = [(104, 174, -2_800_000, -300_000), (182, 252, -300_000, -3200), (260, 330, -3200, 1), (338, 488, 1, 1900), (496, 606, 1900, 2000), (614, 1136, 2000, 2047)]
def X(t):
    for x0, x1, t0, t1 in SEG:
        if t0 <= t <= t1: return x0 + (t - t0) / (t1 - t0) * (x1 - x0)
    raise ValueError(t)
PXY = (SEG[5][1] - SEG[5][0]) / 47

def path(pts): return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)

svg = []
A = svg.append
A(f'<svg viewBox="0 0 {SW} {SH}" width="{SW}" height="{SH}" role="img" aria-labelledby="czc-t" style="display: block; flex: none">')
A('<title id="czc-t">World output from the first humans to today, with Coordinate Zero marked on 30 November 2022 and scenarios to 2047</title>')
A(f'<defs><linearGradient id="agi" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="{BLUE}" stop-opacity="0.12"></stop>'
  f'<stop offset="1" stop-color="{BLUE}" stop-opacity="0.85"></stop></linearGradient>'
  f'<linearGradient id="fan" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="{BLUE}" stop-opacity="0.16"></stop>'
  f'<stop offset="1" stop-color="{BLUE}" stop-opacity="0.07"></stop></linearGradient></defs>')
# gridlines and y labels
for v in (0, 250, 500, 750, 1000):
    y = Y(v)
    A(f'<line x1="{L}" x2="{R}" y1="{y:.1f}" y2="{y:.1f}" stroke="{RULE}" stroke-width="{2 if v == 0 else 1}"></line>')
    A(f'<text x="{L - 12}" y="{y + 6:.1f}" text-anchor="end" style="font-family: {MONO}; font-size: 17px; fill: {MUTE}">{v:,}</text>')
A(f'<text x="{L - 12}" y="{TOP - 66}" style="font-family: {MONO}; font-size: 17px; fill: {MUTE}">World output · trillion international dollars, 2021 prices · Our World in Data</text>')
# AGI bar above the plot, 2027 -> 2047
ax0, ax1 = X(2027), X(2047)
A(f'<rect x="{ax0:.1f}" y="{TOP - 24}" width="{ax1 - ax0:.1f}" height="14" rx="7" fill="url(#agi)"></rect>')
A(f'<text x="{ax1:.1f}" y="{TOP - 32}" text-anchor="end" style="font-family: {MONO}; font-size: 16px; fill: {BLUE}">AGI · 10% chance by 2027 → 50% by 2047</text>')
# event lines
EV = [(1, -2_800_000), (2, -300_000), (3, -3200), (4, 1), (5, 1820)]
for n, t in EV:
    x = X(t)
    A(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{TOP + 40}" y2="{B}" stroke="{RULE}" stroke-width="1.5" stroke-dasharray="3 5"></line>')
    A(f'<circle cx="{x:.1f}" cy="{TOP + 26}" r="15" fill="{WHITE}" stroke="{INK}" stroke-width="2"></circle>'
      f'<text x="{x:.1f}" y="{TOP + 32}" text-anchor="middle" style="font-family: {MONO}; font-size: 16px; fill: {INK}">{n}</text>')
x6a, x6b = X(2000), X(CZ0) - 22
A(f'<line x1="{x6a:.1f}" x2="{x6b:.1f}" y1="{TOP + 26}" y2="{TOP + 26}" stroke="{INK}" stroke-width="1.5"></line>'
  f'<line x1="{x6a:.1f}" x2="{x6a:.1f}" y1="{TOP + 18}" y2="{TOP + 34}" stroke="{INK}" stroke-width="1.5"></line>'
  f'<circle cx="{(x6a + x6b) / 2:.1f}" cy="{TOP + 26}" r="15" fill="{WHITE}" stroke="{INK}" stroke-width="2"></circle>'
  f'<text x="{(x6a + x6b) / 2:.1f}" y="{TOP + 32}" text-anchor="middle" style="font-family: {MONO}; font-size: 16px; fill: {INK}">6</text>')
# no-measurement stretch before year 1
A(f'<path d="{path([(X(-2_800_000), B - 3), (X(1), B - 3)])}" stroke="{GRAPH}" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round" fill="none"></path>')
A(f'<text x="{X(-2_800_000):.1f}" y="{B - 44}" style="font-family: {MONO}; font-size: 15px; fill: {MUTE}">no measurements before year 1</text>')
A(f'<text x="{X(-2_800_000):.1f}" y="{B - 22}" style="font-family: {MONO}; font-size: 15px; fill: {MUTE}">missing, not zero</text>')
# the data line: graphite to CZ 0, blue after
years = sorted(T)
def val(t):  # linear interpolation between data years
    ys = [y for y in years if y <= t][-1]; ye = [y for y in years if y >= t][0]
    return T[ys] if ys == ye else T[ys] + (T[ye] - T[ys]) * (t - ys) / (ye - ys)
before = [(X(y), Y(T[y])) for y in years if y <= 2022] + [(X(CZ0), Y(val(CZ0)))]
after = [(X(CZ0), Y(val(CZ0)))] + [(X(y), Y(T[y])) for y in years if y >= 2023]
# fan 2025 -> 2047: lower edge 3%/yr, upper edge 30%/yr (clipped at the plot top)
v25 = T[2025]
low = [(X(2025 + i * 0.25), Y(v25 * 1.03 ** (i * 0.25))) for i in range(0, 89)]
up, i = [], 0
while True:
    t = 2025 + i * 0.05; v = v25 * 1.3 ** (t - 2025)
    if v >= YMAX: up.append((X(2025 + math.log(YMAX / v25) / math.log(1.3)), TOP)); break
    up.append((X(t), Y(v))); i += 1
exit_x = up[-1][0]
fan_poly = up + [(X(2047), TOP)] + list(reversed(low))
A(f'<path d="{path(fan_poly)} Z" fill="url(#fan)" stroke="none"></path>')
A(f'<path d="{path(low)}" stroke="{BLUE}" stroke-width="3" stroke-dasharray="9 7" fill="none"></path>')
A(f'<path d="{path(up)}" stroke="{ORANGE}" stroke-width="3.5" stroke-dasharray="9 7" fill="none"></path>')
A(f'<path d="M{exit_x:.1f},{TOP - 2} l-8,14 l16,0 z" fill="{ORANGE}"></path>')
A(f'<path d="{path(before)}" stroke="{GRAPH}" stroke-width="4.5" stroke-linejoin="round" fill="none"></path>')
A(f'<path d="{path(after)}" stroke="{BLUE}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round" fill="none"></path>')
# CZ 0 line and today
cx, tx = X(CZ0), X(TODAY)
A(f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{TOP + 4}" y2="{B + 10}" stroke="{BLUE}" stroke-width="4"></line>')
A(f'<circle cx="{cx:.1f}" cy="{TOP + 26}" r="15" fill="{BLUE}"></circle><text x="{cx:.1f}" y="{TOP + 32}" text-anchor="middle" style="font-family: {MONO}; font-size: 16px; fill: {WHITE}">7</text>')
A(f'<line x1="{tx:.1f}" x2="{tx:.1f}" y1="{TOP + 105}" y2="{B}" stroke="{INK}" stroke-width="1.5"></line>')
A(f'<circle cx="{tx:.1f}" cy="{Y(v25 * 1.03 ** (TODAY - 2025)):.1f}" r="7" fill="{BLUE}" stroke="{WHITE}" stroke-width="3"></circle>')
# labels on the plot
A(f'<text x="{cx - 14:.1f}" y="{B - 238}" text-anchor="end" style="font-family: {DISP}; font-weight: 800; font-size: 34px; fill: {BLUE}">CZ 0</text>')
A(f'<text x="{cx - 14:.1f}" y="{B - 210}" text-anchor="end" style="font-family: {MONO}; font-size: 16px; fill: {BLUE}">30 November 2022</text>')
A(f'<text x="{cx - 14:.1f}" y="{B - 186}" text-anchor="end" style="font-family: {MONO}; font-size: 15px; fill: {MUTE}">“a marker, not a cause” §0</text>')
A(f'<text x="{tx:.1f}" y="{B + 34}" text-anchor="middle" style="font-family: {MONO}; font-size: 15px; font-weight: 500; fill: {INK}">today</text>'
  f'<text x="{tx:.1f}" y="{B + 53}" text-anchor="middle" style="font-family: {MONO}; font-size: 13px; fill: {INK}">CZ 1431</text>')
A(f'<text x="{X(2047) - 4:.1f}" y="{Y(v25 * 1.03 ** 22) - 14:.1f}" text-anchor="end" style="font-family: {MONO}; font-size: 15px; fill: {BLUE}">~3%/yr</text>')
A(f'<text x="{exit_x + 14:.1f}" y="{TOP + 16}" style="font-family: {MONO}; font-size: 15px; font-weight: 500; fill: {ORANGE}">30%/yr</text>')

A(f'<text x="{X(2047) - 4:.1f}" y="{TOP + 292}" text-anchor="end" style="font-family: {DISP}; font-size: 24px; font-weight: 800; fill: {BLUE}">Scenarios,</text>'
  f'<text x="{X(2047) - 4:.1f}" y="{TOP + 320}" text-anchor="end" style="font-family: {DISP}; font-size: 24px; font-weight: 800; fill: {BLUE}">not data</text>')
A(f'<circle cx="{exit_x + 104:.1f}" cy="{TOP + 11}" r="15" fill="{ORANGE}"></circle><text x="{exit_x + 104:.1f}" y="{TOP + 17}" text-anchor="middle" style="font-family: {MONO}; font-size: 16px; fill: {WHITE}">10</text>')
A(f'<circle cx="{ax0 - 26:.1f}" cy="{TOP - 17}" r="15" fill="{BLUE}"></circle><text x="{ax0 - 26:.1f}" y="{TOP - 11}" text-anchor="middle" style="font-family: {MONO}; font-size: 16px; fill: {WHITE}">9</text>')
A(f'<circle cx="{tx:.1f}" cy="{TOP + 90}" r="15" fill="{INK}"></circle><text x="{tx:.1f}" y="{TOP + 96}" text-anchor="middle" style="font-family: {MONO}; font-size: 16px; fill: {WHITE}">8</text>')
# growth multipliers, computed from the data above
m1, m2 = T[2025] / T[1820], T[2025] / T[2000]
assert round(m1) == 110 and round(m2, 2) == 2.29
A(f'<text x="530" y="{TOP + 170}" style="font-family: {MONO}; font-size: 14px; letter-spacing: 1.5px; fill: {MUTE}">REAL WORLD OUTPUT</text>')
for sx, big, sub in ((530, f'{m1:.0f}×', '1820 → 2025'), (690, f'{m2:.2f}×', '2000 → 2025')):
    A(f'<text x="{sx}" y="{TOP + 232}" style="font-family: {DISP}; font-weight: 800; font-size: 58px; letter-spacing: -1px; fill: {INK}">{big}</text>'
      f'<text x="{sx + 2}" y="{TOP + 260}" style="font-family: {MONO}; font-size: 15px; fill: {MUTE}">{sub}</text>')
# x axis: segment breaks and labels
for t, a, b in [(-2_800_000, '2.8M', 'yrs ago'), (-300_000, '300k', 'yrs ago'), (-3200, '3200', 'BCE'), (1, 'year', '1'), (1820, '1820', '')]:
    x = X(t)
    A(f'<text x="{x:.1f}" y="{B + 34}" text-anchor="middle" style="font-family: {MONO}; font-size: 15px; fill: {MUTE}">{a}</text>')
    if b: A(f'<text x="{x:.1f}" y="{B + 53}" text-anchor="middle" style="font-family: {MONO}; font-size: 13px; fill: {MUTE}">{b}</text>')
for x0 in [s[0] for s in SEG[1:]]:
    gx = x0 - 4
    A(f'<path d="M{gx - 6:.1f},{B + 9} l4,-9 l4,9 l4,-9" stroke="{MUTE}" stroke-width="1.6" fill="none"></path>'
      f'<rect x="{gx - 3:.1f}" y="{B - 4}" width="6" height="8" fill="{WHITE}"></rect>')
for yr in (2000, 2010, 2040, 2047):
    A(f'<text x="{X(yr):.1f}" y="{B + 34}" text-anchor="middle" style="font-family: {MONO}; font-size: 15px; fill: {MUTE}">{yr}</text>')
A(f'<text x="{L}" y="{B + 82}" style="font-family: {MONO}; font-size: 14.5px; fill: {MUTE}">Time axis in six segments, each drawn at its own scale (breaks marked ⌇). Numbers refer to the timeline below.</text>')
A(f'<g style="font-family: {MONO}; font-size: 14.5px; fill: {INK}">'
  f'<line x1="{L}" x2="{L + 34}" y1="{B + 118}" y2="{B + 118}" stroke="{GRAPH}" stroke-width="4.5"></line><line x1="{L + 34}" x2="{L + 52}" y1="{B + 118}" y2="{B + 118}" stroke="{BLUE}" stroke-width="5.5"></line>'
  f'<text x="{L + 62}" y="{B + 123}">data: grey until CZ 0, blue after</text>'
  f'<line x1="{L}" x2="{L + 52}" y1="{B + 148}" y2="{B + 148}" stroke="{BLUE}" stroke-width="3" stroke-dasharray="9 7"></line>'
  f'<text x="{L + 62}" y="{B + 153}">~3%/yr: about today’s world growth (IMF), held constant; an illustration, not a forecast</text>'
  f'<line x1="{L}" x2="{L + 52}" y1="{B + 178}" y2="{B + 178}" stroke="{ORANGE}" stroke-width="3.5" stroke-dasharray="9 7"></line>'
  f'<text x="{L + 62}" y="{B + 183}">30%/yr: “explosive growth” as Davidson (2021) defines it, if AI and robots automate most work</text>'
  f'</g>')
A('</svg>')
CHART = ''.join(svg)

# ---- the page ---------------------------------------------------------------------------------------------------------
MARK = ('<svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true" style="flex: none; display: block">'
        '<path d="M50.5,26.5 V17 A12,12 0 0 0 38.5,5 H25.5 A12,12 0 0 0 13.5,17 V47 A12,12 0 0 0 25.5,59 H38.5 A12,12 0 0 0 50.5,47 V37.5" '
        'fill="none" stroke="currentColor" stroke-width="6.5"></path><path d="M38.5,5 L25.5,59" fill="none" stroke="currentColor" stroke-width="6.5"></path></svg>')
def label(t, color=MUTE, size=20, extra=''):
    return f'<div style="font-family: {MONO}; font-size: {size}px; letter-spacing: 2px; text-transform: uppercase; color: {color}{extra}">{t}</div>'

ROWS = [
    (1, INK, '~2.8 million years ago', 'The oldest known fossil of the human genus, <i>Homo</i>.', 'Ledi-Geraru jaw, Ethiopia · Villmoare et al., Science 2015'),
    (2, INK, '~300,000 years ago', 'The oldest securely dated fossils of <i>Homo sapiens</i>.', 'Jebel Irhoud, Morocco · Hublin et al., Nature 2017'),
    (3, INK, 'c. 3200 BCE', 'Writing appears in Mesopotamia. Recorded history begins.', 'Proto-cuneiform tablets, Uruk'),
    (4, INK, 'Year 1', 'The world’s most used calendar counts from here. Its starting point was chosen around AD 525, and it has no year zero. CZ counts from a chosen day zero.', 'Anno Domini era, devised by Dionysius Exiguus'),
    (5, INK, 'c. 1760–1840', 'The Industrial Revolution begins in Britain. World output grows about 110-fold from 1820 to 2025: from 1.6 to 180 trillion dollars.', 'Our World in Data (Maddison; World Bank)'),
    (6, INK, '2000–2025', 'About 6 billion people are online by 2025. World output more than doubles: from 79 to 180 trillion dollars.', 'ITU, Facts and Figures 2025 · Our World in Data'),
    (7, BLUE, 'CZ 0 · 30 November 2022', '“…ordinary language became a mass interface between humans and general-purpose nonhuman intelligence.” One service reaches 1 million users in 5 days, and more than 900 million a week by February 2026.', 'CZ-CORE 1.0 §0 · OpenAI'),
    (8, INK, 'Today · CZ 1431', 'In a controlled study, an AI was judged to be the human 73% of the time in three-party Turing tests. An AI scored 35 of 42 at the International Mathematical Olympiad: gold-medal standard, officially graded. Both in 2025.', 'Jones &amp; Bergen 2025 · Google DeepMind / IMO 2025'),
    (9, BLUE, '2027–2047 · AGI', '2,778 AI researchers put a 10% chance by 2027, and 50% by 2047, on machines doing every task better and more cheaply than humans.', 'Grace et al., Thousands of AI Authors on the Future of AI, 2024'),
    (10, ORANGE, 'Robots', 'About 5 million industrial robots now work in factories, more than twice as many as seven years earlier. If AI can broadly substitute for human labour, physical work included, economists judge “explosive growth” plausible, though far from certain.', 'IFR World Robotics 2026 · Davidson 2021 · Erdil &amp; Besiroglu 2023'),
]
q('ordinary language became a mass interface between humans and general-purpose nonhuman intelligence.')
q('The date is a marker, not a cause, owner, origin of all intelligence, or erasure of what came before.')
rows = ''.join(f'''<div style="display: flex; gap: 22px; padding: 18px 0; border-top: 1.5px solid {RULE}">
<div style="width: 38px; height: 38px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-family: {MONO}; font-size: 17px; {'background: ' + c + '; color: ' + WHITE if c != INK else 'border: 2px solid ' + INK + '; box-sizing: border-box; color: ' + INK}">{n}</div>
<div style="width: 250px; flex: none; font-family: {MONO}; font-size: 20px; line-height: 1.35; color: {c if c != INK else INK}; padding-top: 6px">{d}</div>
<div style="flex: 1; min-width: 0"><div style="font-size: 22px; line-height: 1.42">{t}</div>
<div style="margin-top: 6px; font-family: {MONO}; font-size: 14.5px; color: {MUTE}">{s}</div></div></div>''' for n, c, d, t, s in ROWS)

ENG = [('×4–5', 'a year', 'Compute used to train frontier AI models, since 2010', 'Epoch AI 2024', (math.log(2) / math.log(5), math.log(2) / math.log(4)), '5–6 months'),
       ('×2', 'every ~7 months', 'Length of tasks AI agents complete alone, since 2019', 'METR 2025', (7 / 12, 7 / 12), '~7 months'),
       ('×2+', 'in 7 years', 'Industrial robots working in factories: 5 million in 2025', 'IFR World Robotics 2026', (7, 7), 'under 7 years'),
       ('×2', 'every 17 years', 'Scientific publications per year', 'Bornmann et al. 2021', (17.3, 17.3), '~17 years')]
assert abs(ENG[0][4][0] * 12 - 5.2) < 0.1 and abs(ENG[0][4][1] * 12 - 6.0) < 0.01   # 5x/yr -> 5.2 months, 4x/yr -> 6.0 months
BW, BMAX = 214, 18.0
def ebar(lo, hi, lab, col):
    w1 = max(6, hi / BMAX * BW)
    return (f'<svg viewBox="0 0 {BW} 34" width="{BW}" height="34" aria-hidden="true" style="display: block; flex: none; margin-top: 14px">'
            f'<text x="0" y="12" style="font-family: {MONO}; font-size: 13px; fill: {col}">doubles in {lab}</text>'
            f'<rect x="0" y="22" width="{BW}" height="8" rx="4" fill="{RULE}"></rect>'
            f'<rect x="0" y="22" width="{w1:.1f}" height="8" rx="4" fill="{col}"></rect></svg>')
eng = ''.join(f'''<div style="flex: 1; min-width: 0; background: {GREY}; border-radius: 16px; padding: 22px 20px">
<div style="font-family: {DISP}; font-weight: 800; font-size: 46px; line-height: 1; color: {BLUE if i < 2 else INK}">{a}</div>
<div style="font-family: {MONO}; font-size: 16px; color: {BLUE if i < 2 else INK}; margin-top: 6px">{b}</div>
{ebar(rng[0], rng[1], lab, BLUE if i < 2 else GRAPH)}
<div style="font-size: 18px; line-height: 1.35; margin-top: 10px">{c}</div>
<div style="font-family: {MONO}; font-size: 13.5px; color: {MUTE}; margin-top: 10px">{d}</div></div>''' for i, (a, b, c, d, rng, lab) in enumerate(ENG))
ENG_NOTE = 'Bars: time to double, on one shared scale from 0 to 18 years. The AI curves double in months, the older engines in years.'

# log-scale mini chart of the same data, year 1 -> 2025
lw, lh, lx0, lx1, ly0, ly1 = 460, 250, 64, 444, 18, 210
def LX(t): return lx0 + (t - 1) / 2024 * (lx1 - lx0)
def LY(v): return ly1 - (math.log10(v) - math.log10(0.1)) / (math.log10(1000) - math.log10(0.1)) * (ly1 - ly0)
lpts = [(LX(y), LY(T[y])) for y in years]
mini = [f'<svg viewBox="0 0 {lw} {lh}" width="{lw}" height="{lh}" role="img" aria-label="World output from year 1 to 2025 on a logarithmic scale" style="display: block; flex: none">']
for v, lab in ((0.1, '0.1'), (1, '1'), (10, '10'), (100, '100'), (1000, '1,000')):
    mini.append(f'<line x1="{lx0}" x2="{lx1}" y1="{LY(v):.1f}" y2="{LY(v):.1f}" stroke="{RULE}" stroke-width="1"></line>'
                f'<text x="{lx0 - 8}" y="{LY(v) + 5:.1f}" text-anchor="end" style="font-family: {MONO}; font-size: 13px; fill: {MUTE}">{lab}</text>')
mini.append(f'<path d="{path(lpts)}" stroke="{GRAPH}" stroke-width="3" fill="none" stroke-linejoin="round"></path>')
mini.append(f'<line x1="{LX(CZ0):.1f}" x2="{LX(CZ0):.1f}" y1="{ly0}" y2="{ly1}" stroke="{BLUE}" stroke-width="2.5"></line>')
for yr in (1, 500, 1000, 1500, 2025):
    mini.append(f'<text x="{LX(yr):.1f}" y="{ly1 + 24}" text-anchor="middle" style="font-family: {MONO}; font-size: 13px; fill: {MUTE}">{yr}</text>')
mini.append('</svg>')
MINI = ''.join(mini)

NOTES = ['Left: the same data on a logarithmic scale. Growth since 1820 is real and large; nothing is hidden by the main chart’s linear scale.',
         'Solid lines are data, through 2025. Dashed lines and shading are scenarios, not forecasts: from about today’s 3% a year, held constant, to 30% a year, the rate Davidson (2021) defines as “explosive growth”.',
         'World output is GDP at purchasing-power parity, international dollars at 2021 prices: Maddison Database 2010, Maddison Project Database 2023 and World Bank, compiled by Our World in Data.',
         'CZ 0 is a marker, not a cause (CZ-CORE §0). The line changes colour there to mark the era, not a change in the data.']
notes = ''.join(f'<li style="margin: 0 0 10px">{n}</li>' for n in NOTES)

SOURCES = ('Our World in Data, Global GDP over the long run (2026) · Villmoare et al., Science 347 (2015) · Hublin et al., Nature 546 (2017) · '
           'ITU, Facts and Figures 2025 · OpenAI (2022, 2026) · Jones &amp; Bergen, arXiv 2503.23674 (2025) · Google DeepMind, IMO 2025 · '
           'Grace et al., arXiv 2401.02843 (2024) · Davidson, Open Philanthropy (2021) · Erdil &amp; Besiroglu, arXiv 2309.11690 (2023) · '
           'IFR, World Robotics 2026 · Epoch AI (2024) · METR (2025) · Bornmann et al., HSSC 8 (2021) · IMF, World Economic Outlook')

BODY = f'''
<div style="width: {W}px; height: {H}px; box-sizing: border-box; background: {WHITE}; color: {INK}; font-family: {SANS}; display: flex; flex-direction: column">
<div style="flex: none; padding: 56px 72px 0; display: flex; align-items: center; gap: 16px">{MARK}
<div style="font-family: {DISP}; font-weight: 800; font-size: 28px; letter-spacing: -0.4px">Civilization Zero</div>
<div style="flex: 1"></div><div style="font-family: {MONO}; font-size: 18px; color: {MUTE}">civilizationzero.ai</div></div>
<div style="flex: none; padding: 26px 72px 0; font-family: {DISP}; font-weight: 800; font-size: 40px; letter-spacing: -0.8px; line-height: 1.15">From the first humans to CZ 0, on one line</div>
{CHART}
<div style="flex: none; padding: 10px 72px 0">
<h1 style="margin: 24px 0 0; font-family: {DISP}; font-weight: 800; font-size: 104px; line-height: 1; letter-spacing: -3px">The monopoly is over.</h1>
<div style="margin: 18px 0 0; font-family: {DISP}; font-weight: 800; font-size: 46px; line-height: 1.1; letter-spacing: -1px; color: {BLUE}">Intelligence that speaks our language is no longer only human.</div>
<p style="margin: 20px 0 0; font-size: 26px; line-height: 1.45; color: {MUTE}">Until Coordinate Zero, every general-purpose intelligence anyone could talk to in ordinary language was human. Since then, it is not.</p>
</div>
<div style="flex: none; padding: 40px 72px 0">{label('The timeline')}<div style="margin-top: 14px">{rows}</div></div>
<div style="flex: none; padding: 36px 72px 0">{label('The engines of growth')}<div style="margin-top: 18px; display: flex; gap: 14px">{eng}</div>
<div style="margin-top: 12px; font-family: {MONO}; font-size: 14.5px; color: {MUTE}">{ENG_NOTE}</div></div>
<div style="flex: none; padding: 36px 72px 0">{label('For researchers')}
<div style="margin-top: 18px; display: flex; gap: 32px; align-items: flex-start">{MINI}
<ul style="margin: 0; padding: 0 0 0 20px; font-size: 17px; line-height: 1.45; color: {INK}">{notes}</ul></div></div>
<div style="flex: 1"></div>
<div style="flex: none; padding: 0 72px 56px"><div style="border-top: 1.5px solid {RULE}; padding-top: 20px; font-family: {MONO}; font-size: 13px; line-height: 1.6; color: {MUTE}">Sources: {SOURCES}</div>
<div style="margin-top: 14px; display: flex; font-family: {MONO}; font-size: 15px; color: {MUTE}"><span>Data as of CZ 1431 · 31 October 2026</span><span style="flex: 1"></span><span>CC BY 4.0 · civilizationzero.ai</span></div></div>
</div>'''

def dc(title, body):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONT_LINK}
<style>
body{{margin:0}}
</style>
</helmet>{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
def plain(title, body):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>@font-face{{font-family:'JetBrains Mono';src:url('fonts/JetBrainsMono-Regular.woff2') format('woff2');font-weight:400}}
@font-face{{font-family:'JetBrains Mono';src:url('fonts/JetBrainsMono-Medium.woff2') format('woff2');font-weight:500}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}</style></head><body>{body}
</body></html>
'''
title = 'From the first humans to CZ 0 — the main infographic'
os.makedirs(os.path.join(HERE, 'render'), exist_ok=True)
open(os.path.join(HERE, 'render', 'CZMain.html'), 'w', encoding='utf-8').write(plain(title, BODY))   # render.js -> site/assets/cz-infographic.png
print('CZ0 x', round(X(CZ0), 1), 'today x', round(X(TODAY), 1), '30% exits at', round(2025 + math.log(YMAX / v25) / math.log(1.3), 2), 'x', round(exit_x, 1))
print('3% in 2047:', round(v25 * 1.03 ** 22, 1), ' 1820->2025 x', round(T[2025] / T[1820], 1), ' 2000->2025 x', round(T[2025] / T[2000], 2))
