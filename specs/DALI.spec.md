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
   > Defecto que hubo (16/09): `montarUiDali` estaba montado DESPUÉS del
   > `app.get('/')` genérico de lila, así que en el host de Dali la raíz
   > contestaba `{status: ok}` y nunca redirigía a `/dali/`. Ahora va antes,
   > con test (`src/api/dali-ui.test.ts`).
3. **Túnel (lo hizo José el 16/09; pide sudo):** una línea en
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
| `bot_configs` | existe (1 por empresa) | `enabled`, `vertical`, `testNumbers`, `ownerNotifyTarget`, `handoffPauseMinutes`, `guion` (hoy). **Crece con:** `perfil` (asistente, presentación, tono, emojis, horario, fueraDeHorario, zona, reglas: daPrecios, prometeFechas, escala), `negocio` (descripción, dirección, contacto, ofrece[], noOfrece[]), `faq[]` ({pregunta, respuesta, variantes[], activa}), `catalogo[]` ({nombre, categoria, unidad, precio?, disponible, descripcion, foto?}), `avisos` (canal, qué avisar, silencio), `packVersion`, `operador` ({suspendida, suspendidaEl, nota}: lo que anota la consola S2). Caché 60 s en lila (ya existe por sesión). |
| `bot_conversations` | existe | conversación por cliente: estado bot/human/closed, pausas, `lead` (estado del guion), tokens. |
| `bot_conversation_messages` | existe (TTL 90 d) | transcripción. |
| `bot_leads` | **nueva** | el lead como objeto de trabajo del dueño: `companyId`, `conversationId`, `servicio`, `campos` (etiqueta→valor), `resumen`, `confirmado`, `estado` (nuevo/contactado/cotizado/ganado/perdido), `cotizacion` {monto, enviadaEl, validaHasta, pdf}, `notas[]`, `historial[]`, `motivoPerdido`. Se crea cuando el motor guarda un lead con servicio y (lugar o cantidad); se actualiza mientras la conversación siga; después es del dueño. |
| `bot_members` | **nueva** | `companyId`, `identidad` (teléfono/correo), `nombre`, `rol` (owner/sales/viewer, y `operator` con `companyId` `*` para la consola S1–S4), `recibeAvisos`, `ultimoIngreso`. Espejo mínimo de constroad-auth `miembros` con el rol de la app. |
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
| whatsapp | `GET whatsapp` (estado, salud de hoy, historial) · `POST whatsapp/vincular` {metodo: qr \| codigo} (reusa el núcleo del QR de `/api/sessions`) · `POST whatsapp/reconectar` · `POST whatsapp/desconectar` · `POST whatsapp/prueba` {numero} | `whatsapp_session_events` |
| conversaciones | `GET conversaciones?estado&q&cursor` · `GET conversaciones/:id` (mensajes + lead) · `POST conversaciones/:id/tomar` · `POST …/devolver` · `POST …/cerrar` · `POST …/mensaje` {texto} (sale por el número del negocio, pausa a Dali) · `POST …/nota` | |
| leads | `GET leads?estado&servicio&q` · `GET leads/:id` · `PATCH leads/:id` {estado, cotizacion, motivoPerdido} · `POST leads/:id/notas` · `GET leads/exportar.xlsx` | |
| probar | `POST probar` {sesionId?, mensaje, como: nuevo|conocido} → {respuesta, entendido, siguiente, senales} | corre `paso()` con un estado en memoria (TTL 30 min), sin persistir ni avisar. |
| equipo | `GET equipo` · `POST equipo` (invitar = dar acceso) · `PATCH equipo/:id` {rol, recibeAvisos} · `DELETE equipo/:id` | `bot_members`; en F2 también constroad-auth. |
| plan | `GET plan` (plan, uso, semanas, pagos) | hoy solo el piloto, sin costo ni pagos; los planes de pago y sus comprobantes, en F4. |
| notificaciones | `GET/PUT notificaciones` (canal, grupo de la línea, número, casos, descanso) · `POST notificaciones/prueba` | `bot_configs.avisos` + `ownerNotifyTarget`. |
| reportes | `GET reportes?periodo=semana\|semana-pasada\|30-dias` | calculado al pedirlo sobre `bot_conversations`, `bot_leads` y los mensajes (90 días); «no supo responder» = las sugeridas de FAQ. |
| ajustes | `PATCH ajustes/perfil` {nombre} (reemite la sesión) · `GET ajustes/exportar.xlsx` | sin sesiones remotas (la sesión es una cookie de 14 días, sin registro) ni baja desde el panel (se pide por escrito). |
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

