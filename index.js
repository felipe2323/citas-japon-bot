// Bot de verificacion de citas - Embajada de Japon en Colombia
// Revisa septiembre y octubre 2026 con 2 solicitudes, y avisa por Telegram
// cuando aparece un dia con cupos disponibles que no se habia visto antes.

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://embjpcol.rsvsys.jp/reservations/calendar';
const STOCK = '2';
const TARGET_MONTHS = [
  { year: 2026, month: 9 },  // septiembre
  { year: 2026, month: 10 }, // octubre
];
// Fechas que ya tienen cita reservada / no interesan, en formato YYYY-MM-DD.
// Aunque el sitio muestre disponibilidad ahi, el script las ignora por completo
// (no cuentan para la notificacion). Agrega o quita fechas aqui cuando haga falta.
const FECHAS_EXCLUIDAS = [
  '2026-10-28',
];
const LOG_FILE = path.join(__dirname, 'ultimo-run.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId || token.includes('pon_aqui')) {
      log('AVISO: no hay TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID configurados en .env, no se envia notificacion.');
      return resolve();
    }
    const body = JSON.stringify({ chat_id: chatId, text });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`Telegram respondio ${res.statusCode}: ${data}`));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getCurrentYearMonth(page) {
  const text = await page.locator('.c_cal_navex_date .date').innerText();
  // formato esperado: "2026年\n08月"
  const yearMatch = text.match(/(\d{4})年/);
  const monthMatch = text.match(/(\d{1,2})月/);
  return {
    year: parseInt(yearMatch[1], 10),
    month: parseInt(monthMatch[1], 10),
  };
}

async function clickNextMonth(page) {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/ajax/reservations/calendar') && r.request().method() === 'POST'),
    page.click('a.next01.js_change_date'),
  ]);
  await resp.finished();
  await page.waitForTimeout(150);
}

async function extractAvailableDays(page) {
  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.sc_cal_month tbody td'));
    const results = [];
    for (const td of rows) {
      // saltar celdas de relleno (dias de otro mes)
      if (td.getAttribute('style') && td.getAttribute('style').includes('E3E3E3')) continue;
      const dateEl = td.querySelector('.sc_cal_date');
      const img = td.querySelector('.c_cal_time_cell img');
      if (!dateEl || !img) continue;
      const day = dateEl.textContent.trim();
      // OJO: el atributo alt del sitio esta mal puesto (siempre menciona
      // disponibilidad sin importar el icono real). La deteccion correcta
      // es por el nombre del archivo del icono:
      // icon_circle.svg = disponible (o), icon_disabled.svg = completo (x).
      const src = img.getAttribute('src') || '';
      let status = 'desconocido';
      // A prueba de fallos: solo tratamos como "completo" el icono que
      // conocemos con certeza (icon_disabled). Cualquier otra cosa
      // (icon_circle, o un icono que no reconozcamos) se trata como
      // "revisar" para no arriesgarnos a quedarnos callados ante un
      // icono real de disponibilidad que no hayamos anticipado.
      if (src.includes('icon_disabled')) status = 'completo';
      else if (src.includes('icon_circle')) status = 'disponible';
      else status = 'revisar_' + src;
      results.push({ day, status, src });
    }
    return results;
  });
}

(async () => {
  log('=== Iniciando chequeo ===');
  const headless = process.env.HEADLESS !== 'false';
  log(`Modo: ${headless ? 'invisible (headless)' : 'con ventana visible'}`);
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 400 });
  const page = await browser.newPage();
  const disponibles = [];

  // No necesitamos ver imagenes/fuentes/videos para nada (la deteccion lee el
  // atributo src del HTML, no el contenido real de la imagen), asi que las
  // bloqueamos para que la pagina cargue mas rapido. Dejamos CSS intacto
  // porque el layout/visibilidad de los botones depende de el para que
  // Playwright pueda hacer click correctamente.
  await page.route('**/*', (route) => {
    const tipo = route.request().resourceType();
    if (tipo === 'image' || tipo === 'media' || tipo === 'font') {
      return route.abort();
    }
    return route.continue();
  });

  try {
    // domcontentloaded + esperar el select puntual es mucho mas rapido y
    // confiable que 'networkidle' (que puede quedarse esperando de mas por
    // trackers/beacons que nunca terminan de "estar quietos").
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#stock', { state: 'visible', timeout: 30000 });

    // fijar numero de solicitudes en 2
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/ajax/reservations/calendar') || r.url().includes('interval-stock'), { timeout: 15000 }).catch(() => {}),
      page.selectOption('#stock', STOCK),
    ]);
    await page.waitForTimeout(250);

    // cambiar a vista mensual
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/ajax/reservations/calendar') && r.request().method() === 'POST'),
      page.click('a.js_change[data-value="month"]'),
    ]);
    await page.waitForTimeout(150);

    let current = await getCurrentYearMonth(page);
    log(`Mes actual mostrado: ${current.year}-${current.month}`);

    let guard = 0;
    while (guard < 36) {
      guard++;
      const target = TARGET_MONTHS.find((m) => m.year === current.year && m.month === current.month);
      const pastAllTargets = TARGET_MONTHS.every(
        (m) => current.year > m.year || (current.year === m.year && current.month > m.month)
      );

      if (pastAllTargets) {
        log('Ya pasamos todos los meses objetivo, deteniendo.');
        break;
      }

      if (target) {
        const days = await extractAvailableDays(page);
        const dispEsteMes = days.filter((d) => d.status === 'disponible' || d.status.startsWith('revisar_'));
        log(`${current.year}-${String(current.month).padStart(2, '0')}: ${dispEsteMes.length} dia(s) disponible(s) de ${days.length} revisados.`);
        for (const d of dispEsteMes) {
          const fecha = `${current.year}-${String(current.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
          if (FECHAS_EXCLUIDAS.includes(fecha)) {
            log(`  -> ${fecha} esta en FECHAS_EXCLUIDAS, se ignora.`);
            continue;
          }
          disponibles.push(fecha);
        }

        if (!headless) {
          log('Modo visible: esperando 3 segundos en este mes...');
          await page.waitForTimeout(3000);
        }
      }

      const lastTarget = TARGET_MONTHS[TARGET_MONTHS.length - 1];
      if (current.year === lastTarget.year && current.month === lastTarget.month) break;

      await clickNextMonth(page);
      current = await getCurrentYearMonth(page);
    }
  } finally {
    await browser.close();
  }

  log(`Disponibles encontrados: ${disponibles.length ? disponibles.join(', ') : '(ninguno)'}`);

  if (disponibles.length > 0) {
    const msg = `Hay disponibilidad de citas de visa (2 solicitudes) en:\n${disponibles.join('\n')}\n\n${URL}`;
    log(`Enviando notificacion por Telegram: ${disponibles.join(', ')}`);
    await sendTelegram(msg);
  } else {
    log('Sin disponibilidad esta vez.');
  }

  log('=== Chequeo terminado ===\n');
})().catch((err) => {
  log('ERROR FATAL: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
