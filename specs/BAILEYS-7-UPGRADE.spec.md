# Baileys 6.7.18 → 7.0.0-rc14 — impacto, cambios y contingencia

> Estado: **análisis, nada desplegado** (20/09/2026). Rama local `baileys-7`
> (`52ddb91`, solo la versión y los lockfiles) en el worktree
> `scratchpad/lila-b7`; no está pusheada. El deploy a producción lo decide José.
>
> Todo lo que sigue se verificó contra el registro npm, los tarballs de las tres
> versiones, el código de lila, la base `constroad_db` (solo lectura) y los logs
> de producción. Cada afirmación lleva cómo reproducirla. Lo que NO se pudo
> verificar está marcado así: **⟂ sin verificar**.

## 0. En una página

- **La causa del «Esperando este mensaje» del 18/09 no se arregla en la línea
  6.7.x.** El reenvío ante un *retry receipt* (`sendMessagesAgain`) es
  **idéntico** en 6.7.18 y en 6.7.24 (la última «legacy»): fuerza una sesión
  nueva con `assertSessions(force)` y reenvía. 7.0.0-rc14 hace cinco cosas más:
  inyecta el paquete de claves que viene EN el propio retry receipt, detecta
  `registrationId` distinto y borra la sesión vieja, detecta colisión de *base
  key* en el tercer reintento, recrea sesiones automáticamente
  (`enableAutoSessionRecreation`) y cachea los últimos 512 envíos 5 min
  (`enableRecentMessageCache`). Es exactamente el patrón del log: el mismo id
  reenviado 3–4 veces en minutos y pedido otra vez horas después.
- **6.7.18 tiene un aviso de seguridad CRÍTICO sin parchar**
  (GHSA-qvv5-jq5g-4cgg, 10/06/2026): cualquiera que le escriba a la línea puede
  fabricar un `messages.upsert` falso —mensaje con clave y remitente
  inventados— y corromper el app-state. Parchado en 6.7.22+ y 7.0.0-rc12+. En
  lila, `messages.upsert` alimenta a Lila (checklist, aprobaciones por cita) y a
  Dali: un mensaje falso «del admin» es un problema real, independiente del
  incidente. Esto solo ya justifica moverse de 6.7.18.
- **La API que lila usa no cambia.** Diff real de `SocketConfig`, de los 10
  métodos del socket que lila llama, de los 4 eventos que escucha y de los
  campos de `creds` que 7 lee: solo agregados. Type-check acotado: **0 errores
  nuevos**. Suite completa con 7 instalado: **1133 ESM + 333 CJS en verde**.
  Humo offline: el paquete ESM, `proto` por el namespace, `initAuthCreds`, el
  store de claves y el puente wasm cargan en esta Mac.
- **No hace falta re-emparejar.** Las tres sesiones tienen `me.lid` guardado y
  7 lee los mismos campos de `creds` que 6.7.18. Los dispositivos ya van por
  **37 / 15 / 19** (memoria: >10 es pairing quemado); un re-pair los sube más.
- **El rollback es un symlink** (`deploy.sh lila --rollback`, ~85 s): la
  release anterior conserva SU `node_modules` con 6.7.18. Lo que el rollback NO
  revierte es Mongo (`whatsapp_auth`): por eso, export de las creds antes del
  deploy, y la regla de qué restaurar y qué no (§1.3).
- **Recomendación:** (1) ya, sin tocar Baileys: TTL/tope del recuerdo de
  salientes + recordar TAMBIÉN lo que mandan los agentes (hoy no se recuerda) +
  loguear a QUIÉN se le reenvía; (2) probar 7 con el número QA (…024012) en un
  **segundo proceso con base propia `lila_qa`** —cero contacto con las tres
  sesiones—; (3) recién con eso en verde, 7 a producción en horario tranquilo,
  con export previo y José mirando la primera hora. 6.7.24 queda como **plan B**
  (cierra la seguridad, no el reenvío) si 7 falla en QA.

## 1. El peor escenario primero: contingencia

### 1.1 Qué es lo peor que puede pasar, de peor a menos peor

