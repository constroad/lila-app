# DALI — Asistente de WhatsApp para negocios (producto por verticales)

> **Estado:** spec de producto y arquitectura, 14/09/2026. El motor de ventas
> (vertical asfalto, CONSTROAD) ya corre en producción como piloto
> (`WHATSAPP-AGENT-VERTICALS.spec.md` F2/F3, modo guiado con Qwen local). Este
> documento define el PRODUCTO alrededor de ese motor: UI propia, login,
> conocimiento por Excel, packs por vertical y administración.
> **Diseños:** Stitch, proyecto `10416531549338173240` («Dali — Asistente de
> WhatsApp para negocios»), design system `assets/15899208091892470814`. Las
> pantallas y sus IDs están en §7.
> **Decisiones tomadas con José (14/09):** Dali tiene UI propia (no vive en
> Portal); el backend es lila-app y nada se duplica; el login es constroad-auth
> con el patrón de Torre; Portal queda para la operación de asfalto y Constroad
> es un tenant más de Dali; la asistente se llama Dali (antes «María»).

## 0) Qué es

Un negocio conecta su número de WhatsApp, le cuenta a Dali qué ofrece (ficha,
servicios y preguntas, preguntas frecuentes, catálogo; por Excel o en el panel)
y Dali atiende a sus clientes por WhatsApp: junta los datos de un pedido, responde
lo frecuente, escala a una persona cuando hace falta y avisa al dueño. El dueño
configura, mira y toma el control desde el panel Dali (celular, tablet o
escritorio).

**Un vertical = un modo de motor + un pack de datos.** Asfalto es el primero
(modo *lead*). Restaurante (*pedido*), lubricentro (*cita*) y grifo (*info*)
llegan como packs nuevos y, cuando el modo no existe, como código nuevo una vez.

## 1) Principios

1. **Un solo backend.** lila-app es el único proceso que habla con WhatsApp,
   con el modelo y con la base. La UI de Dali es un cliente delgado de su API.
2. **El conocimiento es estructurado**, no un prompt. Con Qwen 1,5 B local
   (sin tarjeta no hay modelo grande) el modelo extrae y el código conversa
   (`WHATSAPP-AGENT-VERTICALS.spec.md` §5, modo guiado). La ficha, el guion, la
   FAQ y el catálogo son DATOS que el motor usa; con un modelo grande, los
   mismos datos se vuelven prompt.
3. **Multi-tenant por `companyId`** en cada colección, query y caché
   (`../PERFORMANCE-SCALABILITY.SPEC.md`); el tenant sale del token o del
   número de sesión, nunca del mensaje ni del cliente HTTP.
4. **El dueño manda.** Escribe desde su WhatsApp y Dali se calla; `!bot off`;
   switch en el panel; pausa por conversación. Nunca se vende sin handoff.
5. **Reuse-first.** Sesiones Baileys con lease, quota-validator, storage,
   `requireTenant`, JWT, constroad-auth, torre para deploy. Nada nuevo de eso.

## 2) Arquitectura

```
[Cliente final] ─WhatsApp─▶ Baileys (lila-app) ─▶ agente Dali (src/agent/ventas)
                                                      │ lee/escribe
[Dueño] ─▶ dali.<dominio> (UI estática servida por lila) ─▶ /api/dali/* ─▶ Mongo constroad_db
                │ login                                                   (companies, bot_configs,
                └─▶ lila ─▶ constroad-auth (código WhatsApp / enlace correo)   bot_conversations, bot_leads…)
[Operador Dali (José)] ─▶ dali.<dominio>/admin ─▶ /api/dali/admin/*
[Portal] ─▶ solo asfalto; el card «Asistente con IA» enlaza a Dali (aiEnabled se retira)
```

- **UI:** `ui/dali/` en el repo de lila (Vite + React + shadcn, mobile-first).
  Se compila en el build de lila y lila la sirve como estáticos. Cero proceso
  nuevo en la Mac mini de 8 GB; un solo deploy (torre); mismo origen que la API
  (sin CORS). Si algún día necesita vida propia, es mover la carpeta.

### 2.1 Deploy y dominio (revisado contra torre y el túnel, 14/09)

Cómo se expone hoy una app en esta máquina (`torre/specs/ARCHITECTURE-torre.as-is.md`
§3, `torre.apps.json`): un servicio launchd por app, y **cloudflared** (túnel
`b197fa60…`, config en `/usr/local/etc/cloudflared/config.yml`, corre como
root) rutea por hostname a `127.0.0.1:<puerto>`: `lila.constroad.com` → 3001,
`torre.constroad.com` → 4000, `constroad.com` → 3002 (Portal), `auth…` → 4002,
`lilastore…` → 3003, `lilachat…` → 3004, y el wildcard `*.constroad.com` →
Portal. **Las reglas específicas van antes del wildcard** (cloudflared gana con
la primera coincidencia; el síntoma de equivocarse es que la app nueva responde
200 sirviendo Portal).