## 7-bis) Estado de implementación (as-is al 16/09/2026)

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
  Asistente**, **A7 Negocio**, **A8 Servicios, A9 guion, A10 pregunta**,
  **A11 Preguntas frecuentes**, **A12 Catálogo**, **A15 Probar a Dali**
  (abajo). Las demás
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
- **A7 Negocio — la ficha** (`ui/dali/src/screens/negocio/NegocioScreen.tsx`,
  comparada con `A7-negocio` móvil y tablet; el de escritorio salió
  superpuesto de Stitch y se siguió la composición de los otros dos): datos
  del negocio (nombre comercial, rubro solo lectura, descripción de 240,
  RUC de 11 dígitos, web), dónde está (dirección, zona —la MISMA de A6,
  `perfil.zona`—, enlace al mapa, cómo llegar), contacto oficial (el WhatsApp
  de Dali solo lectura, teléfono, correo, red social), lo que ofrece (los
  servicios activos del guion, que se editan en Servicios, más una lista
  libre de otros productos) y lo que NO ofrece. `GET/PUT /negocio`
  (`dali/negocio.ts`, `bot_configs.negocio`; lo vacío sale de la empresa de
  Portal: nombre, RUC, dirección, teléfono, correo). El motor lo usa: la
  descripción, lo que ofrece y lo que no, dónde está y los contactos entran
  al prompt del modelo grande; en el guion guiado, «¿dónde están? / ¿cómo
  llego?» se contesta con «cómo llegar» una vez y se sigue
  (`PREGUNTA_UBICACION` en `guiado.ts`). Sin el mapa dibujado (no hay API de
  mapas; el enlace abre Google Maps) ni la verificación SUNAT del diseño.
  Tests: `negocio.test.ts` (ficha desde Portal, recortes, mezcla, RUC),
  `guiado.test.ts` (dónde están).
- **A11 Preguntas frecuentes** (`ui/dali/src/screens/faq/*`, comparada con
  `A11-faq` en los tres tamaños): lo que Dali responde tal cual. Lista de
  tarjetas (pregunta, respuesta, variantes «también se pregunta así»,
  categoría, interruptor, «usada N veces»), edición en el lugar, búsqueda y
  pestañas por categoría, «Sugeridas por Dali» (preguntas de clientes de los
  últimos 30 días que Dali contestó con «solo puedo ayudarte con lo de
  asfalto», agrupadas: `sugeridasDe`), y el probador (`POST faq/probar` →
  con cuál coincide, cuánto y qué contestaría). La lista se guarda entera
  (`PUT faq`) en `bot_configs.faq` (`dali/faq.ts`). **Cómo reconoce**: por
  embeddings con el mismo `multilingual-e5-small` local del agente de
  operaciones (`checklist/semantica.ts` `cargarModelo`), coseno entre el
  mensaje y cada pregunta o variante, umbral `UMBRAL_FAQ = 0.87` (medido:
  «sábados atienden?» 0.93 contra «¿Trabajan los sábados?», «abren los
  domingos?» 0.85, «cuánto cuesta el m2» 0.78); sin modelo, por palabras en
  común (Jaccard ≥ 0.6). **En el motor**: `turnoGuiado` y el simulador
  corren la extracción de Qwen y la FAQ en paralelo; si coincide,
  `Extraccion.respuestaFaq` y `paso` la dice delante de la pregunta pendiente
  sin contarla como «no entendí» ni fuera de tema; se incrementa `usos`.
  Tests: `faq.test.ts` (limpieza, literal, coseno con modelo de juguete,
  sin modelo), `guiado.test.ts` (FAQ dentro del guion).
- **A12 Catálogo** (`ui/dali/src/screens/catalogo/*`, comparada con
  `A12-catalogo` en los tres tamaños): lo que vende la empresa. La política
  «Dali puede decir precios» (`bot_configs.dicePrecios`) manda: apagada, Dali
  contesta como siempre (el asesor cotiza); encendida, si el cliente pregunta
  el precio y nombra un ítem del catálogo, Dali dice el referencial por
  unidad («precio referencial que el asesor confirma»), y si el ítem no está
  disponible, que está bajo pedido especial (`itemEnTexto` +
  `respuestaDePrecio` en `dali/catalogo.ts`, usados en `paso`); el prompt del
  modelo grande recibe el catálogo entero. Tabla desde tablet y tarjetas en
  móvil, ítem editado en panel/hoja (nombre, categoría, unidad, precio con
  IGV, disponible, descripción, SKU), búsqueda y pestañas por categoría;
  `GET/PUT catalogo` (la lista entera). **Sin fotos** (el diseño las
  dibuja; Dali no tiene almacén de imágenes todavía); «Importar desde Excel»
  enlaza a A13. Tests: `catalogo.test.ts` (limpieza, ítem en el texto,
  respuesta de precio), `guiado.test.ts` (precio del catálogo en el guion).