| # | Escenario | Cómo se ve | Probabilidad (juicio) | Qué se hace |
|---|---|---|---|---|
| A | **La línea 51949376824 no vuelve a loguear** tras el deploy: WhatsApp responde `401` (loggedOut) o `405`, y lila la aparca pidiendo re-emparejar. | `Disconnect reason: 401/405` en el log, `status: needs_repair` en Portal, alerta Telegram de sesión aparcada. | Baja: los campos de `creds` que 7 lee son los mismos; el login usa las mismas claves Noise/identidad. **⟂ sin verificar** contra WhatsApp real hasta la prueba QA. | Rollback inmediato (§1.2). Si con 6.7.18 tampoco loguea → restaurar SOLO `…:creds` del export (§1.3). Re-emparejar es la ÚLTIMA opción (device 19 → 20). |
| B | **Conecta, envía «200», y NADIE descifra**: sesiones Signal rotas en bloque (peor que hoy, que es un dispositivo). | Lluvia de `♻️ Reenviando` para muchos ids y muchos destinos, y `Decrypted message with closed session` en `lila-app-err.log`. Los choferes y los grupos ven «Esperando este mensaje». | Baja-media: es el riesgo propio de cambiar la capa Signal (libsignal git → `libsignal@6.0.0` npm + grupo/Noise en wasm). Es lo que la prueba QA existe para descartar. | Rollback. NO restaurar `session-*`/`sender-key-*` del export (§1.3): 6.7.18 renegocia solo ante los retry receipts. |
| C | **El proceso no arranca** (import ESM, wasm, dependencia). | lila no abre :3001; torre lo detecta y hace **auto-rollback en ~1 min**. | Muy baja: humo offline y suite en verde en esta misma Mac y el mismo Node (22.16). | Nada que hacer a mano; verificar que `current` volvió a la release anterior. |
| D | **Fuga de memoria / CPU** en días. | RSS de lila creciendo (hoy 190 MB tras 28 h). | Media-baja: rc10 dice haber cerrado fugas grandes; no lo podemos verificar sin correrlo. | La prueba QA corre ≥ 24 h con muestreo de RSS. En prod, umbral: > 600 MB o el doble del día anterior → rollback. |
| E | **Los agentes se confunden de remitente** (LID vs número) y Lila deja de reconocer al admin o Dali responde a quien no debe. | Lila no propone nada / propone a la persona equivocada; Dali contesta a un LID. | Baja: verificado en el código de 7 que `key.participant` sigue siendo el LID en grupos LID (y suma `participantAlt` con el número). `autores.ts` mapea LIDs, sigue válido. | Se prueba explícitamente en QA (grupo con un participante `@lid`). |
| F | **7 reescribe `whatsapp_auth` y 6.7.18 ya no lo entiende al volver.** | Tras el rollback, la sesión no loguea o no descifra. | Baja: 7 solo AGREGA tipos de clave (`lid-mapping`, `device-list`, `tctoken`, `identity-key`) que el store Mongo de lila persiste de forma genérica; 6.7.18 los ignora. | Export previo (§1.3) y la regla de restauración. |

### 1.2 Rollback en dos minutos (verificado en `torre/scripts/deploy.sh`)

```bash
/Users/jose/projects/torre/scripts/deploy.sh lila --rollback
```

- Mueve `current` a la release anterior (`ls -1 releases | sort -r`, o un
  nombre explícito como tercer argumento) y hace `launchctl kickstart -k
  system/com.constroad.lila`. **Sin rebuild.** lila tarda ~85 s en abrir el
  puerto; el script comprueba la salud y registra `rollback`.
- La release anterior conserva su `node_modules`: torre lo indexa por hash del
  lockfile en `deploys/lila/nm-cache/<hash>/`; el lockfile de Baileys 7 tiene
  OTRO hash, así que la carpeta con 6.7.18 queda intacta. Verificado: las tres
  últimas releases apuntan a `nm-cache/8377fa4d82da4e2f` con Baileys 6.7.18.
- Torre también lo ofrece desde la UI (relanzar / rollback pasan por
  `ui/confirmacion`).
- Lo que un rollback **no** revierte: la base. Ver §1.3.

### 1.3 Antes del deploy: export de la sesión, y la regla de qué restaurar

Justo antes de activar la release con 7 (mismo minuto), exportar los documentos
de las tres sesiones de `constroad_db.whatsapp_auth` (y `whatsapp_store`) a un
archivo con fecha, aparte del backup horario (que también existe:
`scripts/backup-db.sh` → restic en `/Volumes/CONSTROAD-BACKUP`, y `constroad_db`
está en su lista):

```bash
# solo lectura sobre prod (mongodump está en /opt/homebrew/bin; mongoexport NO está instalado)
mongodump --uri "$PORTAL_MONGO_URI" --db constroad_db --collection whatsapp_auth \
  --query '{"sessionId":{"$in":["51949376824","51903124919","51902049935"]}}' \
  --out "pre-baileys7.$(date +%Y%m%d-%H%M)"
```

Regla de restauración, y es la parte que más importa entenderla:

- **Restaurar SOLO `<sesión>:creds`** (`mongorestore` del dump filtrando ese
  `_id`, o un script que haga `updateOne` con el documento del dump) y SOLO si,
  tras el rollback a 6.7.18, la sesión no loguea (escenario A/F). Las creds son
  las claves de identidad y de Noise: no cambian con el uso.
- **NO restaurar `session-*`, `sender-key-*`, `pre-key-*` en bloque.** Son el
  estado del ratchet de Signal con CADA dispositivo de enfrente; esos
  dispositivos avanzaron mientras corría 7. Volver a los registros viejos
  produce exactamente el síntoma que se quiere curar («Esperando este mensaje»)
  hasta que cada dispositivo pida reenvío. 6.7.18 sabe renegociar sesiones que
  faltan o fallan (es lo que hace hoy en cada retry receipt); no sabe
  reconciliar sesiones viejas restauradas a mano.
- La copia completa sirve de evidencia forense y de último recurso, no de
  primer paso.

### 1.4 Señales de aborto y línea base

Comparar SIEMPRE contra la línea base medida en `logs/lila-app.log` (stdout de
launchd, con fecha; `shared/logs/combined.log` es el winston y arranca el 15/09):

| Señal | Línea base 17–20/09 | Aborto (rollback) si… |
|---|---|---|
| `Disconnect reason: 428` (churn normal de WA Web) | 15–20 por día entre las tres sesiones (cada cierre se loguea dos veces; 15–16/09 fue un mal día: 240–360 con muchos «sin código» = watchdog) | > 60 en la primera hora, o cualquier `401`/`405`/`440` |
| `♻️ Reenviando mensaje que … no pudo entregar cifrado` | 0–6 por día normal; **97 el 18/09** (46 ids, 3–4 veces cada uno, 03–09 h) | Sube respecto del día anterior con 7 puesto, o el mismo id se reenvía > 2 veces |
| `⚠️ Pidieron reenviar … ya no está en memoria` | 2–3 por día tranquilo, 16–21 en los malos (15, 16 y 18/09) | Igual que arriba |
| `Decrypted message with closed session.` (`logs/lila-app-err.log`, sin fecha) | 44 en todo el archivo | Aparecen nuevas líneas en la primera hora (comparar `wc -l`) |
| RSS de lila (`ps -o rss -p $(pgrep -f deploys/lila)`) | 190 MB a las 28 h | > 600 MB o el doble que el día anterior |
| «Esperando este mensaje» en el teléfono de José | Sí, el 18/09 | Cualquiera en un mensaje enviado DESPUÉS del deploy |

Ventana: los despachos salen entre las 03:00 y las 09:00 (log del 18/09). Deployar
**entre las 10:00 y las 16:00**, con José disponible la primera hora y sin
despachos programados para esa hora.

## 2. Hechos verificados (y cómo reproducir cada uno)

### 2.1 Versiones (registro npm, 20/09/2026)

`npm view @whiskeysockets/baileys dist-tags time --json`:

- `latest` = **7.0.0-rc14** (29/07/2026). `legacy` = **6.7.24** (29/07/2026).
- Después de 6.7.18 (28/05/2025) salieron 6.7.19…6.7.24 en la línea legacy; en
  paralelo rc.1 (09/2025) … rc9 (11/2025), y tras 5 meses sin releases,
  rc10 (06/05/2026, «THE FINAL RELEASE CANDIDATE»), rc11–rc13 (05/2026), rc14.
- Todas exigen Node ≥ 20; la Mac tiene 22.16.0.
- Notas de release (API de GitHub): rc10 lista «Stability fixes for resending
  messages», «Fix for ghost sessions», «Encryption failures handling», «LID<->PN
  mappings», fugas de memoria; rc11 mueve `libsignal` de git a npm (y arregla
  «old VPSes lacking SIMD support for the WASM»); rc12 = parche de seguridad;
  rc13 = regresión de `protocolMessage`; rc14 sin notas.
- El README de 7 remite a `https://whiskey.so/migrate-latest`, que redirige a
  `baileys.wiki/docs/migration/to-v7.0.0` → **404** hoy. No hay guía oficial de
  migración leíble; el diff de abajo la reemplaza.

### 2.2 Seguridad: GHSA-qvv5-jq5g-4cgg (crítico)