Dali no es una app nueva para torre: es lila con un segundo hostname.

1. **Build.** `ui/dali` tiene su propio `package.json` (Vite). `build.js` de
   lila corre `npm --prefix ui/dali ci && npm --prefix ui/dali run build` y deja
   `ui/dali/dist`. torre no cambia (`build: npm-ci-build` ya ejecuta `npm run
   build`). Costo: ~+1 min de build y ~150 MB de `node_modules` de la UI por
   release; aceptable, y si molesta se compila en GitHub Actions y se commitea
   el `dist`.
2. **Servir.** Express en lila: si `Host` es el hostname de Dali (constante
   `DALI_HOSTS` en código, sin env nueva), sirve `ui/dali/dist` con fallback a
   `index.html` (SPA) y deja pasar `/api/*`; en cualquier otro host, la UI
   también está en `/dali/` para probar sin DNS.
3. **Túnel (lo hace José, pide sudo):** una línea en
   `/usr/local/etc/cloudflared/config.yml` ANTES del wildcard —
   `- hostname: dali.constroad.com` / `service: http://127.0.0.1:3001` — y
   reiniciar cloudflared. DNS: el CNAME wildcard de `constroad.com` al túnel ya
   cubre `dali.constroad.com`; si no, un CNAME `dali` → `<túnel>.cfargotunnel.com`.
4. **torre.** `torre.apps.json` admite un solo `hostname` por app
   (`lila.constroad.com`); el de Dali se documenta en el `$comment` de lila y
   el health sigue siendo el de lila. Cambio opcional en torre: `hostnames[]`
   para que el diagnóstico también pruebe `dali.constroad.com`.

**Dominio.** Para el piloto y F1–F3: **`dali.constroad.com`** (cero compra,
cero riesgo, misma noche). Para la marca (F4): un dominio propio comprado por
José en Cloudflare (candidatos: `dali.pe`, `holadali.com`, `getdali.com`; el
`.pe` se compra en NIC.pe o en un registrador peruano y se apunta a Cloudflare
DNS) — se agrega como zona en Cloudflare, una regla más en el túnel y el
hostname en `DALI_HOSTS`. Nada de lo anterior cambia; los dos hostnames pueden
convivir (el viejo redirige al nuevo). **La decisión del nombre es de José.**
- **API:** `/api/dali/*` en lila con `requireTenant` (JWT con `companyId`,
  `userId`, `email`, `role`, que ya existe) y `/api/dali/admin/*` con rol
  `operator`. Portal no interviene.
- **Login (patrón Torre):** el panel pide número o correo → lila (`POST
  /api/dali/auth/codigo`) llama a constroad-auth `POST /v1/codigo` con SU
  llave (`CONSTROAD_AUTH_KEY`, `CONSTROAD_AUTH_URL`; la llave se emite en
  Torre → Identidad para la app `dali`, con los `enlaces` de retorno) → el
  código llega por WhatsApp (sale por lila) o el enlace por correo → `POST
  /api/dali/auth/verificar` → constroad-auth devuelve `{identidad,
  companyId, app}` → lila emite su JWT (`LILA_APP_JWT_SECRET`, 14 días, cookie
  `HttpOnly`). La lista de quién entra a qué empresa vive en constroad-auth
  (`miembros`: companyId + app + destino + rol de la lista); el ROL dentro de
  Dali (dueño / ventas / solo lectura) vive en lila (`bot_members`).
  «La ausencia de respuesta no revoca» (INTEGRATION.spec §2): si
  constroad-auth no contesta, la sesión vigente sigue.
- **Alta de empresa:** desde el panel admin (José) o auto-registro público
  (`POST /api/dali/registro`): crea `companies` (con `vertical`), `bot_configs`
  con el pack del rubro, el miembro dueño en constroad-auth y en `bot_members`,
  y manda el código de acceso. La sesión de WhatsApp se vincula después con
  el QR/pairing de lila (`/api/sessions`, que ya existe).

## 3) Modelo de datos (Mongo compartido `constroad_db`)