- **A13 Importar desde Excel** (`ui/dali/src/screens/importar/*`, comparada
  con `A13-importar` en los tres tamaños): tres pasos. **1) La plantilla**
  (`GET importar/plantilla.xlsx`, `exceljs`) sale con lo que la empresa YA
  tiene —así también exporta—: cinco hojas, *Negocio* (campo / valor / ayuda),
  *Servicios* (código, nombre, palabras clave, modo, activo), *Preguntas*
  (servicio, orden, pregunta, dato, tipo, opciones «valor: palabra; palabra |
  valor2», condición «Dato = valor», pista, explicación, y una décima columna
  «Código del dato (no tocar)» con el identificador interno para que una ida y
  vuelta no lo cambie), *Preguntas frecuentes* y *Catálogo*. **2) Subir**
  (`POST importar/analizar`, multipart en memoria, ≤ 2 MB por §8 —la de
  Constroad pesa 14 KB—, arrastrar o elegir): se lee, se cuenta por hoja y se
  listan los **avisos** de lo que se normalizó (sin palabras clave, opción sin
  palabras, condición que apunta a un dato sin opciones, pregunta de un
  servicio que no está, FAQ sin respuesta, ítem sin nombre); nada se guarda
  todavía: el plan queda en memoria con un token 15 minutos. **3) Guardar**
  (`POST importar/confirmar` {token, modo}) en modo **agregar** (lo que
  coincide por código / pregunta / nombre se actualiza, lo demás se suma, las
  FAQ conservan sus usos) o **reemplazar** (cada hoja con datos pisa la suya);
  escribe negocio, guion, FAQ y catálogo con los mismos `guardar*` de sus
  pantallas y deja el registro en `bot_imports` (archivo, tamaño, modo,
  resumen, quién, cuándo; `GET importar/historial`). Probado de punta a punta
  contra la base con la plantilla de Constroad subida sin tocar: 27 elementos
  (1 ficha, 4 servicios, 22 preguntas), guion equivalente al pack; después se
  restauró el pack y se borró el registro de prueba. Tests: `importar.test.ts`
  (plantilla ↔ lectura ida y vuelta, rechazo por tamaño y por formato, conteo
  y avisos, los dos modos).
- **A14 WhatsApp** (`ui/dali/src/screens/whatsapp/*`, comparada con
  `A14-whatsapp` en los tres tamaños): la línea desde la que Dali atiende.
  **Estado real** de la sesión Baileys del número de la empresa
  (`companies.whatsappConfig.sender`): conectado / vinculando (QR escaneado,
  primer login) / conectando (socket sin abrir) / requiere vincular (aparcada
  o con QR esperando) / desconectado / sin número — `estadoDeLinea` en
  `dali/whatsapp.ts`, con el manager de sesiones INYECTADO (`OperacionesDeLinea`,
  armado en la ruta por import dinámico, como el envío al cliente). Con
  quiénes se comparte el número (`listCompaniesByWhatsappSender`: el de
  Constroad lo usa también Inframaq), la cuenta (plataforma y nombre de las
  creds, `readAuthAccountInfo`, sin secretos), desde cuándo está conectada y
  el último mensaje. **Salud de hoy**: mensajes por quién los escribió,
  conversaciones, envíos fallidos y tiempo de respuesta (mediana). **Historial
  de la línea** (7 días, 20 eventos): la colección nueva
  `whatsapp_session_events` (`baileys/session-events.ts`, TTL 30 días,
  fire-and-forget) que el manager escribe en cada transición —conectado,
  reconectado (con los intentos), desconectado (con el código y el motivo en
  palabras: 428 «se cortó la conexión», 440 «otra instancia», 515…),
  vinculado, desvinculado (401), aparcado— más lo que hace el panel
  (reconexión o desconexión pedida por quién, mensaje de prueba) y cada
  respuesta del bot que no salió (`onSendFailed` del router → «Fallidos»; no
  va a la línea de tiempo). Las rotaciones del QR y los reintentos que no
  abren no se registran; el cierre por apagado de lila tampoco (cada deploy
  deja solo su «Conectado»). **Acciones**: «Reconectar» = `restartSession`
  (reinicio suave, conserva la sesión: vale para números compartidos);
  «Desconectar» = `disconnectSession` (logout en WhatsApp, obliga a vincular
  de nuevo) con confirmación inline, y **bloqueado (409) si el número lo
  comparten varias empresas**; «Vincular» reusa el núcleo del QR de Portal
  (`resolveQrState`, extraído del controller de sesiones: marca al
  consumidor, levanta la sesión si no existe y devuelve conectada / vinculando
  / preparando / QR como imagen; si la sesión NO pudo levantarse —sin lease,
  proxy— lo dice en `startError` en vez de «conectando» eterno) con el panel
  pidiéndolo cada 5 s y un contador de 20 s, o el código de ocho letras
  (`requestPairingCodeForSession`, «ABCD-EFGH»); **mensaje de prueba** solo a
  un celular del equipo (`bot_members`) o de la lista de pruebas
  (`bot_configs.testNumbers`) — la línea del negocio no se usa para
  escribirle a extraños —, con `WhatsAppDirectService.sendMessage`
  (`queueOnFail: false`, cuenta en la cuota), rate limit 5 cada 10 min. De
  regalo, `inicio.asistente.conectado` dejó de ser «hay un número
  configurado» y pasó a ser el estado real (la barra superior dice «WhatsApp
  sin conexión» cuando lo está). **Contra el diseño**: sin «ID de instancia /
  servidor AWS» (no existe; se dice «WhatsApp Web (multi-dispositivo) ·
  Servidor en Lima»), sin «98 % entregados» (Baileys no da acuses en lila; se
  muestran los fallidos reales), sin el logo de Dali encima del QR (taparlo
  puede impedir escanearlo), la «alerta de respaldo» no ofrece «avisos por
  SMS» y dice que hoy NO hay aviso automático de caída, «Ver registro
  completo» no existe (son 7 días, 20 eventos). Tests: `whatsapp.test.ts`
  (estado, legibles, salud, historial, destino permitido, texto de prueba),
  `session-events.test.ts`, `sessions.simple.test.ts` (qué transición deja
  qué evento), `session.controller.simple.test.ts` (`resolveQrState`),
  `inbound-router.test.ts` (envío fallido).