`curl https://api.github.com/advisories/GHSA-qvv5-jq5g-4cgg`: afecta
`@whiskeysockets/baileys < 6.7.22` y `>= 7.0.0-rc.1 < 7.0.0-rc12`. Un
`protocolMessage` malicioso dispara un `messages.upsert` falso con clave y
contenido inventados, y puede corromper el app-state sync y el history sync.
Parche: commit `3beb08e` («only drop self-only protocolMessages from non-self
senders»). Verificado en los tarballs: la guarda está en `lib/Utils/process-message.js`
de 6.7.24 y de rc14, y **no** en 6.7.18.

### 2.3 El reenvío ante retry receipt, versión por versión

`awk '/const sendMessagesAgain = /,/^    };$/' lib/Socket/messages-recv.js` en
cada tarball (`scratchpad/baileys-cmp/`):

- **6.7.18 y 6.7.24: el mismo código.** `getMessage` por id → `assertSessions([participant], true)`
  → borra `sender-key-memory` del grupo → `relayMessage` con `participant.count`.
  Comentario del propio autor: `// todo: implement a cache to store the last 256 sent messages`.
- **7.0.0-rc14:** primero busca en `messageRetryManager` (512 recientes, 5 min) y
  cae a `getMessage`; `extractE2ESessionFromRetryReceipt` → `injectE2ESession`
  (la sesión nueva sale del paquete de claves que el receptor mandó en el
  receipt, sin ir a pedir pre-keys); si no vino paquete, compara el
  `registrationId` recibido con el guardado y **borra la sesión si difiere**;
  en el reintento 2 guarda la *base key* y en el 3+ si es la misma **fuerza
  sesión fresca** («base key collision»); `enableAutoSessionRecreation`
  (default `true`) recrea la sesión en reintentos repetidos; y
  `willSendMessageAgain` acota los reenvíos.
- Cache reciente de 7: `RECENT_MESSAGES_SIZE = 512`, TTL 5 min
  (`lib/Utils/message-retry-manager.js`). **Más corta que la de lila** (1 h),
  así que `getMessage` de lila sigue haciendo falta (el retry de las 06:09 pedía
  mensajes de las 03:20).

### 2.4 Lo que dice el log del 18/09 (y de los días alrededor)

Fuente: `/Users/jose/projects/lila-app/logs/lila-app.log` (stdout de launchd;
el plist dice `StandardOutPath` ahí, NO en `deploys/lila/logs/` como decía el
brief) y `logs/lila-app-err.log` (stderr, sin fecha).

| Día | `♻️ Reenviando` | ids distintos | `⚠️ no en memoria` |
|---|---|---|---|
| 09/09 (el día que entró `getMessage`) | 1 | 1 | 3 |
| 10/09 | 18 | 12 | 76 (mensajes de antes del recuerdo) |
| 11/09 | 1 | 1 | 3 |
| 13/09 | 6 | 5 | 2 |
| 15/09 | 30 | 11 | 16 |
| 16/09 | 46 | 17 | 19 |
| 17/09 | 6 | 1 | 2 |
| **18/09** | **97** | **46** | **21** |
| 19/09 | 0 | 0 | 3 |
| 20/09 | 1 | 1 | 0 |

(`grep -c "^2026-09-18.*Reenviando mensaje"` y `grep -c "^🟡 2026-09-18.*Pidieron reenviar"`:
las líneas `warn` llevan el prefijo 🟡 antes de la fecha.)

- 18/09: los 97 reenvíos son todos de **51949376824**, entre las 03 y las 09 h
  (18 a las 03, 31 a las 06). Cada id se reenvió 3–4 veces en 2–20 minutos
  (`3EB0DEA5DBBEEC40D4B774`: 03:20:58, 03:28:09, 03:33:56) y **volvió a pedirse
  a las 06:09**, ya vencido. Es decir: el reenvío salía y el receptor seguía sin
  poder descifrar — sesión desincronizada, no mensaje perdido.
- De los 21 «ya no está en memoria»: **13 habían estado en memoria 1–3 h antes**
  (reenviados a las 03:20–05:10, pedidos otra vez a las 06:09–06:11 → vencidos
  por el TTL de 1 h) y **8 no aparecen nunca**: o se enviaron > 1 h antes sin
  reintento, o **los mandó un agente** (ver §2.5). Ninguno se explica por el
  tope de 300 con certeza; el TTL sí explica 13.
- El contexto de las 03:20:50 es el del brief: `dispatch_post_process` de
  `6aac7584b684063a101f55e5`, grupo de planta `120363288945205546@g.us`, grupo
  admin `120363043706150862@g.us`, vale al chofer `51974840924`. Qué
  dispositivo pidió el reenvío **no está en el log**: lila loguea solo el
  `messageId`, y el logger pino de Baileys corre en `fatal`. Ver §3.1(c).