| Colección | Estado | Qué guarda |
| --- | --- | --- |
| `companies` | existe (Portal + lila) | tenant: `companyId`, nombre, `vertical`, plan, `whatsappConfig.sender`. Dali agrega `dali: { plan, trialEndsAt, status }`. |
| `bot_configs` | existe (1 por empresa) | `enabled`, `vertical`, `testNumbers`, `ownerNotifyTarget`, `handoffPauseMinutes`, `guion` (hoy). **Crece con:** `perfil` (asistente, presentación, tono, emojis, horario, fueraDeHorario, zona, reglas: daPrecios, prometeFechas, escala), `negocio` (descripción, dirección, contacto, ofrece[], noOfrece[]), `faq[]` ({pregunta, respuesta, variantes[], activa}), `catalogo[]` ({nombre, categoria, unidad, precio?, disponible, descripcion, foto?}), `avisos` (canal, qué avisar, silencio), `packVersion`. Caché 60 s en lila (ya existe por sesión). |
| `bot_conversations` | existe | conversación por cliente: estado bot/human/closed, pausas, `lead` (estado del guion), tokens. |
| `bot_conversation_messages` | existe (TTL 90 d) | transcripción. |
| `bot_leads` | **nueva** | el lead como objeto de trabajo del dueño: `companyId`, `conversationId`, `servicio`, `campos` (etiqueta→valor), `resumen`, `confirmado`, `estado` (nuevo/contactado/cotizado/ganado/perdido), `cotizacion` {monto, enviadaEl, validaHasta, pdf}, `notas[]`, `historial[]`, `motivoPerdido`. Se crea cuando el motor guarda un lead con servicio y (lugar o cantidad); se actualiza mientras la conversación siga; después es del dueño. |
| `bot_members` | **nueva** | `companyId`, `identidad` (teléfono/correo), `nombre`, `rol` (owner/sales/viewer), `recibeAvisos`, `ultimoIngreso`. Espejo mínimo de constroad-auth `miembros` con el rol de la app. |
| `vertical_packs` | **nueva** (global) | por `vertical`: `version`, `modo` (lead/pedido/cita/info), `guion`, `faq[]`, `catalogo[]`, `textos` (saludo, precio, cierre, escalada, desambiguación), `plantillaExcel` (definición de pestañas). El default de asfalto es `ventas/guion.asfalto.ts` volcado como v1. |
| `usage_metrics` | existe | conversaciones del mes por empresa (quota). |
| `bot_imports` | **nueva** | historial de importaciones: archivo, resumen, avisos, quién, cuándo, modo (reemplazar/agregar). |

Regla: toda colección nueva lleva índice `{companyId, …}` y se filtra por
`req.companyId`.

## 4) API `/api/dali/*` (lila-app, Express)

Auth: `requireTenant` (JWT) salvo `auth/*` y `registro`. Rol en `req.auth.role`.