- **A16 Equipo** (`ui/dali/src/screens/equipo/*`, comparada con `A16-equipo`
  en los tres tamaños): quién entra al panel y quién recibe los avisos. Es
  `bot_members` administrado desde el panel (`dali/equipo.ts`): la lista con
  nombre, identidad (celular o correo), rol, avisos, último ingreso y si está
  **pendiente** (nunca entró); **invitar = dar acceso** (`POST equipo`:
  celular de 9 cifras o correo, nombre —el diseño no lo pide, pero sin nombre
  no hay a quién mostrar—, rol y «recibe los avisos», que con correo no aplica
  porque los avisos van por WhatsApp); cambiar rol o avisos (`PATCH`) y quitar
  (`DELETE`, con confirmación en la fila); nadie puede quitar ni degradar al
  último dueño; cupo del piloto `CUPO_MIEMBROS = 5` (no hay plan con asientos
  todavía). **Roles de verdad** (`dali/permisos.ts`, gate en la ruta después
  de la sesión): leer puede cualquiera; la configuración (asistente,
  servicios, negocio, FAQ, catálogo, importar, WhatsApp, equipo) la cambia
  solo el dueño; conversaciones y leads los trabajan dueño y ventas; solo
  lectura no toca; probar a Dali, todos. **Avisos al equipo**: los avisos de
  A6 (lead, cliente que pide a alguien, fallo) ahora salen al canal elegido Y
  a cada miembro con celular y avisos activos (`destinosDeAviso` en
  `asistente.ts`, `AgentBotConfig.alertTargets` que el wiring llena con
  `jidsConAvisos`; `ventas/index.ts` avisa a cada destino). **Contra el
  diseño**: la invitación NO manda ningún mensaje ni enlace de 24 h (eso es
  constroad-auth, F2): la persona entra pidiendo su código y hasta F2 el
  código le llega a quien opera lila, y la pantalla lo dice; por eso tampoco
  hay «Reenviar»; el filtro de avisos por servicio («Asfalto en caliente») no
  existe (es prender/apagar); el «Plan Negocio» es «Piloto · N de 5». Probado
  de punta a punta contra la base con un miembro de prueba (invitar, cambiar
  rol y avisos, quitar). Tests: `equipo.test.ts` (legible, invitación, último
  dueño, JIDs de avisos, cupo), `permisos.test.ts` (qué rol cambia qué),
  `asistente.test.ts` (`destinosDeAviso`).
- **A17 Plan y uso** (`ui/dali/src/screens/plan/*`, comparada con `A17-plan`
  en los tres tamaños): lo que la empresa usa este ciclo (`GET plan`,
  `dali/plan.ts`). **Lo real**: el ciclo es el mes calendario en Lima (cierre,
  días restantes, «se renueva el 1»); los mensajes de WhatsApp que salieron
  por la línea este mes (`usage_metrics.whatsapp.total` del período: es el
  mismo conteo de la cuota de `companies.limits.whatsappMessages`, e incluye
  a Lila y a los avisos, no solo a Dali) contra el límite (−1 = sin tope, que
  es el caso del piloto); las respuestas de Dali del mes
  (`bot_conversation_messages` con `role: 'bot'`); el número conectado (1 de
  1); los miembros (N de 5); y las **conversaciones nuevas por semana** de las
  últimas ocho semanas, lunes a domingo en Lima (`$dateTrunc` sobre
  `bot_conversations.createdAt`), con promedio y variación contra la semana
  anterior. **Contra el diseño, deliberado**: el diseño dibuja «Plan Negocio
  S/ 149», «Plan Crecimiento S/ 299», comprobantes, historial de pagos,
  «Cambiar de plan» y «Descargar resumen contable»; nada de eso existe: el
  único plan es el **Piloto, sin costo**, la pantalla lo dice, las tarjetas de
  planes son «Piloto (tu plan actual)» y «Planes de pago: en camino», y el
  historial de pagos es un vacío honesto. La «Protección contra pérdida de
  ventas» del diseño describía un tope que Dali no aplica (nada corta el
  servicio al llegar a la cuota): se reemplazó por «sin sorpresas durante el
  piloto». Tests: `plan.test.ts` (ciclo en Lima, ocho semanas, variación).
- **A18 Notificaciones** (`ui/dali/src/screens/notificaciones/*`, comparada
  con `A18-notificaciones` en los tres tamaños): por dónde avisa Dali, qué
  avisa y cuándo calla. Es la MISMA configuración de A6 «Avisos»
  (`bot_configs.avisos` + `ownerNotifyTarget`, `dali/notificaciones.ts`),
  con lo que A6 no tenía: el grupo se elige entre los **grupos reales de la
  línea** (`WhatsAppDirectService.listGroups` del store de la sesión; si la
  línea no está conectada en el proceso, se muestra el grupo actual y no se
  puede cambiar) y el **horario de descanso** (`avisos.descanso`, hora de
  Lima, cruza la medianoche): `enDescanso` en `asistente.ts`,
  `AgentBotConfig.quietHours` y `destinosDeAviso` devuelve vacío en la
  franja — no sale ningún aviso, los leads igual quedan en el panel. Los
  eventos son los tres reales (lead con datos —incluye «listo para cotizar»
  y lo que el cliente agrega después—, cliente que pide a alguien, Dali no
  pudo contestar), con un ejemplo con datos inventados en el formato exacto
  del aviso; «WhatsApp desconectado» y «Resumen semanal» se muestran como
  **todavía no** (nada los emite). El correo no es un canal (nada manda
  correos). `POST notificaciones/prueba` manda un mensaje de prueba al canal
  elegido por la línea (rate limit 5/10 min). Probado contra la base
  (guardar el descanso y revertirlo). Tests: `notificaciones.test.ts`
  (armado, validación, eventos, prueba), `asistente.test.ts` (descanso,
  `destinosDeAviso` en la franja).