- `lila-app-err.log`: 44 × `Decrypted message with closed session.` en total,
  sin fecha (es un `console` de libsignal). No se puede atribuir «×6» al 18/09.
- Cierres de conexión (`Disconnect reason`), las tres sesiones juntas: 114 /
  230 / **360** / 240 / 76 / 36 / 36 / 10 del 13 al 20/09; el 18–20/09 casi todo
  `428 Connection Terminated` (churn normal según la medición del as-is). El
  15–16/09 fue el mal período («sin código» = watchdog).
- `@lid`: 617 líneas desde el 13/09; los admins del grupo de operaciones son
  LIDs (`188570740486215@lid`, `244534046892225@lid` = la propia línea,
  `173066143440987@lid` = José). Los grupos ya están en direccionamiento LID.

### 2.5 Un hueco de lila, independiente de la versión

`recordOutgoingMessage` se engancha en `sendWithTimeout` de
`whatsapp-direct.service.ts` (el vale del despacho pasa por ahí:
`WhatsAppDirectService.sendDocument`). **No pasan por ahí:**

- `src/agent/runtime/agent-wiring.ts` — las respuestas de Dali (`sendText`) y
  los avisos de Lila (`notificarPor`) van por `sock.sendMessage` directo.
- `src/api/controllers/pdf-vale.controller.ts` — `socket.sendMessage` directo.

Un retry receipt por cualquiera de esos mensajes cae SIEMPRE en «ya no está en
memoria» con 6.7.18 (placeholder para siempre), y con 7 solo se salva dentro de
los 5 min de su cache. Es parte de los «8 nunca vistos».

### 2.6 Compatibilidad de la API (diff de los `.d.ts` y del código compilado)

Símbolos de Baileys que lila importa (`grep -rln "@whiskeysockets/baileys" src`
→ solo 9 archivos en `src/whatsapp/baileys/`): `makeWASocket`, `Browsers`,
`DisconnectReason`, `makeCacheableSignalKeyStore`, `WASocket`, `initAuthCreds`,
`BufferJSON`, `proto` (por `import * as`), `fetchLatestBaileysVersion`, tipos
`Chat`/`Contact`/`WAMessage`/`AuthenticationCreds`/`AuthenticationState`.
**`whatsapp-direct.service.ts` y `whatsapp-proxy.service.ts` no importan
Baileys; `outgoing-messages.ts` no importa nada.** El brief los daba por
afectados; no lo están.

| Superficie | 6.7.18 → 6.7.24 | 6.7.18 → 7.0.0-rc14 |
|---|---|---|
| `SocketConfig` | idéntico (solo sintaxis ESM) | agrega `enableAutoSessionRecreation`, `enableRecentMessageCache`, `pushName`, `PossiblyExtendedCacheStore`; `getMessage(key: WAMessageKey)` (antes `proto.IMessageKey`, mismo contenido); `options: RequestInit` (antes axios); `makeSignalRepository` con LID (lila no lo sobreescribe) |
| Métodos que lila llama (`sendMessage`, `sendPresenceUpdate`, `end`, `logout`, `groupMetadata`, `groupFetchAllParticipating`, `requestPairingCode`, `onWhatsApp`, `ws.isOpen`, `authState.creds.me`, `user`) | iguales | iguales; `end` devuelve `Promise<void>` (lila no la espera, es inofensivo); `sendMessage` devuelve `WAMessage` (= `proto.IWebMessageInfo`); `requestPairingCode(phone, customCode?)` |
| Eventos que lila escucha (`creds.update`, `messages.upsert`, `connection.update`, `messaging-history.set`) + los que ata el store | iguales | existen; 7 suma `lid-mapping.update`, `messaging-history.status`, etc. |
| `SignalDataTypeMap` (lo que el store de claves guarda) | igual | suma `lid-mapping`, `device-list`, `tctoken`, `identity-key`; `transaction(exec, key)` |
| Campos de `creds` que la librería lee (`grep -rhoE "creds\.[a-zA-Z]+" lib`) | iguales | **idénticos** a 6.7.18 (`account accountSettings accountSyncCounter advSecretKey firstUnuploadedPreKeyId lastPropHash me myAppStateKeyId nextPreKeyId noiseKey pairingCode pairingEphemeralKeyPair processedHistoryMessages registered registrationId routingInfo signedIdentityKey signedPreKey`); `initAuthCreds` suma `additionalData: undefined` |
| Remitente en grupos (`decode-wa-message.js`) | igual | `key.participant` sigue siendo el LID en grupos LID; suma `key.participantAlt` (número) y `key.addressingMode` |
| Paquete | **pasa a ESM** (`"type": "module"`) | ESM |
| Dependencias | `music-metadata@11` (ESM) | quita `axios`, `lodash`, el git `eslint-config`; suma `libsignal@^6.0.0` (npm, mismo repo WhiskeySockets), `whatsapp-rust-bridge@0.5.4` (**wasm embebido en el JS, 2 MB, sin compilar nada**; grupo/Noise/LT-hash), `lru-cache`, `p-queue` |
| Versión WA por defecto | — | `[2,3000,1043857760]`; lila la pide en runtime (`fetchLatestBaileysVersion`, cache 6 h) y prod ya usa esa misma hoy |