| Grupo | Endpoints | Notas |
| --- | --- | --- |
| auth | `POST auth/codigo` {destino} · `POST auth/verificar` {destino, codigo} · `GET auth/enlace?t=` · `POST auth/salir` · `GET auth/yo` | patrón Torre; cookie HttpOnly; `yo` devuelve usuario, empresa, rol, permisos. |
| registro | `POST registro` {negocio, rubro, zona, dueño, whatsappPersonal, asistente} | crea empresa + config con pack + miembro + manda código. Rate limit por IP. |
| inicio | `GET inicio` | estado del asistente y sesión, stats de hoy, «piden atención», últimos leads, uso del plan. |
| asistente | `GET/PUT asistente` (perfil, reglas, avisos, testNumbers) · `POST asistente/pausa` {minutos} · `PUT asistente/estado` {enabled} | escribe `bot_configs`. |
| negocio | `GET/PUT negocio` | ficha. |
| servicios | `GET servicios` · `POST servicios` · `PUT servicios/:id` · `DELETE` · `PUT servicios/:id/preguntas` (lista completa, ordenada) · `POST servicios/restaurar-pack` | escribe `bot_configs.guion` (validado con `guionDe`). |
| faq | `GET/POST/PUT/DELETE faq` · `POST faq/probar` {pregunta} → {respuesta, coincidencia} · `GET faq/sugeridas` | embeddings e5 (`agent/checklist` ya los tiene). |
| catalogo | `GET/POST/PUT/DELETE catalogo` · `PUT catalogo/politica` {daPrecios} | |
| importar | `GET importar/plantilla.xlsx` · `POST importar/analizar` (multipart) → resumen + avisos · `POST importar/confirmar` {token, modo} · `GET importar/historial` | `xlsx` en lila (ya está en deps de exports). |
| whatsapp | `GET whatsapp` (estado, calidad, historial) · `POST whatsapp/vincular` (QR/pairing, reusa `/api/sessions`) · `POST whatsapp/desconectar` · `POST whatsapp/prueba` {numero} | |
| conversaciones | `GET conversaciones?estado&q&cursor` · `GET conversaciones/:id` (mensajes + lead) · `POST conversaciones/:id/tomar` · `POST …/devolver` · `POST …/cerrar` · `POST …/mensaje` {texto} (sale por el número del negocio, pausa a Dali) · `POST …/nota` | |
| leads | `GET leads?estado&servicio&q` · `GET leads/:id` · `PATCH leads/:id` {estado, cotizacion, motivoPerdido} · `POST leads/:id/notas` · `GET leads/exportar.xlsx` | |
| probar | `POST probar` {sesionId?, mensaje, como: nuevo|conocido} → {respuesta, entendido, siguiente, senales} | corre `paso()` con un estado en memoria (TTL 30 min), sin persistir ni avisar. |
| equipo | `GET equipo` · `POST equipo/invitar` · `PATCH equipo/:id` · `DELETE equipo/:id` | invita en constroad-auth + `bot_members`. |
| plan | `GET plan` (plan, uso, semanas, pagos) | pagos registrados por el operador (sin pasarela: transferencia/Yape). |
| notificaciones | `GET/PUT notificaciones` | `bot_configs.avisos`. |
| reportes | `GET reportes?rango` | agregados por semana; «no supo responder» sale de las conversaciones con `fueraDeTema`/sin ruta. |
| ajustes | `GET/PUT ajustes` · `GET ajustes/sesiones` · `DELETE ajustes/sesiones/:id` · `GET ajustes/exportar.xlsx` · `POST ajustes/eliminar-cuenta` | |
| admin | `GET admin/empresas` · `POST admin/empresas` · `GET admin/empresas/:id` · `POST admin/empresas/:id/impersonar` · `PATCH admin/empresas/:id` (pausar, suspender, plan, pago) · `GET/PUT admin/verticales/:v` · `POST admin/verticales/:v/aplicar` · `GET admin/salud` | rol `operator` (José). `salud` reusa `estadoLlm()`, sesiones, memoria del proceso. |

Toda ruta nueva se monta con guard y se verifica con `curl` sin credenciales
→ 401 (`lila-security` §1).

## 5) Motor por vertical

| Modo | Vertical | Qué hace | Estado |
| --- | --- | --- | --- |
| **lead** | asfalto, servicios genéricos | guion de preguntas por servicio → resumen → confirmación → lead al dueño | **hecho** (`ventas/guiado.ts`, `guion.asfalto.ts`) |
| **info** | grifo | FAQ por embeddings + horario + «precios del día» (catálogo con `daPrecios`) + escalada | FAQ y catálogo son parte de F1 de este spec; el modo es lead sin guion |
| **pedido** | restaurante | catálogo con precios → pedido ítem por ítem → confirmación → `bot_orders` | F4 (el F2 original de WHATSAPP-AGENT-VERTICALS) |
| **cita** | lubricentro, barbería | servicios con duración + horarios → reserva → recordatorio | F5 |

Lo común a todos: ficha del negocio (saludo con el nombre, horario, zona),
FAQ por similitud (umbral 0,88, como el checklist de Lila), escalada a persona,
avisos, pausa del dueño, números de prueba, quotas.

## 6) Fases

| Fase | Entrega | Done |
| --- | --- | --- |
| **F1 · Conocimiento** | `bot_configs` con perfil/negocio/faq/catálogo/avisos; `bot_leads`; `vertical_packs` con asfalto v1; importador Excel (plantilla, analizar, confirmar); Dali usa ficha (saludo, horario, zona) y FAQ por embeddings; `/api/dali/*` de negocio, servicios, faq, catálogo, importar, leads, conversaciones, probar | tests de importación (plantilla real) y de FAQ; curl 401 sin token; una FAQ respondida en el piloto |
| **F2 · Acceso** | llave `dali` emitida en Torre → Identidad; `auth/*`, `registro`, `bot_members`, roles; cookie 14 d | login real desde el celular de José por código de WhatsApp; invitación a un segundo miembro |
| **F3 · UI** | `ui/dali` (Vite + React + shadcn) con las 31 pantallas de §7 en los 3 tamaños; build integrado en lila; servido en `/dali`; PWA instalable | recorrido completo en móvil real: registro → conectar → importar → probar → conversación → lead; Lighthouse móvil ≥ 90 accesibilidad |
| **F4 · Marca y admin** | dominio propio, landing, panel admin (empresas, verticales, salud), Portal enlaza a Dali y retira `aiEnabled` | José da de alta un restaurante de prueba sin tocar código |
| **F5 · Verticales** | modo *pedido* (restaurante) y *cita* (lubricentro) con sus packs | pedido y cita de prueba de punta a punta |