- **A19 Reportes** (`ui/dali/src/screens/reportes/*`, comparada con
  `A19-reportes` en los tres tamaños): cómo le fue a Dali en un período
  —esta semana, la semana pasada o los últimos 30 días— contra el período
  anterior del mismo largo (`GET reportes?periodo=`, `dali/reportes.ts`;
  semanas de lunes a domingo en Lima; se calcula al pedirlo, sin agregados
  guardados: son cientos de documentos, no millones). **Definiciones**:
  conversaciones = las que tuvieron actividad del cliente en el período (o
  nacieron en él); leads = con servicio identificado; confirmados = con todos
  los datos (`lead.listo`); atendidos por persona = escaladas; por día =
  conversaciones NUEVAS por día (Lima); leads por servicio con el nombre del
  guion; embudo iniciadas → servicio → datos completos → cotizados
  (`bot_leads` cotizado/ganado) → ganados; «lo que más preguntan» = las FAQ
  por **usos acumulados** (no del período, y así se dice); «Dali no supo
  responder» = las sugeridas de A11 (30 días); tiempos = mediana de la
  respuesta de Dali (solo respuestas dentro de 10 min: una horas después no
  fue de Dali) y mediana desde la escalada hasta el primer mensaje del equipo.
  El gráfico por día es línea con área y el pico marcado, etiquetas en HTML.
  **Contra el diseño, deliberado**: sin «Descargar PDF», sin horas pico, sin
  «ciclo de venta en días» ni «servicio más rentable» (no se miden); las
  variaciones son contra el período anterior y sin período anterior se dice
  «sin período anterior para comparar». Tests: `reportes.test.ts` (rangos,
  resumen, embudo, por día, por servicio, variación, toma humana),
  `inicio.test.ts` (tope del tiempo de respuesta).
- **A20 Ajustes** (`ui/dali/src/screens/ajustes/*`, comparada con
  `A20-ajustes` en los tres tamaños): tu perfil (el nombre, editable:
  `PATCH ajustes/perfil` cambia `bot_members.name` y reemite la cookie con el
  nombre nuevo; la identidad con la que se entra se muestra y no se cambia
  desde acá), cómo se entra (sin contraseña; «este dispositivo» y que la
  sesión dura 14 días), preferencias (idioma, zona horaria y tema como
  valores fijos y dichos: el oscuro «llega cuando esté revisado»), la empresa
  (de la ficha de A7 e Inicio, con enlace a Negocio), **la exportación a
  Excel** (`GET ajustes/exportar.xlsx`, `dali/ajustes.ts` con `exceljs`: hoja
  «Conversaciones» —hasta 5 000, las más nuevas— y hoja «Leads», un lead por
  conversación con servicio, con el trabajo del dueño de `bot_leads` si
  existe y «nuevo» si no; fechas en hora de Lima), y cerrar sesión. **Contra
  el diseño, deliberado**: sin foto, sin cargo, sin correo editable (la
  identidad es una sola), sin «sesiones abiertas» ni «cerrar las demás» (no
  hay registro de sesiones: es un JWT en cookie), sin selector de tema, sin
  «Términos y privacidad» ni «Registro de auditoría», y la «zona de peligro»
  no borra nada: dice que la baja se pide por escrito. Probado contra la base
  (cambiar el nombre y revertirlo; la exportación real de Constroad bajó
  con 1 conversación y su lead). Tests: `ajustes.test.ts` (nombre, filas en
  Lima, el libro con sus dos hojas).
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
- **P4–P6 Registro** (`ui/dali/src/screens/registro/*`, comparadas con
  `P4-registro`, `P5-conectar-whatsapp` y `P6-conocimiento` en los tres
  tamaños; `src/agent/dali/registro.ts`): el alta de una empresa nueva desde
  cero, sin nadie de Constroad en el medio. **P4** pide negocio, rubro (hoy
  solo Asfalto tiene pack: los otros cuatro se ven y no se eligen,
  «Próximamente»), zona, nombre, WhatsApp personal y el nombre de la asistente;
  `POST registro` (público, 10/min por IP) deja un **borrador en memoria**
  (15 min) y manda el código de seis cifras al WhatsApp —que, igual que en
  P2/P3, hasta F2 **queda en el log de lila**: `[dali] código de registro para
  <wa> (<negocio>, <nombre>): 123456`—; reenviar antes de 30 s contesta 429.
  **La empresa se crea recién con el código correcto** (`POST
  registro/confirmar`, P3 en modo registro: 10 min, cinco intentos, un solo
  uso): `companies` (companyId derivado del nombre, sin tildes ni «S.A.C.»,
  con sufijo -2/-3 si ya existe), `bot_configs` con `vertical: 'asphalt'`,
  el perfil (asistente y zona) y los avisos al dueño, y ella como `owner` en
  `bot_members`; la respuesta ya trae la cookie de sesión y la UI sigue al
  paso 2 sin pasar por Inicio. **P5**: el número del negocio pasa a ser la
  línea de la empresa (`PUT registro/numero`, dueño; **409 si otra empresa ya
  lo usa** como sender) y se vincula con el mismo panel de A14 (QR o código;
  `GET whatsapp` cada 5 s); «Continuar» se habilita cuando la línea queda
  conectada (en móvil dentro del aviso «Estado de confirmación», desde tablet
  al lado del «Conectado»). **P6** reutiliza A13 (plantilla, `importar/analizar`
  y `confirmar` en modo agregar) y muestra el pack de Asfalto como ya elegido
  («Seleccionado por defecto · Listo», con los servicios reales del guion) en
  vez del botón «Usar el pack» del diseño, que no tendría nada que hacer porque
  el pack ya viene puesto al crear la empresa; «Lo que quedará listo» cuenta
  de verdad servicios activos, preguntas, FAQ y catálogo. El cascarón
  (`piezas.tsx`): en móvil el contenido va directo sobre la página, desde
  tablet en la tarjeta blanca (P6 más ancha, a dos columnas); «¿Ya tienes
  cuenta? Entrar» en el paso 1 y «Conexión segura» con sesión. **Contra el
  diseño, deliberado**: sin «¿Ayuda?» (no hay número de soporte definido),
  sin «14 días de prueba» (el piloto no tiene plazo: «Piloto sin costo · Sin
  tarjeta»), sin «Términos / Privacidad» (no existen las páginas), y el paso a
  paso lleva «PASO n» en escritorio como en P4 (P5/P6 lo dibujan sin él).
  Probado en el harness de punta a punta con una empresa de prueba («Prueba
  Dali», borrada después con `borrar-prueba-dali.mts`: companies, bot_configs
  y bot_members): P4 → código del log → empresa creada y sesión → P5 con el
  409 del número de Constroad y la asignación de otro → P6 con los conteos.
  Tests: `registro.test.ts` (datos, companyId, borrador y código, creación,
  número ocupado), `permisos.test.ts` (registro es configuración: dueño).