El store Mongo de lila (`mongo-auth-state.ts`) guarda `${tipo}-${id}` de forma
genérica: los tipos nuevos de 7 se persisten sin tocarlo. Verificado el
inventario real (solo lectura): 51949376824 = `pre` 2096, `session` 434,
`sender` 401, `app` 2, `creds` 1; `me.id` `…:19@s.whatsapp.net`, `me.lid`
`244534046892225:19@lid`, `platform: smba`. 51902049935 device 37,
51903124919 device 15; las tres con `me.lid`.

### 2.7 Lo que se corrió en el worktree (rama `baileys-7`, `scratchpad/lila-b7`)

1. `npm ci` (7 s con cache) + `npm install --save-exact @whiskeysockets/baileys@7.0.0-rc14`:
   «added 9, removed 23, changed 6». Diff en git: `package.json` (1 línea),
   `package-lock.json`, `yarn.lock` (npm lo actualiza solo; lila usa npm).
2. Type-check acotado (`tsconfig.b7.json`, 17 archivos: los 9 de Baileys, los
   dos services, los tres controllers, `agent-wiring` y dos tests): **27
   errores, los mismos 27 que con 6.7.18** en el árbol principal (Request sin
   `companyId`, `pdfjs`, telegram, `BodyInit`…, todos previos). Cero nuevos.
   (El `tsc` del proyecto entero muere por OOM a 3 GB en esta Mac; el build de
   producción es esbuild y **no type-checkea**: por eso el chequeo acotado es
   obligatorio antes de deployar cualquier cambio de esta área.)
3. `npm test` completo: **123 suites / 1133 tests ESM y 27 / 333 CJS, todos en
   verde.** Las suites no abren sockets (mockean), así que esto prueba el
   grafo de imports y los contratos, no el protocolo.
4. `smoke-b7.mts` (offline): `proto` está en el namespace ESM (el comentario de
   `mongo-auth-state.ts` sobre 6.7.x sigue valiendo), `initAuthCreds()` da 16
   campos con claves de 32 bytes, ida y vuelta por `BufferJSON` conserva los
   Buffers, `makeCacheableSignalKeyStore` sobre un store mínimo funciona,
   `Browsers.ubuntu('Chrome')` = `["Ubuntu","Chrome","22.04.4"]`,
   `DisconnectReason` iguales (401/440), `jidDecode` de un LID con device, y el
   wasm exporta `GroupCipher`, `NoiseSession`, `LTHashState`…
5. El bundle de producción (`build.js`, esbuild) marca `@whiskeysockets/baileys`
   como `external`: Node lo carga desde `node_modules` en runtime; esbuild no
   ve el cambio.

**⟂ Sin verificar** (solo se puede con WhatsApp real): login con creds de
6.7.18, envío/recepción, descifrado en el teléfono, comportamiento en grupos
LID, memoria en el tiempo. Para eso es §4.

## 3. Impacto y cambios propuestos

### 3.1 Paso 0 — ya, sin cambiar Baileys (deploy normal, riesgo mínimo)

(a) `outgoing-messages.ts`: `OUTGOING_TTL_MS` 1 h → **6 h** (13 de los 21
pedidos vencidos del 18/09 caían entre 1 y 3 h) y `OUTGOING_MAX` 300 → **1000**,
no 2000: lo recordado es el `message` que devuelve Baileys —un documento con
`jpegThumbnail` pesa decenas de KB— y la Mac son 8 GB compartidos; se expone
`outgoingSize()` en `/admin` de salud y se sube después con la medida, no
antes. Con test (los dos límites ya tienen test propio).

(b) Recordar también lo que mandan los agentes y `pdf-vale.controller`: los
tres `sock.sendMessage` directos pasan a registrar con `recordOutgoingMessage`
tras el envío (mismo patrón de `sendWithTimeout`: nunca lanza). Cierra el hueco
de §2.5. Con test (el módulo es puro).