## 7) Pantallas (Stitch) — inventario, rutas, API y datos

Las 31 pantallas existen en móvil (390), tablet (834) y escritorio (1280); la
misma información en los tres, reordenada. Shell: móvil = barra inferior de 5
pestañas (Inicio, Chats, Leads, Asistente, Más); tablet = rail de 72 px;
escritorio = sidebar de 256 px con secciones Operación / Configurar / Cuenta.
Admin: pestañas/sidebar Empresas, Verticales, Salud, Cuentas.

Los IDs de Stitch por dispositivo están en `specs/DALI-pantallas.md`
(generado desde el proyecto; incluye captura y HTML descargables).

| # | Pantalla | Ruta | API | Datos |
| --- | --- | --- | --- | --- |
| P1 | Landing | `/` | — | estática |
| P2 | Entrar | `/entrar` | `auth/codigo` | — |
| P3 | Código de verificación | `/entrar/codigo` | `auth/verificar`, `auth/enlace` | — |
| P4 | Registro (1/3 tu negocio) | `/registro` | `registro` | companies, bot_configs, bot_members |
| P5 | Conectar WhatsApp (2/3) | `/registro/whatsapp` | `whatsapp/vincular` | sesión Baileys |
| P6 | Cargar conocimiento (3/3) | `/registro/conocimiento` | `importar/*`, `servicios/restaurar-pack` | bot_configs, vertical_packs |
| A1 | Inicio | `/inicio` | `inicio` | agregados |
| A2 | Conversaciones | `/chats` | `conversaciones` | bot_conversations |
| A3 | Conversación | `/chats/:id` | `conversaciones/:id`, tomar/devolver/cerrar/mensaje/nota | + messages, lead |
| A4 | Leads | `/leads` | `leads` | bot_leads |
| A5 | Lead | `/leads/:id` | `leads/:id`, PATCH, notas | bot_leads |
| A6 | Asistente | `/asistente` | `asistente`, pausa, estado | bot_configs.perfil, avisos, testNumbers |
| A7 | Negocio | `/negocio` | `negocio` | bot_configs.negocio |
| A8 | Servicios | `/servicios` | `servicios` | bot_configs.guion |
| A9 | Guion de un servicio | `/servicios/:id` | `servicios/:id/preguntas` | guion.servicios[].preguntas |
| A10 | Editor de pregunta | `/servicios/:id/preguntas/:n` | (mismo PUT) | PreguntaGuion |
| A11 | Preguntas frecuentes | `/faq` | `faq`, probar, sugeridas | bot_configs.faq |
| A12 | Catálogo | `/catalogo` | `catalogo`, politica | bot_configs.catalogo |
| A13 | Importar | `/importar` | `importar/*` | bot_imports |
| A14 | WhatsApp | `/whatsapp` | `whatsapp/*` | sesión |
| A15 | Probar a Dali | `/probar` | `probar` | memoria |
| A16 | Equipo | `/equipo` | `equipo/*` | bot_members, constroad-auth |
| A17 | Plan y uso | `/plan` | `plan` | companies.dali, usage_metrics |
| A18 | Notificaciones | `/notificaciones` | `notificaciones` | bot_configs.avisos |
| A19 | Reportes | `/reportes` | `reportes` | agregados |
| A20 | Ajustes | `/ajustes` | `ajustes/*` | bot_members, sesiones |
| S1 | Admin · Empresas | `/admin/empresas` | `admin/empresas` | companies, bot_configs |
| S2 | Admin · Empresa | `/admin/empresas/:id` | `admin/empresas/:id` | todo lo anterior |
| S3 | Admin · Verticales | `/admin/verticales` | `admin/verticales/:v` | vertical_packs |
| S4 | Admin · Salud | `/admin/salud` | `admin/salud` | proceso, sesiones, modelo |
| E1 | Estados (vacíos, error, carga, banners, diálogos, toasts, offline) | — | — | componentes compartidos |

## 7-bis) Estado de implementación (as-is al 15/09/2026)

**Hecho y desplegado** (`31fc3aa`…`ccf7750`, lila `6075ff0`+):

- **UI** en `ui/dali` (Vite 8 + React 19 + Tailwind v4 + shadcn/radix, fuentes
  fontsource y Material Symbols autoalojados: cero red en runtime). Se compila
  en `build.js` de lila (`npm ci --include=dev` porque el deploy corre con
  `NODE_ENV=production`; si la UI no compila, lila igual se despliega y `/dali`
  responde 404 «no compilada»). Servida por lila en **`/dali/`** (`src/api/dali-ui.ts`,
  `DALI_HOSTS = ['dali.constroad.com']` redirige `/` → `/dali/`). El túnel para
  `dali.constroad.com` sigue pendiente de José (§2.1, paso 3); mientras tanto,
  `https://lila.constroad.com/dali/`.