- **S1–S4 Consola del operador** (`ui/dali/src/screens/admin/*`,
  `layout/AdminShell.tsx`, comparadas con `S1-admin-empresas`,
  `S2-admin-empresa`, `S3-admin-verticales` y `S4-admin-salud` en los tres
  tamaños; backend `src/agent/dali/admin.ts`, `verticales.ts`, `salud.ts`,
  `suspension.ts`; rutas `/api/dali/admin/*` con `requireDaliOperator`).
  **Quién**: el operador es una ficha más de `bot_members`, rol `operator`
  con `companyId` `*` (hoy José, con su celular y su correo;
  `scripts/dali-miembro.ts '*' <identidad> "<nombre>" operator`). Entra con
  su código como siempre —el login prefiere su empresa— y desde el panel de
  su empresa pasa a la consola con «Consola de Dali» (sidebar, rail y «Más»;
  `POST auth/operador` reemite la cookie con rol `operator`) y vuelve con
  «Volver a mi empresa» (`POST auth/empresa`). El cambio nunca es automático:
  una sesión de empresa que cae en `/admin` ve «Entrar a la consola», y una
  de operador que cae en el panel va a `/admin`. El cascarón es oscuro (para
  no confundirlo con un panel de empresa): sidebar en escritorio, rail en
  tablet, cabecera + barra de cuatro pestañas en móvil; «Cuentas y accesos»
  del diseño no existe (los accesos son de cada empresa, en su Equipo).
  **S1** lista las empresas de Dali (las que tienen `bot_configs`) con línea
  (estado real del manager de sesiones), estado del asistente (atendiendo /
  pausado / apagado / requiere QR / sin línea / suspendida), uso del mes
  (`usage_metrics`), último mensaje y miembros; búsqueda, chips por rubro,
  filtro por estado y tabla en escritorio; «Nueva empresa» (hoja, mismos
  datos que P4 sin código: la dueña queda pendiente hasta su primer ingreso;
  opcionalmente el número de la línea, 409 si otra empresa lo usa) y «Abrir
  panel»: **entra al panel de esa empresa con una sesión de dueño a nombre del
  operador** («José (Dali)» firma lo que haga; su identidad sigue siendo la
  suya, así vuelve a la consola). **S2**: cabecera con pausa/encendido del
  bot (`enabled`), cuatro cifras (conversaciones y mensajes del mes, leads
  del mes contra la semana previa, miembros, modelo local sin costo por
  mensaje), la línea (estado, dispositivo, desde cuándo, con quién se
  comparte), plan (piloto, sin pagos), configuración del asistente y
  conocimiento contados con los mismos lectores del panel, **actividad
  reciente** (escaladas, leads avisados, ingresos, importaciones y los
  eventos de la línea, en una sola línea de tiempo, 30 días), la **nota
  privada** del operador (`bot_configs.operador.nota`) y **suspender**:
  `operador.suspendida` apaga el bot y `requireDaliSession` contesta 403
  `motivo: 'suspendida'` a todos menos al operador (caché de un minuto por
  empresa; suspender y levantar la actualizan en el acto); la UI muestra «Tu
  empresa está suspendida». Ver QR, editar y reimportar entran al panel de la
  empresa en esa pantalla (no se duplican acá; «Desconectar» tampoco: es de
  A14). **S3**: los cinco rubros del registro; solo asfalto tiene pack (v1,
  en el código: 4 servicios, 22 preguntas, 2 de cierre, plantilla de A13) y
  se muestra tal cual con sus empresas; «Aplicar pack a una empresa» es el
  «restaurar pack» de A8 con confirmación; los otros cuatro van como
  «próximamente» con el modo del motor que les tocará (§5). Sin «Nuevo
  vertical» ni edición: el pack se edita con un deploy hasta que exista
  `vertical_packs`, y se dice en pantalla. **S4**: líneas conectadas,
  mensajes de la última hora, mediana del tiempo de respuesta de Dali,
  envíos fallidos y desconexiones; el modelo local (cargado / en disco / sin
  descargar, último uso, se descarga solo tras 5 min y «Descargar ahora» lo
  libera ya: `descargarLlm`); la máquina (RAM real vía `memory_pressure`,
  CPU, disco, uptime, historia de CPU/RAM de `admin-health`); las líneas por
  empresa (caída desde cuándo y por qué); errores de 24 h solo de líneas de
  Dali; y el deploy (sha y fecha de la carpeta de release de torre). Se
  refresca cada 30 s. **Contra el diseño, deliberado**: sin planes de pago
  ni «Registrar pago» (F4), sin colas/Redis/BullMQ (lila no los tiene), sin
  «Avisar al dueño» ni «Reconectar QR» desde la consola (son envíos y
  acciones sobre la línea: se hacen desde el panel de la empresa), sin RUC
  (no lo pide el registro), sin «Cuentas y accesos». Probado en el harness:
  alta de «Prueba Consola» desde la hoja, apagar/encender, suspender (403
  comprobado con un token de esa empresa) y reactivar, aplicar el pack, abrir
  su panel y volver a la consola, volver a mi empresa; la empresa de prueba
  se borró después. Tests: `admin.test.ts` (estado del asistente, fila y
  resumen, actividad, sesión para entrar), `verticales.test.ts`,
  `salud.test.ts` (estado general, errores, deploy), `suspension.test.ts`
  (caché).