(c) Loguear a QUIÉN: `getMessage` recibe la `key` completa; hoy lila loguea solo
`messageId`. Sumar `remoteJid` y `participant` a las dos líneas (`♻️` y `⚠️`).
Es lo que responde el punto 1 del brief para adelante sin subir el nivel de
pino (que exigiría reiniciar prod para tomar la env) y sin volcar el JSON de
cada nodo.

(d) `WHATSAPP_MSG_RETRY_STORE=off` sigue siendo el kill-switch del recuerdo
(as-is, 09/09).

### 3.2 Paso 1 — 7.0.0-rc14 en la rama (ya hecho: `52ddb91`)

Cambio de código necesario para compilar y pasar tests: **ninguno.** Cambios
que sí conviene hacer en el mismo commit:

- `sessions.simple.ts`: dejar explícitos `enableAutoSessionRecreation: true` y
  `enableRecentMessageCache: true` con el porqué (hoy son default, y un default
  se cambia sin avisar en un rc).
- `mongo-auth-state.ts`: actualizar el comentario de `proto` (sigue siendo por
  namespace) y anotar los tipos nuevos que ahora se persisten.
- `populate-store-simple.ts`: borrar el `sock.loadMessages` muerto (no existe
  en ninguna versión; lo dice su propio comentario).
- as-is §WhatsApp: versión, dependencias nuevas, qué hace 7 en el reenvío.

Plan B si 7 falla en QA: **6.7.24** (misma API, ya ESM, parche de seguridad,
reenvío igual que hoy). Cierra §2.2, no el incidente.

### 3.3 Impacto por área

| Área | Impacto | Evidencia |
|---|---|---|
| Sesiones / login | Sin re-pair. Riesgo real solo verificable con WA. | §2.6 creds; §1.1 A |
| Envío (texto, documento, ubicación, media) | Mismas firmas; `sendMessage` devuelve `WAMessage`. | §2.6 |
| Reenvío / retry receipts | Es la mejora buscada; lila conserva `getMessage` como respaldo > 5 min. | §2.3 |
| Recepción → Lila (checklist) y Dali | `key.participant` = LID como hoy; `messages.upsert` igual; además se cierra el spoofing (§2.2). | §2.6 |
| Store (chats/contactos/grupos) | `store.bind(ev)` con los mismos eventos. | §2.6 |
| `whatsapp_auth` en Mongo | Tipos nuevos, persistidos sin cambios; crecen los docs por `lid-mapping`/`device-list`. | §2.6 |
| Build / deploy (torre) | Lockfile nuevo → `npm ci` completo en la release (hash nuevo de nm-cache); `libsignal` sigue resuelto por git+ssh en el lock (como hoy); sin compilación nativa. | §2.7 |
| Tests | 1133 + 333 en verde; ningún test cubre el protocolo. | §2.7 |
| Memoria / CPU | wasm para grupo/Noise; cache reciente 512×5 min; fugas: **⟂**. | §1.1 D |
| Portal | Ninguno: la API HTTP de lila no cambia. | — |
| Seguridad | Cierra GHSA-qvv5-jq5g-4cgg. | §2.2 |

## 4. Prueba con el número QA (…024012), sin tocar la línea

Restricciones que se respetan: no se toca `51949376824` ni `51903124919` ni
`51902049935`; no se manda nada a grupos de clientes; no se reinicia prod; no
hay envío de mensajes ni emparejamiento sin que José lo dispare.

### 4.1 Banco: un segundo lila con base propia

Un segundo proceso en la mini (hay ~3 GB libres; lila prod usa 190 MB) desde el
worktree `scratchpad/lila-b7` (rama `baileys-7`), con un `.env` propio:

```
NODE_ENV=development
PORT=3101
PORTAL_MONGO_URI=<el mismo cluster>
PORTAL_SHARED_DB=lila_qa            # base NUEVA: creds, store, lease, companies, bot_configs
WHATSAPP_RESTORE_SESSIONS=false     # nada se restaura solo; la sesión QA se abre a mano
WHATSAPP_LOCAL_SESSIONS=51xxx024012 # (el número completo lo pone José)
WHATSAPP_PROXY_TARGET_URL=          # vacío: sin proxy a prod
WHATSAPP_BAILEYS_LOG_LEVEL=info     # acá sí: queremos ver los receipts
FILE_STORAGE_ROOT=<carpeta scratch> # no escribir en constroad-storage
TELEGRAM_BOT_TOKEN=                 # vacío: sin alertas [DEV] en el canal
```