- **Diseños**: el HTML de Stitch de las 93 pantallas en `ui/dali/design/html`;
  las capturas a resolución completa (39 MB) fuera del repo, en
  `~/.cache/lila-app/dali-design/shots` (cómo bajarlas: `ui/dali/design/README.md`).
  Cada pantalla se construyó con su captura abierta y se comparó por
  composición (skill `constroad-premium-ui` §0).
- **Pantallas** (móvil/tablet/escritorio): P2 Entrar, P3 Código, A1 Inicio, A2
  Conversaciones (en escritorio, lista + chat + datos del lead en tres
  columnas), A3 Conversación, A4 Leads (tablero por estado y lista; en
  escritorio, el lead elegido como panel a la derecha), A5 Lead, **A6
  Asistente**, **A8 Servicios, A9 guion, A10 pregunta**, **A15 Probar a
  Dali** (abajo). Las demás
  responden «esta pantalla se está construyendo»; «Más» del móvil lista lo
  que no cabe en la barra.
- **A6 Asistente** (`ui/dali/src/screens/asistente/*`, comparada con
  `A6-asistente.{MOBILE,TABLET,DESKTOP}.png`): estado y pausa (30 min, 2 h,
  hasta mañana) al toque; identidad (nombre, saludo, tono, emojis), reglas
  (precios, promesas, derivación, zona estricta + zona), horario (L–V, sábado,
  domingo con horas cada media hora en 24 h; respuesta fuera de horario),
  avisos (grupo conectado o número del dueño; qué casos), modo piloto
  (`testNumbers`), y en tablet/escritorio la **vista previa** del primer
  mensaje tal como saldría (`primerMensaje` espeja `saludoDe` de `guiado.ts`)
  más el resumen de comportamiento. «Guardar cambios» va en la barra de
  arriba (tablet y escritorio) y en un pie fijo (móvil); «Descartar» vuelve a
  lo del servidor. La **barra superior** ahora la arma el cascarón con las
  acciones que registra cada pantalla (`layout/barra.tsx`,
  `useAccionesDeBarra`): las de configuración la muestran también en
  escritorio, como en los diseños A6–A14; Chats/Leads siguen con la de tablet.
  Piezas compartidas nuevas: `Interruptor` (antes privado de Inicio) y
  `Segmentado`.
  - **Backend** `src/agent/dali/asistente.ts` + rutas `GET/PUT /asistente`,
    `POST /asistente/pausa` {minutos | 'manana' | 0}: `bot_configs.perfil`
    (`PerfilAsistente`, con `reglas` adentro como dice §3), `bot_configs.avisos`,
    `bot_configs.pausedUntil`. Todo lo guardado **lo usa el motor en el
    siguiente mensaje** (`negocioDe` en `ventas/index.ts`, cache del runtime
    invalidado al guardar): nombre de la asistente, saludo propio, aviso fuera
    de horario, horario en horas (`enHorarioSegun`) y en texto, zona, nombre
    de la empresa en los avisos; `emojis: 'ninguno'` los quita del guion
    (`sinEmojis`); la pausa la corta el router (`'paused'`, sin persistir el
    mensaje); `avisos.canal` decide el destino (grupo `ownerNotifyTarget` o
    `numeroDueno@s.whatsapp.net`) y `avisos.casos` qué se avisa (lead, pide
    persona, fallo). **Tono y reglas** se aplican solo en el prompt del modelo
    grande (`promptAsfalto`): el guion guiado de Qwen habla de tú y cumple las
    reglas siempre; la UI lo dice al pie de cada tarjeta. `greeting`/`tone`
    viejos de `bot_configs` se heredan si no hay perfil.
  - Tests: `asistente.test.ts` (perfil, avisos, destino, horario, negocio,
    pausa), `guiado.test.ts` (saludo propio, fuera de horario, sin emojis),
    `inbound-router.test.ts` (pausa).