- **P1 Landing** (`ui/dali/src/screens/landing/LandingScreen.tsx`, comparada
  con `P1-landing` en los tres tamaños): la página pública en `/dali/` sin
  sesión (con sesión, al inicio): cabecera con «Entrar» y «Probar gratis»
  (→ registro), héroe con la conversación de muestra (sigue el guion real de
  asfalto: área y lugar, espesor, base, y el aviso «lead calificado»), «cómo
  funciona en 3 pasos» (P4→P6), «un asistente preparado para cada rubro»
  (asfalto de verdad; los otros tres «próximamente»), «lo que Dali NO hace»
  (las reglas del asistente, tal cual: sin precios cerrados, sin fechas,
  pasa a una persona y se calla 30 min), «Piloto sin costo» (en vez de los
  planes) y el pie. **Contra el diseño, deliberado**: sin precios ni planes
  (F4), sin «14 días», sin logos de clientes (Inframaq es un cliente y no
  dio permiso; «Globofast» no existe), sin «Ver una demo» (no hay video),
  sin número de soporte ni «Hablar con un asesor», sin «Términos» ni
  «Privacidad» (no existen las páginas).
- **Marca y tarjeta al compartir** (16/09): el isotipo de Dali salió de una hoja
  de marca generada en Stitch (monograma «D» geométrico: columna, arco de
  diálogo y punto focal; teal `#115e59` sobre papel, teal claro `#99f6e4`
  sobre oscuro), como SVG puro en `components/BrandMark.tsx` (`MarcaDali`);
  se corrigió el arco para que cierre al ras de la columna. El mismo trazo va
  en el favicon (`public/favicon.svg`, monograma blanco sobre teal), en los
  PNG de icono y en la imagen de la tarjeta (`public/og.png`, 1200×630),
  renderizados con el Chrome del sistema y las fuentes de la app
  (`scripts/og-image.mjs`; se corre a mano cuando cambie la marca). El
  `index.html` lleva título, descripción, canónica, `theme-color` y las
  etiquetas Open Graph/Twitter con la imagen absoluta
  (`https://dali.constroad.com/dali/og.png`), así al compartir el enlace por
  WhatsApp sale la tarjeta con el logo, igual que Portal y chancadora. Son
  etiquetas estáticas (la SPA sirve el mismo `index.html` para toda ruta), o
  sea que cualquier enlace del panel muestra la tarjeta de la landing.
