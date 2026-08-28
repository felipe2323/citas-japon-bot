const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Abriendo la pagina...');
  await page.goto('https://embjpcol.rsvsys.jp/reservations/calendar', { waitUntil: 'networkidle', timeout: 60000 });

  console.log('Fijando numero de solicitudes en 2...');
  await page.selectOption('#stock', '2');
  await page.waitForTimeout(1500);

  console.log('Cambiando a vista mensual...');
  await page.click('a.js_change[data-value="month"]');
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'diagnostico-mes.png', fullPage: true });

  const html = await page.evaluate(() => {
    const el = document.querySelector('.js_calendar_container') || document.body;
    return el.outerHTML;
  });
  fs.writeFileSync('diagnostico-mes.html', html);

  console.log('Listo: diagnostico-mes.png y diagnostico-mes.html generados.');
  await browser.close();
})().catch((err) => { console.error('ERROR:', err); process.exit(1); });
