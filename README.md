# Bot de citas - Embajada de Japón en Colombia

Revisa automáticamente, cada hora, si aparece un cupo disponible en el
calendario de citas de visa de la Embajada de Japón en Colombia
(https://embjpcol.rsvsys.jp/reservations/calendar) para septiembre y
octubre de 2026, con 2 solicitudes, y avisa por Telegram cuando encuentra
un día realmente disponible.

## Cómo funciona

- Corre en GitHub Actions, no necesita tu computador encendido.
- Programación: un cron externo (cron-job.org) llama cada hora a la API de
  GitHub para disparar el workflow. El `schedule:` nativo de GitHub Actions
  NO se usa porque nunca llegó a dispararse en este repo (ver más abajo).
- Abre el calendario con un navegador real (Playwright, en modo invisible),
  pone "número de solicitudes" en 2, salta directo a septiembre, revisa
  día por día el ícono de cada celda y avanza a octubre.
- Detección: el atributo `alt` del sitio está mal puesto (siempre dice lo
  mismo sin importar el ícono real), así que la detección correcta es por
  el nombre del archivo del ícono (`src`): `icon_circle` = disponible,
  `icon_disabled` = completo.
- Ignora las fechas que estén en la constante `FECHAS_EXCLUIDAS` dentro de
  `index.js` (hoy: `2026-10-28`, porque ya hay una cita reservada ahí).
- Envía un mensaje de Telegram al iniciar cada chequeo, y otro con las
  fechas encontradas si hay disponibilidad real.

## Archivos principales

- `index.js` — el script completo (navegación, detección, Telegram).
- `.github/workflows/citas-visa-japon.yml` — la programación en GitHub Actions.
- `.env` — variables locales (token/chat de Telegram, modo headless).
  No se sube a git.
- `test-deteccion.js` + `fixture-disponible.html` — prueba local de la
  lógica de detección sin tocar el sitio real.
- `ultimo-run.log` — log de la última corrida local.

> `LEEME.md`, `diagnostico.js` y `com.citasjapon.bot.plist` son de una
> primera versión local (con `launchd`) que ya no se usa; se dejaron por
> si sirven de referencia, pero el bot real corre en GitHub Actions.

## Configuración de secretos (GitHub)

En el repo, en *Settings → Secrets and variables → Actions*, deben existir:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Probar en tu computador

En tu Terminal.app (no a través de Claude, por temas de red/permisos):

```bash
cd ~/Documents/dev/citas-japon-bot
npx playwright install chromium   # una sola vez
node index.js
```

En tu `.env`, con `HEADLESS=false` el navegador se abre visible (útil para
verificar visualmente); con `HEADLESS=true` (o sin esa variable) corre
invisible, igual que en GitHub Actions.

## Correrlo manualmente sin esperar la hora

- Desde GitHub: pestaña **Actions** → "Chequeo de citas Japon" → **Run workflow**.
- Desde terminal: `gh workflow run citas-visa-japon.yml`.

## Ver corridas pasadas

- https://github.com/felipe2323/citas-japon-bot/actions
- o `gh run list`.

## Por qué el disparo es externo y no con `schedule:`

El `schedule:` (cron) nativo de GitHub Actions nunca disparó en este repo,
pese a que todo estaba correcto: ruta `.github/workflows/`, archivo en la
rama default, YAML válido sin BOM ni CRLF, workflow en estado `active`, y
`workflow_dispatch` funcionando perfecto decenas de veces.

Se probaron sin éxito: cron en minuto 0, en minuto 7, cada 10 min y cada
30 min; renombrar el archivo y el workflow para forzar re-registro; y
cambiar el repo a público. Ninguna funcionó.

Es un problema conocido y sin resolver del lado de GitHub — hay varios
reportes con síntomas idénticos y sin respuesta oficial:
- https://github.com/orgs/community/discussions/202034
- https://github.com/orgs/community/discussions/201436
- https://github.com/orgs/community/discussions/199267

### Cómo se dispara ahora

Un job en https://cron-job.org hace cada hora:

    POST https://api.github.com/repos/felipe2323/citas-japon-bot/actions/workflows/citas-visa-japon.yml/dispatches
    Accept: application/vnd.github+json
    Authorization: Bearer <PAT fine-grained>
    X-GitHub-Api-Version: 2022-11-28
    Body: {"ref":"main"}

El token es un **fine-grained PAT** limitado a este único repositorio, con
un solo permiso: **Actions → Read and write**. Si expira (90 días), el bot
deja de correr silenciosamente: hay que renovarlo en GitHub y actualizarlo
en cron-job.org.