- **E1 Estados** (`ui/dali/src/components/Estados.tsx`, `layout/Banners.tsx`,
  comparados con `E1-estados`): las piezas comunes —vacío con icono, título,
  texto y acción; «No pudimos cargar esto» con reintentar; «Nada con «x»»
  con limpiar búsqueda— y los avisos globales arriba de cualquier pantalla
  del panel: **sin conexión** (el navegador offline; se dice que lo que ves
  puede estar viejo, sin prometer que lo que cambies se guarde: no hay cola
  offline), **línea desconectada** («Dali no está atendiendo» + «Vincular
  ahora», salvo en WhatsApp), **límite del plan** (solo si hay límite y el
  uso pasa del 90 %; el piloto no tiene) y **«esto lo cambia el dueño»** en
  las pantallas de configuración para quien no es dueño (nombra al dueño;
  la API ya contestaba 403). Cableado en Conversaciones (nadie escribe /
  conecta tu número / sin resultados / error), Leads (aún no hay leads / sin
  resultados / error) e Inicio (error). Skeletons y toasts ya existían por
  pantalla; la confirmación destructiva ya existía donde hace falta (A14
  desconectar, A16 quitar, S2 suspender, S3 aplicar pack). Probado: los
  cuatro avisos y los vacíos en el harness (offline con el navegador en modo
  offline, el rol con una sesión de ventas firmada, la línea caída porque el
  harness no tiene el lease).
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
    lead). Suite completa en verde (1126 + 333, tras S1–S4).
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
- Dueño y ventas pueden tomar/devolver/cerrar y escribir al cliente; solo
  lectura, no; la configuración es del dueño (A16, `dali/permisos.ts`).

**Sin verificar todavía:** tema oscuro (tokens definidos, ninguna pantalla
revisada en oscuro); A15 con Qwen en producción bajo carga (en local un turno
tarda ~5 s; el modelo es el mismo proceso que atiende al piloto, y un turno
del simulador compite con él); en A8–A10, un guion editado contra un mensaje real del
piloto (se probó guardando y restaurando desde la pantalla contra la base,
más los tests del motor); el arrastre para reordenar que dibuja Stitch se
reemplazó por flechas (decisión: sin librería de drag, y accesible); en A14,
todo lo que toca la sesión de verdad —vincular por QR o por código, reconectar,
desconectar y el mensaje de prueba— se probó con tests y contra el harness
local (donde el guard del lease rechaza abrir sockets y la pantalla lo muestra),
NO contra la línea de producción: es la del piloto y la comparten dos empresas,
y un envío real necesita el sí de José; el historial nace vacío (se registra
desde este deploy); en A16, un aviso real a un miembro del equipo (el fan-out
se probó con tests; nadie más que José tiene celular en el equipo hoy) y un
ingreso con rol ventas o solo lectura (no hay otro miembro: el gate de roles se
probó por test); en A18, el mensaje de prueba al grupo (es un envío real por
la línea del piloto) y un aviso real en el horario de descanso (se probó por
test); `escribirAlCliente` de punta a punta (envía por
WhatsApp: no se probó para no mandarle mensajes a nadie); PWA/instalable (F3
«done» lo pide); en A6, el efecto real de una pausa y de un perfil distinto
sobre una conversación de WhatsApp (se probó con tests y guardando/reanudando
desde la pantalla contra la base, no con un mensaje del piloto); A6 en
escritorio se miró en composición pero los clics se probaron en móvil (el
navegador de la herramienta no mapea bien los clics con 1440 emulado); la
barra superior en escritorio para Chats/Leads (A2 desktop la dibuja) queda
para cuando se revisen esas pantallas; en A13, un `.xls` viejo (solo se lee
`.xlsx`; el error lo dice) y el arrastrar-y-soltar con la mano (la subida se
probó por el selector de archivos), y una plantilla editada por alguien en
Excel de verdad (se probó la ida y vuelta sin tocar y los casos de
normalización por test); en P4–P6, el código de registro llegando de verdad
al WhatsApp (F2), el QR de un número nuevo hasta «conectado» (el harness no
tiene el lease de sockets: la pantalla muestra que no pudo preparar el código
y «Continuar» queda deshabilitado) y un registro entero contra producción (se
verificó que `/dali/registro` carga y que `POST /api/dali/registro` vacío
devuelve 400 sin crear nada); en S1–S4, el «Descargar
ahora» del modelo en producción (en el harness el modelo no estaba cargado), y
el aviso de «empresa suspendida» visto por un dueño de verdad (se probó el 403
con un token; la pantalla se vio solo por código). La consola sí se miró
contra producción (16/09, 12:00): S1 con las dos líneas conectadas y S4
«Operativo» con 7 desconexiones en la última hora (la línea del piloto se
cae y se reconecta sola varias veces por hora: «WhatsApp no respondió a
tiempo»), y el ida y vuelta consola ↔ empresa con la sesión real de José.

**Pendiente de F3:** Lighthouse móvil; PWA/instalable; un aviso de «WhatsApp desconectado» al dueño por
WhatsApp (A6 lo dibuja, ningún job lo emite hoy; el panel sí lo muestra, E1).
Todas las pantallas de Stitch (A1–A20, P1–P6, S1–S4, E1) están implementadas y
`https://dali.constroad.com` abre el panel (verificado 16/09: `/` → 302 → `/dali/`,
la landing sin sesión, `/api/dali/*` en el mismo origen).

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
