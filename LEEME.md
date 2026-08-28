# Bot de citas - Embajada de Japon en Colombia

Revisa cada hora si aparece un cupo disponible en septiembre u octubre 2026
(con 2 solicitudes) en el calendario de citas de visa, y avisa por Telegram.

## Paso 1: configurar el bot de Telegram

Edita el archivo `.env` (con TextEdit o el editor que prefieras, NO lo compartas
con nadie) y pon tu token y chat_id reales:

    TELEGRAM_BOT_TOKEN=tu_token_real
    TELEGRAM_CHAT_ID=tu_chat_id_real

## Paso 2: instalar el navegador (una sola vez)

En tu Terminal.app (no a traves de Claude):

    cd ~/Documents/dev/citas-japon-bot
    npx playwright install chromium

## Paso 3: probar el script manualmente

    node index.js

Revisa lo que imprime en pantalla y el archivo ultimo-run.log. Deberia decir
cuantos dias disponibles encontro en septiembre y octubre (probablemente 0
por ahora), y si hay algo nuevo, te deberia llegar un mensaje de Telegram.

Si falla, copia el error completo y comparteselo a Claude.

## Paso 4: dejarlo corriendo solo cada hora (launchd)

1. Averigua la ruta de node:

       which node

2. Abre el archivo `com.citasjapon.bot.plist` de esta carpeta y reemplaza:
   - `__NODE_PATH__` por la ruta que te dio `which node`
   - `__PROJECT_DIR__` (aparece 3 veces) por la ruta completa de esta carpeta:
     `/Users/luisfvalencia/Documents/dev/citas-japon-bot`

3. Copia el archivo a LaunchAgents y cargalo:

       cp com.citasjapon.bot.plist ~/Library/LaunchAgents/
       launchctl load ~/Library/LaunchAgents/com.citasjapon.bot.plist

   A partir de ahi corre solo cada hora mientras tu Mac este encendida,
   sin necesidad de tener Claude ni Terminal abiertos.

4. Para pausarlo despues, si quieres:

       launchctl unload ~/Library/LaunchAgents/com.citasjapon.bot.plist
