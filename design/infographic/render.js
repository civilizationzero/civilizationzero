const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 3900 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'render', 'CZMain.html')); await p.evaluate(() => document.fonts.ready);
  const m = await p.evaluate(() => { const r = document.body.firstElementChild; const spacer = [...r.children].find(e => e.style.flex === '1 1 0%' || e.style.flex === '1');
    const last = r.lastElementChild.getBoundingClientRect(); return { sh: r.scrollHeight, ch: r.clientHeight, spacer: spacer ? Math.round(spacer.getBoundingClientRect().height) : null, footerBottom: Math.round(last.bottom),
      over: [...r.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.right > 1200.5; }).slice(0,3).map(e => e.tagName + ' ' + (e.textContent||'').slice(0,40)) }; });
  console.log(JSON.stringify(m));
  await p.screenshot({ path: path.join(__dirname, '..', '..', 'site', 'assets', 'cz-infographic.png') }); await b.close();
})();