Por qué así y no con `WHATSAPP_LOCAL_SESSIONS` en prod: todos los modelos de
lila (`getSharedConnection`) leen `PORTAL_SHARED_DB`; con `lila_qa` el proceso
QA **no puede** ver las creds de prod ni su lease, y prod **no puede** ver las
del QA (además `restoreAllSessions` solo restaura números que sean `sender` de
una empresa activa de SU base). No hace falta tocar el `.env` de producción ni
reiniciarla. En `lila_qa` se siembra una sola `companies` (`test`, sender =
número QA, `isActive`, con un grupo de prueba en `whatsappConfig`) para que
pasen ownership y quota; `bot_configs` vacío (agentes inertes) o uno mínimo si
se quiere probar una respuesta de Dali.

### 4.2 Guion (cada paso lo dispara José; yo preparo comandos y leo evidencia)

1. Arrancar el banco; `curl :3101/health`. Verificar en el log
   `Using WA v…` y que NO aparece ningún `♻️ Restoring session`.
2. Emparejar el QA (`POST /api/sessions` para crearla y `GET
   /api/sessions/51xxx024012/qr`, o `POST …/request-pairing-code`) **desde el
   teléfono de pruebas**, no desde la línea. Guardar `me.id`/`me.lid` del doc
   `creds` en `lila_qa`.
3. Grupo de prueba con el QA + el teléfono de José (participante `@lid`).
4. Enviar por la API del banco: texto, documento PDF y ubicación, al grupo y
   1:1 a José. Esperado en el teléfono: se leen; en el log: cero `♻️`, cero
   `⚠️`, cero `Decrypted message with closed session` en el stderr del banco.
5. Provocar un retry real: José borra y reinstala WhatsApp Web/desktop (o
   cierra sesión de un dispositivo vinculado y vuelve a vincular) y el banco le
   manda otro texto. Esperado: un `♻️` como mucho y el mensaje legible; con
   `info` se ve `injected session from retry receipt key bundle` o `reg id
   mismatch…`.
6. Recepción: José escribe al QA (1:1 y en el grupo). En el log de `info`, el
   `key.participant` del grupo es `@lid` y `participantAlt` trae el número.
7. Dejarlo ≥ 24 h con `ps -o rss` cada 10 min (o el `sampler.mjs` de torre);
   anotar cierres por código.
8. Cerrar: `POST /api/sessions/51xxx024012/logout` en el banco, borrar
   `lila_qa` (o dejarla para la próxima), apagar el proceso.

Lo que la prueba **no** cubre: la cuenta Business (`smba`) de la línea, el
volumen real de grupos (`sender-key` con 400+ dispositivos) y la historia de
sesiones acumulada de 15 meses. Por eso §1.4 vigila la primera hora en prod.

### 4.3 Deploy a producción, si QA está en verde

1. Paso 0 (§3.1) ya en producción unos días (aporta el log con `participant`).
2. Export §1.3. Ventana §1.4. Push de `baileys-7` a `main` (torre deploya).
3. Primera hora: los seis indicadores de §1.4 cada 10 min; una prueba de envío
   real a José (texto + PDF) la dispara él.
4. Rollback = §1.2. Re-emparejar **no** está en el plan; si llegara a hacer
   falta es decisión de José con el costo explícito (device 19 → 20).

## 5. Correcciones al brief (para que nadie construya sobre ellas)

- Rutas de log: el stdout/stderr de launchd son
  `/Users/jose/projects/lila-app/logs/lila-app.log` y `lila-app-err.log`
  (plist `com.constroad.lila`), no `deploys/lila/logs/`. El winston va a
  `deploys/lila/shared/logs/combined.log` y `error.log`.
- «Adaptar `sessions.simple.ts`, `outgoing-messages.ts`,
  `whatsapp-direct.service.ts` y `whatsapp-proxy.service.ts`»: no hace falta
  ninguna adaptación para compilar ni para los tests; los dos services y
  `outgoing-messages` no importan Baileys.
- «`OUTGOING_MAX` 300 → 2000 / TTL 6 h»: el TTL sí (13 de 21 casos); el tope, a
  1000 y con medida. Y el hueco mayor es que los agentes no recuerdan nada (§2.5).
- «Reemplaza al 902049935 de QA»: hoy `51902049935` es el `sender` de la empresa
  `test` **y** una de las tres sesiones que prod restaura (device 37). Cambiar
  el sender de `test` al QA en `constroad_db` es una decisión aparte (dejaría a
  `51902049935` como «unassigned» y prod dejaría de restaurarla en el siguiente
  reinicio); no se hizo.
- El árbol de trabajo estaba limpio al empezar (los cambios sin commitear del
  brief ya no estaban).
