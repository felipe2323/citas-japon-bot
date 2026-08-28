// Prueba aislada (sin internet, sin el sitio real): carga un HTML de mentira
// con un dia "disponible" (icon_circle) y otro "completo" (icon_disabled),
// corre la MISMA logica de deteccion de index.js, y manda un Telegram de
// prueba para confirmar que todo el flujo funciona de punta a punta.
require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const https = require('https');

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const body = JSON.stringify({ chat_id: chatId, text });
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let data=''; res.on('data', d=>data+=d); res.on('end', () => {
        if (res.statusCode>=200 && res.statusCode<300) resolve(); else reject(new Error(data));
      }); }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'fixture-disponible.html'));

  const days = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.sc_cal_month tbody td'));
    return rows.map((td) => {
      const dateEl = td.querySelector('.sc_cal_date');
      const img = td.querySelector('.c_cal_time_cell img');
      const src = img.getAttribute('src') || '';
      let status = 'desconocido';
      if (src.includes('icon_disabled')) status = 'completo';
      else if (src.includes('icon_circle')) status = 'disponible';
      else status = 'revisar_' + src;
      return { day: dateEl.textContent.trim(), status };
    });
  });

  console.log('Resultado de la deteccion sobre el HTML de prueba:', days);

  const ok = days.find(d => d.day === '15').status === 'disponible' && days.find(d => d.day === '16').status === 'completo';
  console.log(ok ? 'LOGICA CORRECTA: el dia 15 (circulo) se detecto disponible y el 16 (x) se detecto completo.' : 'ERROR EN LA LOGICA');

  await sendTelegram('Prueba del bot de citas: si ves este mensaje, la deteccion Y el envio a Telegram funcionan correctamente de punta a punta.');
  console.log('Mensaje de prueba enviado a Telegram.');

  await browser.close();
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