- **A8 Servicios · A9 guion de un servicio · A10 editor de pregunta**
  (`ui/dali/src/screens/servicios/*`, comparadas con `A8-servicios`,
  `A9-guion` y `A10-pregunta` en los tres tamaños). Las tres editan el MISMO
  guion en memoria (`GuionProvider`) y se guarda de una vez: A8 lista los
  servicios (interruptor, modo, palabras, cuántas preguntas), la pregunta de
  cuando el cliente no dice qué necesita, «Agregar servicio» y «Restaurar el
  pack de Asfalto»; desde tablet, el servicio elegido (`?editar=<id>`) se
  edita en el panel derecho (nombre, palabras, modo, resumen de preguntas).
  A9 (`/servicios/:id`) es el guion: palabras que lo reconocen, secuencia de
  preguntas (orden con flechas, editar, duplicar, nueva) y la vista previa de
  las tres primeras preguntas (sin inventar respuestas). A10
  (`/servicios/:id/preguntas/:n`, `nueva`) es la pregunta: texto, nombre del
  dato, tipo, opciones con sus palabras y sugerencia, condición (solo sobre
  una pregunta anterior de opciones o sí/no), pista y explicación; panel al
  lado en escritorio, cajón en tablet, hoja desde abajo en móvil.
  - **Palabras, no regex (decisión de diseño)**: el guion del pack usa regex
    expertos (`alias`, `cambio`, `senal`); el panel muestra y edita listas de
    palabras. `regexDePalabras` (`ventas/guion.asfalto.ts`) arma el patrón:
    cada palabra por su **raíz** desde el inicio de palabra («asfaltar» →
    «asfalt» vale para asfaltado y asfaltamos; `raizDe` quita terminaciones si
    queda una raíz de 4+ letras), entera si es corta («m3», «mc»), las frases
    tal cual, sin tildes; para CAMBIAR un servicio ya fijado no valen unidades
    ni cifras («40 cubos» no vuelve venta un asfaltado). Lo que no se tocó
    vuelve al motor con los regex del pack (`dali/servicios.ts` `aGuion`
    compara las palabras con `palabrasDeOpcion`/`palabrasDeServicio`); lo
    editado queda solo con `palabras` (y conserva `senal`). Un servicio nuevo
    (`nuevo-…`) recibe su id del nombre; los `campo` de las preguntas son
    identificadores y se conservan tal cual (`tipoBase`). Un servicio apagado
    (`activo: false`) no se reconoce; una conversación que ya lo tenía sigue.
    `preguntaServicio` reemplaza la pregunta de desambiguación del guion.
  - API: `GET servicios` → `{guion editable, delPack, activos}`, `PUT
    servicios` (el guion entero; 400 si no tiene forma), `POST
    servicios/restaurar-pack` (borra `bot_configs.guion`). Los `PUT
    servicios/:id` y `…/preguntas` por separado de §4 no se hicieron: el
    editor guarda todo junto.
  - Tests: `guion.test.ts` (raíz, patrón, servicio editado y apagado, opción
    por palabras, `guionDe` con lo editable), `servicios.test.ts` (ida y
    vuelta pack↔panel, servicio nuevo, slug, campos intactos).
- **A15 Probar a Dali** (`ui/dali/src/screens/probar/*`, comparada con
  `A15-probar` en los tres tamaños): el simulador. `POST probar` {texto,
  estado, ultimaPreguntaBot, clienteConocido} corre el MISMO motor guiado
  (`extraerConQwen` + `paso`, `dali/probar.ts`) con el guion y el perfil
  vigentes, sin conversación en la base, sin lead y sin avisos; el estado del
  guion va y viene con el navegador (el servidor no guarda nada; rate limit
  30/min). «Cliente conocido» simula que quien escribe ya es cliente (su
  nombre y la empresa). «Lo que Dali entendió» sale del estado real: servicio
  detectado (por el pack o por las palabras editadas), cada dato del guion
  como anotado / pendiente (el paso activo, con sus opciones) / paso
  posterior, las señales por reglas (precio, persona, fuera de tema,
  confirma), si escalaría, y el motor y el tiempo del turno. **Sin certezas
  inventadas**: el diseño dibuja «98% certeza» e «intención 0.94»; no existen
  en el motor y no se muestran. Tests: `probar.test.ts` (campos y señales).
- **Backend** `src/agent/dali/*` + `src/api/routes/dali.routes.ts`:
  - **Sesión de prueba (decisión de José, 15/09: «no esperes un envío real de
    código, eso déjalo para el final»)**: el flujo de pantallas es el
    definitivo (`auth/codigo` → `auth/verificar` → cookie `dali_session`,
    JWT de lila con `app: 'dali'`, 14 días, `HttpOnly`, `Secure` detrás de
    https), pero sin constroad-auth (F2) **el código de seis cifras no viaja:
    queda en el log de lila** (`[dali] código de acceso para <identidad> (…): 123456`)
    y quien opera lila se lo pasa a la persona. Vale 10 min y un solo uso;
    cinco intentos lo queman; a quien no es miembro se le contesta igual que a
    quien sí. Rate limit 10/min por IP en `auth/*`. En F2 lo único que cambia
    es el canal.
  - `bot_members` (`miembros.ts`): identidad (teléfono sin «+» o correo) →
    empresa y rol. Semilla por `scripts/dali-miembro.ts`; hoy José (celular y
    correo) como `owner` de `constroad`.
  - `inicio.ts`: métricas de hoy vs ayer por día peruano, «piden atención»
    (escaladas, con el último mensaje del cliente y chips del lead), últimos
    leads, plan (uso real de `subscription.usage.whatsappMessages`; límite −1
    = sin límite). `conversaciones.ts`: lista (con el último mensaje en un
    solo aggregate), detalle, tomar (pausa de handoff del runtime), devolver,
    cerrar, escribir al cliente (sale por la sesión de la empresa y pausa a
    Dali). `leads.ts`: `bot_leads` (estado, cotización, notas, historial) por
    conversación; el lead se lee juntando `bot_conversations.lead` (lo que dijo
    el cliente) y el trabajo del dueño.
  - Tests: `acceso.test.ts` (ciclo del código, vencimiento, bloqueo,
    identidades), `inicio.test.ts` (métricas, tiempo de respuesta, atención,
    lead). Suite completa en verde (913 + 333).
- **Verificado en producción** (15/09, 13:20): `https://lila.constroad.com/dali/entrar`
  → código en el log → Inicio con los datos reales de Constroad; `/api/dali/*`
  sin sesión → 401.

**Decisiones tomadas al construir:**
- P2 en Stitch usa `slate` + `brand`; el resto del sistema usa `stone` +
  `teal`. Se unificó en `stone`/`teal` (los tokens del design system mandan).
- Las «variantes» que Stitch dibuja debajo de una pantalla (P2 «variante
  correo», P3 «enlace mágico») son estados de la misma pantalla, no tarjetas:
  se implementan como estado (método WhatsApp/correo).
- Los nombres de servicio del guion son minúsculas y con paréntesis
  («asfaltado (colocación)»); en títulos van en oración y sin paréntesis
  («Asfaltado 600 m² · Lurín»).
- Cualquier miembro puede tomar/devolver/cerrar y escribir al cliente; el rol
  fino (§3 `bot_members.role`) se aplica cuando llegue Equipo (A16).

**Sin verificar todavía:** tema oscuro (tokens definidos, ninguna pantalla
revisada en oscuro); A15 con Qwen en producción bajo carga (en local un turno
tarda ~5 s; el modelo es el mismo proceso que atiende al piloto, y un turno
del simulador compite con él); en A8–A10, un guion editado contra un mensaje real del
piloto (se probó guardando y restaurando desde la pantalla contra la base,
más los tests del motor); el arrastre para reordenar que dibuja Stitch se
reemplazó por flechas (decisión: sin librería de drag, y accesible); `escribirAlCliente` de punta a punta (envía por
WhatsApp: no se probó para no mandarle mensajes a nadie); PWA/instalable (F3
«done» lo pide); en A6, el efecto real de una pausa y de un perfil distinto
sobre una conversación de WhatsApp (se probó con tests y guardando/reanudando
desde la pantalla contra la base, no con un mensaje del piloto); A6 en
escritorio se miró en composición pero los clics se probaron en móvil (el
navegador de la herramienta no mapea bien los clics con 1440 emulado); la
barra superior en escritorio para Chats/Leads (A2 desktop la dibuja) queda
para cuando se revisen esas pantallas.

**Pendiente de F3:** P1, P4–P6, A7, A11–A14, A16–A20, S1–S4, E1 con sus endpoints (§4);
`dali.constroad.com` en el túnel (José); Lighthouse móvil; un aviso de
«WhatsApp desconectado» al dueño (A6 lo dibuja, ningún job lo emite hoy).

## 8) Riesgos y decisiones abiertas

- **Dominio y marca:** piloto en `dali.constroad.com` (§2.1); el dominio
  propio lo elige y compra José en F4.
- **Memoria de la Mac mini:** la UI es estática (no suma proceso); el
  importador de Excel y los reportes corren en el mismo proceso de lila con
  límites (archivo ≤ 2 MB, agregados por semana precalculados).
- **constroad-auth manda el código por WhatsApp vía lila:** si el número de
  Dali del negocio es el mismo que recibe leads, el código sale por el número
  de plataforma (el de constroad-auth), no por el del negocio. Confirmar en F2.
- **Portal:** `whatsappConfig.aiEnabled` se retira cuando Dali esté en F4;
  hasta entonces sigue deshabilitado como hoy.
