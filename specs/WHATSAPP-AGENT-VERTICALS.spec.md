# WHATSAPP-AGENT-VERTICALS — Bot conversacional IA multi-tenant (SaaS por verticales)

> **Estado:** F1 implementada (30/07/2026, ver §5); F2–F8 propuestas.
> **Producto:** bot de WhatsApp con IA que atiende clientes finales de negocios locales
> (vertical 1: restaurantes/pedidos; vertical 2: citas — barberías/dentistas/spas).
> Modelo comercial: setup S/300 + S/149/mes por negocio. Onboarding done-for-you.
> **Dónde vive este spec:** en `lila-app/specs/` porque el grueso del runtime
> (canal WhatsApp, agente, tools, cron) corre en lila-app. Lo de Portal (panel del
> dueño, F4/F5) se especifica acá y se referencia desde el repo de Portal.
> **Documentos relacionados:**
> - `specs/ideas-de-negocio/` (estudio de mercado, go-to-market, ideas descartadas)
> - `specs/architecture-as-is.md` (runtime WhatsApp/Baileys, quotas, cron, PDF)
> - `specs/SESSION-LEASE.spec.md` (lease prod/dev de sesiones)
> - `specs/VISION-OCR-SETUP.spec.md` (adapter de visión agnóstico que reusa F5)
> - `../Portal/specs/ARCHITECTURE-Portal.as-is.md` (multi-tenant, auth, shadcn público)
> - `../PLATFORM-CATALOG-BILLING.spec.md` (planes/uso; este producto lo consume)

## 0) Objetivo y alcance

Convertir lila-app (hoy solo canal de SALIDA: sender logueado que envía) en una
plataforma de agentes conversacionales ENTRANTES, multi-tenant, vendible a
negocios locales como suscripción. Portal aporta el panel del dueño, onboarding
y billing. Cada negocio cliente = una `Company` con `vertical` distinto de
asfalto, que conecta SU propio número de WhatsApp.

**No-goals (v1):** pagos dentro del chat, delivery tracking, multi-idioma,
marketing masivo saliente (riesgo de baneo y de spam; solo conversación 1:1
iniciada por el cliente final).

## 1) Principios

1. **Reuse-first.** No se duplica infraestructura: sesiones Baileys, RLS
   sender↔company, `quota-validator`/`usage_metrics`, cron jobs, storage
   multi-tenant, PDF con membrete y cola Telegram se usan tal cual.
2. **Cero impacto en el dominio asfalto.** Los modelos nuevos son colecciones
   nuevas. No se toca `Order`, `Dispatch`, ni flujos de ConstRoad. El gating es
   por `company.vertical` (`asphalt` default | `restaurant` | `appointments`).
3. **Canal detrás de un adapter.** Todo el runtime habla con una interfaz
   `WhatsAppChannel`; Baileys es la implementación v1 y Cloud API la
   contingencia (F8). Nada del agente conoce Baileys directamente.
4. **LLM detrás de un adapter.** Interfaz `LLMProvider` (chat + tool use).
   Implementación default: Anthropic Haiku 4.5 con prompt caching.
   Implementación alternativa: cualquier API OpenAI-compatible (DeepSeek).
   Selección por env global y override por plan/company.
5. **El bot nunca pisa al humano.** Handoff obligatorio (F3) antes de vender
   a un cliente real.
6. **Panel del dueño = shadcn mobile-first** (el dueño vive en su celular).

## 2) Arquitectura

### 2.1 Vista de despliegue

```
[Cliente final]──WhatsApp──▶ Meta ⇄ Baileys socket        [Dueño del negocio]
                                        │                        │
                              ┌─────────▼──────────┐   ┌────────▼─────────┐
                              │ lila-app (Mac mini │   │ Portal (Vercel)  │
                              │  → VPS en v2, §7)  │   │  /admin/bot/*    │
                              │  AgentRuntime      │   │  gated vertical  │
                              │  WhatsAppChannel   │◀──┤  proxy JWT:      │
                              │  LLMProvider       │   │  QR/estado sesión│
                              │  quota-validator   │   │  parse-menu (F5) │
                              │  cron resumen (F6) │   └────────┬─────────┘
                              └──┬──────┬──────┬───┘            │
                                 │      │      │                │
                        Anthropic│ Telegram    └───▶ MongoDB Atlas ◀────────┘
                        DeepSeek │ (alertas ops)     (constroad_db compartido)
```

- lila-app es el ÚNICO proceso que habla con WhatsApp y con el LLM.
- Portal es el ÚNICO que sirve UI al dueño; para estado de sesión/QR y
  parse de menú hace proxy JWT a lila-app (patrón existente).
- Ambos leen/escriben el mismo Atlas; las colecciones nuevas llevan
  `companyId` indexado (regla multitenant existente).

### 2.2 Componentes en lila-app — módulo nuevo `src/agent/`

```
src/agent/
├── channel/
│   ├── channel.types.ts            # interfaz WhatsAppChannel (§4.1)
│   ├── baileys.channel.ts          # v1: envuelve sessions.simple + listener
│   └── cloud-api.channel.ts        # F8: webhook + Graph API
├── llm/
│   ├── llm.types.ts                # interfaz LLMProvider (§4.2)
│   ├── anthropic.provider.ts       # Haiku 4.5 + prompt caching
│   └── openai-compat.provider.ts   # DeepSeek u otro endpoint compatible
├── runtime/
│   ├── inbound-router.ts           # gate: company, enabled, quota, pausa
│   ├── agent-runtime.ts            # loop de turnos + ejecución de tools
│   ├── system-prompt.builder.ts    # prompt determinista (cache-friendly)
│   ├── conversation.store.ts       # upsert conversation + append messages
│   ├── handoff.service.ts          # F3: fromMe → pausa
│   └── owner-commands.ts           # F3: !bot on/off, !pausa
├── tools/
│   ├── catalog.tool.ts             # get_catalog
│   ├── order.tool.ts               # create_order (draft → confirm)
│   ├── hours.tool.ts               # get_business_hours
│   └── escalate.tool.ts            # escalate_to_human
├── summary/
│   └── weekly-summary.job.ts       # F6: registrado en scheduler existente
└── api/
    └── agent.controller.ts         # /api/agent/* (parse-menu, ops internas)
```

**Punto de partida real:** el listener IA ya existe deshabilitado
(`lila-app/src/whatsapp/ai-agent/*`, early return en `message.listener.ts`,
flag `WHATSAPP_AI_ENABLED`, whitelist `WHATSAPP_AI_TEST_NUMBER`). F1 lo
reactiva y su lógica se muda a `src/agent/`; no se parte de cero.

### 2.3 Secuencia — mensaje entrante (F1/F2, camino feliz)

```
Cliente          Baileys       inbound-router      agent-runtime        LLM
  │ "hola quiero    │                │                   │               │
  │  un pollo"      │                │                   │               │
  ├────────────────▶│ message.upsert │                   │               │
  │                 ├───────────────▶│ 1 fromMe? grupo?  │               │
  │                 │                │   status? → skip  │               │
  │                 │                │ 2 sender→companyId│               │
  │                 │                │ 3 bot-config gate │               │
  │                 │                │   (enabled/pausa/ │               │
  │                 │                │    quota/horario) │               │
  │                 │                │ 4 rate-limit jid  │               │
  │                 │                │ 5 persist msg +   │               │
  │                 │                │   upsert convo    │               │
  │                 │                │ 6 debounce 4 s    │  (ráfagas se  │
  │                 │                │   por conversación│   agregan)    │
  │                 │                ├──────────────────▶│ system (cache)│
  │                 │                │                   │ + summary     │
  │                 │                │                   │ + últimos 15  │
  │                 │                │                   ├──────────────▶│
  │                 │                │                   │◀── toolCall ──┤
  │                 │                │                   │ get_catalog   │
  │                 │                │                   ├──────────────▶│
  │                 │                │                   │◀─── text ─────┤
  │                 │◀─ sendText (whatsapp-direct, cuenta quota) ────────┤
  │◀────────────────┤                │                   │ persist msg   │
  │                 │                │                   │ (bot + usage) │
```

Reglas del runtime:
- **Single-flight por conversación**: cola en memoria por `conversationId`;
  nunca dos turnos LLM en paralelo para el mismo cliente (respuestas en
  orden). Ráfagas de mensajes se agregan con debounce ~4 s.
- **Máx 5 iteraciones de tools** por turno; al exceder → respuesta de
  fallback + `escalate_to_human`.
- **Prompt caching**: `system-prompt.builder` emite bloques en orden
  estable (reglas → negocio → catálogo). Editar el catálogo invalida el
  cache (aceptable: cambia poco).
- **Idempotencia**: dedupe por `channelMessageId` (reintentos de Baileys/
  webhook no duplican turnos).
- **Resumen rodante**: al superar ~30 mensajes, el job comprime los turnos
  viejos en `conversation.summary` (costo por turno se mantiene plano).

### 2.4 Secuencia — handoff humano (F3)

```
Dueño (su app WhatsApp)      Baileys           handoff.service
  │ responde manualmente        │                     │
  │ al cliente X                │                     │
  ├────────────────────────────▶│ evento fromMe       │
  │                             ├────────────────────▶│ ¿jid X tiene convo
  │                             │                     │  activa? → sí
  │                             │                     │ pausedUntil = now+30m
  │                             │                     │ status = 'human'
  │                             │                     │ persist msg role=owner
  [mensajes del cliente X durante la pausa: se persisten, el bot NO responde]
  [vence pausedUntil]           │                     │ status = 'bot'
  [próximo mensaje del cliente] │                     │ → flujo normal 2.3
```

Comandos del dueño (mensajes `!` de su propio número, detectados en el
mismo evento fromMe): `!bot off|on` → `bot-config.enabled`; `!pausa` →
pausa solo esa conversación. Confirmación por WhatsApp al dueño.

### 2.5 Secuencia — resumen semanal (F6)

```
scheduler (cron existente, lunes 8am America/Lima, 1 job por company activa)
  → weekly-summary.job
      1. agrega bot-order de la semana (ventas, top items, horas pico)
      2. LLMProvider.chat (prompt de análisis, 1 llamada, sin tools)
      3. sendText al ownerNotifyTarget (vía whatsapp-direct → cuenta quota)
      4. registra en usage_metrics (tokens)
   fallo → cola Telegram existente (alerta a José, retry al día siguiente)
```

### 2.6 Portal — rutas y APIs (F4/F5)

```
Página (shadcn, AdminShadcnSurface)     API Portal (next-connect + Zod)
/admin/bot                              GET/PUT  /api/bot/config
  estado sesión + toggle + conexión     (proxy)  estado sesión → lila-app
/admin/bot/catalogo                     GET/POST /api/bot/catalog-items
  CRUD + disponibilidad + foto          PUT/DEL  /api/bot/catalog-items/:id
/admin/bot/pedidos                      GET      /api/bot/orders?date&status
  board por estado (polling 15 s)       PATCH    /api/bot/orders/:id/status
Onboarding (F5, dentro de catálogo)     POST     /api/bot/catalog-import
  foto carta → preview → confirmar        (sube foto → lila /api/agent/parse-menu
                                           → devuelve items propuestos)
```

- Gating: moduleKey `bot` en `MODULE_CATALOG_SEED` (pipeline existente:
  `MODULE_BY_ROUTE`, sidebar, `requireModule('bot')` en cada endpoint) +
  `company.vertical` decide navegación visible.
- Todos los endpoints filtran por company server-side (regla multitenant).
- lila-app expone `POST /api/agent/parse-menu` (JWT tenant): imagen →
  LLM visión → `[{ name, price, category, description? }]`. Portal nunca
  llama al LLM directamente.

## 3) Modelos de datos (Mongo compartido `constroad_db`)

### 3.1 ERD

```
company (existente) ──1:1── bot-config
   │                            │ channelProvider (F8)
   ├──1:N── catalog-item        │
   │            ▲               │
   │            │ items[] (snapshot name/price, ref opcional)
   ├──1:N── bot-order ──N:1── conversation ──1:N── conversation-message
   │                            │
   └── usage_metrics (existente) ◀── contadores nuevos:
       botConversations / llmTokensIn / llmTokensOut
```

Reglas: toda colección lleva `companyId` string indexado; validación Zod
en Portal y en lila-app (esquemas compartidos vía copia tipada, no package
nuevo). **No reusar `Order` de asfalto** (acoplado a m³/plantas/despachos).

### 3.2 `bot-config` — nace en F1 (1 doc por company)

```ts
{
  companyId: string;                    // UNIQUE
  vertical: 'restaurant' | 'appointments' | 'transport';
  enabled: boolean;                     // master switch (comando !bot)
  channelProvider: 'baileys' | 'cloud-api';          // F8; default 'baileys'
  cloudApi?: { phoneNumberId: string; wabaId: string };   // F8
  greeting: string;
  tone: 'cercano' | 'formal';
  businessHours: Array<{ day: 0|1|2|3|4|5|6;          // 0 = domingo
                         open: string; close: string }>; // 'HH:mm' America/Lima
  offHoursMessage?: string;             // fuera de horario: responde esto y no agenda
  handoffPauseMinutes: number;          // default 30
  llmProviderOverride?: 'anthropic' | 'openai-compat';
  ownerNotifyTarget?: string;           // jid personal o grupo del dueño
  createdAt: Date; updatedAt: Date;
}
// índices: { companyId: 1 } unique
```

### 3.3 `catalog-item` — nace en F2 (CRUD en F4, import en F5)

```ts
{
  companyId: string;
  name: string;                         // "1/4 de pollo a la brasa"
  normalizedName: string;               // lowercase sin tildes (búsqueda)
  description?: string;
  price: number;                        // PEN; el bot SOLO cita este valor
  currency: 'PEN';
  category: string;                     // "platos" | "bebidas" | ... (libre)
  aliases: string[];                    // "cuarto", "1/4" — matching NL
  available: boolean;                   // toggle rápido ("se acabó el cabrito")
  imageMediaPath?: string;              // storage multi-tenant existente
  sortOrder: number;
  createdAt: Date; updatedAt: Date;
}
// índices: { companyId: 1, available: 1 }, { companyId: 1, category: 1, sortOrder: 1 }
```

### 3.4 `conversation` — nace en F1

```ts
{
  companyId: string;
  customerJid: string;                  // Baileys jid
  customerPhone: string;                // E.164 — clave estable para F8 (Cloud
                                        // API no usa jid); derivado del jid
  customerName?: string;                // pushName o lo que dio en el chat
  status: 'bot' | 'human' | 'closed';
  pausedUntil?: Date;                   // F3: handoff
  summary?: string;                     // resumen IA rodante
  summaryUpToMessageId?: string;        // hasta dónde está comprimido
  lastMessageAt: Date;
  lastCustomerMessageAt: Date;          // F8: ventana de servicio 24 h
  messageCount: number;
  monthKey: string;                     // 'YYYY-MM' — conteo de quota (§3.7)
  createdAt: Date; updatedAt: Date;
}
// índices: { companyId: 1, customerJid: 1 } unique
//          { companyId: 1, lastMessageAt: -1 }   (bandeja/depuración)
```

### 3.5 `conversation-message` — nace en F1

```ts
{
  conversationId: string;
  companyId: string;                    // denormalizado (queries por company)
  role: 'customer' | 'bot' | 'owner' | 'system';
  text?: string;
  mediaPath?: string; mediaType?: 'image' | 'audio' | 'document';
  toolCalls?: Array<{ name: string; input: unknown;
                      resultSummary: string }>;   // trazabilidad del agente
  usage?: { inputTokens: number; outputTokens: number;
            cacheReadTokens?: number;
            provider: string; model: string };    // margen real por cliente
  channelMessageId?: string;            // dedupe de reintentos
  createdAt: Date;
}
// índices: { conversationId: 1, createdAt: 1 }
//          { companyId: 1, channelMessageId: 1 } unique sparse (idempotencia)
//          TTL: { createdAt: 1 } expireAfterSeconds = 90 días
//          (la conversación y sus bot-orders NO expiran; solo el detalle
//           de mensajes — el summary conserva el contexto)
```

### 3.6 `bot-order` — nace en F2 (board en F4)

```ts
{
  companyId: string;
  conversationId: string;
  code: string;                         // correlativo document-counter
                                        // (key 'bot-order' por company): "P-000123"
  items: Array<{
    catalogItemId?: string;             // ref viva (puede borrarse después)
    name: string; qty: number;          // SNAPSHOT al momento del pedido:
    unitPrice: number;                  // el precio histórico no cambia si
    notes?: string;                     // el catálogo se edita
  }>;
  total: number; currency: 'PEN';
  customerJid: string; customerPhone: string; customerName?: string;
  deliveryMode: 'pickup' | 'delivery';
  address?: string; reference?: string;
  status: 'nuevo' | 'confirmado' | 'en_preparacion' | 'entregado' | 'cancelado';
  statusHistory: Array<{ status: string; at: Date;
                         by: 'bot' | 'owner' | 'admin' }>;  // auditable
  paidVia?: 'yape' | 'plin' | 'efectivo' | 'otro'; paidAt?: Date;
  createdAt: Date; updatedAt: Date;
}
// índices: { companyId: 1, createdAt: -1 }
//          { companyId: 1, status: 1, createdAt: -1 }   (board por columnas)
//          { companyId: 1, code: 1 } unique
```

### 3.7 Uso y quotas — extiende lo existente en F6 (sin colección nueva)

- `usage_metrics` (existente, lila-app) suma tipos: `botConversations`,
  `llmTokensIn`, `llmTokensOut`.
- **Regla de conteo de conversación** (alineada al modelo Cloud API para
  que F8 no cambie el billing): cuenta 1 cuando se crea la conversación o
  cuando recibe mensaje tras > 24 h de inactividad, atribuida al
  `monthKey` vigente. `quota-validator` la incrementa en el paso 3 del
  router (§2.3) y bloquea suave al 100 % (mensaje "atención manual" +
  alerta a José; jamás cortar a mitad de pedido).

### 3.8 Qué nace en cada fase

| Fase | Colecciones / campos | Componentes (§2.2) |
|---|---|---|
| F1 | `bot-config` base, `conversation`, `conversation-message` | `channel/baileys`, `runtime/inbound-router`, `conversation.store` |
| F2 | `catalog-item`, `bot-order` (+`toolCalls`/`usage` en messages) | `llm/*` (ambos providers), `runtime/agent-runtime` + `system-prompt.builder`, `tools/*` |
| F3 | `conversation.pausedUntil/status='human'`, msgs `role='owner'` | `runtime/handoff.service`, `runtime/owner-commands` |
| F4 | — (solo lectura/escritura vía APIs Portal §2.6) | Portal `/admin/bot/*`, moduleKey `bot` |
| F5 | — (`catalog-item` en lote) | `api/agent.controller` (`parse-menu`), Portal `catalog-import` |
| F6 | contadores en `usage_metrics`, `conversation.monthKey` | `summary/weekly-summary.job`, quota gate en router |
| F7 | — | backups `data/sessions/`, watchdog por vertical |
| F8 | `bot-config.channelProvider/cloudApi`, uso de `customerPhone` | `channel/cloud-api`, webhook `/api/webhooks/whatsapp` |

## 4) Adapters (decisiones de diseño clave)

### 4.1 `WhatsAppChannel`

```ts
interface WhatsAppChannel {
  onInboundMessage(handler: (msg: InboundMessage) => Promise<void>): void;
  sendText(companyId: string, toJid: string, text: string): Promise<void>;
  sendMedia(companyId: string, toJid: string, media: MediaRef): Promise<void>;
  // detección de handoff: mensajes fromMe escritos por el dueño desde su app
  onOwnerMessage(handler: (msg: OwnerMessage) => Promise<void>): void;
}
```

- `BaileysChannel` (v1): envuelve `sessions.simple.ts` + listener. Reusa RLS
  sender↔company y el conteo único de mensajes en `whatsapp-direct.service`.
- `CloudApiChannel` (F8): webhook entrante + Graph API saliente. Mismo
  contrato; el AgentRuntime no cambia.
- `InboundMessage` normaliza ambos: `{ companyId, customerJid, text?,
  mediaType?, timestamp, raw }`.

### 4.2 `LLMProvider`

```ts
interface LLMProvider {
  chat(params: {
    system: string;            // prompt cacheable (negocio + catálogo + reglas)
    messages: ChatTurn[];      // ventana reciente + summary de conversation
    tools: ToolSpec[];
    maxTokens: number;
  }): Promise<{ text?: string; toolCalls?: ToolCall[]; usage: TokenUsage }>;
}
```

- **`AnthropicProvider` (default):** Haiku 4.5, prompt caching del bloque
  system (catálogo + reglas cambian poco → cache hit en cada turno).
- **`OpenAICompatProvider`:** apunta a DeepSeek (`deepseek-chat` / V4 Flash) o
  cualquier endpoint OpenAI-compatible via `LLM_BASE_URL` + `LLM_API_KEY` +
  `LLM_MODEL`. Function calling mapeado al mismo `ToolSpec`.
- **Selección:** env `LLM_PROVIDER=anthropic|openai-compat` global;
  `bot-config.llmProviderOverride` por company (permite A/B y planes con
  distinto costo).
- **Registro de uso:** `usage.tokensIn/Out` se guarda en
  `conversation-message` y se agrega a `usage_metrics` (nuevo tipo
  `llmTokens`) para conocer margen real por cliente.

**Costos de referencia (julio 2026, verificar al implementar):**

| Proveedor | Input /M | Output /M | Cache hit /M | Nota |
|---|---|---|---|---|
| Haiku 4.5 | $1.00 | $5.00 | $0.10 (read) | tool use muy confiable, latencia estable |
| DeepSeek V4 Flash | $0.14 | $0.28 | $0.0028 | 7–18x más barato; validar confiabilidad de function calling y latencia; datos procesados en China (evaluar sensibilidad: nombres/direcciones/teléfonos de clientes finales) |

Estimación por conversación de pedido (~10 turnos, system 2K cacheado,
~300 tokens out/turno): Haiku ≈ $0.01–0.02; DeepSeek ≈ $0.001–0.003.
A 1,000 conversaciones/mes por cliente: Haiku ≈ $10–20, DeepSeek ≈ $1–3.
Con precio S/149 (~$40), ambos dan margen; DeepSeek lo protege a escala.
**Decisión v1: lanzar con Haiku (confiabilidad del agente = churn), tener
`OpenAICompatProvider` implementado desde F2 y A/B con DeepSeek en F6 con
métricas reales (tasa de pedidos completados, escaladas a humano).**

## 5) Fases

### F1 — Runtime entrante multi-tenant (lila-app) — **IMPLEMENTADO 30/07/2026**

Hallazgo al implementar: `sessions.simple.ts` NO tenía ningún handler de
`messages.upsert` — el listener legacy (`src/whatsapp/ai-agent/*`) quedó
huérfano desde el refactor a sessions.simple (su flujo de acciones
client-report incluido). Por eso F1 NO reactivó ese listener: se cableó un
router NUEVO y el legacy sigue exactamente igual (desconectado).

Entregado (tests: 17 verdes en `src/agent/runtime/*.test.ts`):
- `src/agent/runtime/` — `inbound-router.ts` (puro, deps inyectadas),
  `agent.types.ts`, `jid-rate-limit.ts` (8 msg/min por jid),
  `message-text.ts` (wrappers ephemeral/viewOnce + captions),
  `conversation.store.ts` (Mongo), `agent-wiring.ts` (deps reales + handler).
- Modelos: `src/models/bot.model.ts` + getters `src/database/bot.models.ts`
  (colecciones `bot_configs`, `bot_conversations`,
  `bot_conversation_messages` — naming con guión bajo como `usage_metrics`).
- Wiring: `sock.ev.on('messages.upsert')` en `sessions.simple.ts`, solo
  eventos `notify` (history sync jamás responde).
- **Doble gate de seguridad:** env `WHATSAPP_AGENT_ENABLED` (default false —
  deploy inerte) + `bot_configs.enabled` por company + allowlist
  `testNumbers` (con/sin código de país). Grupos, broadcast y newsletters se
  ignoran siempre. Cache de contexto por sesión 60 s.
- Respuesta echo F1 con presencia `composing` + delay de tipeo humano
  (`calculateTypingDelay`, cap 4 s); quota vía
  `quotaValidatorService.incrementWhatsAppUsage`; envío con timeout explícito
  de 30 s (`sendWithAgentTimeout`, regla portal-scalability — el de
  whatsapp-direct es 120 s, demasiado para una respuesta de chat).
- Idempotencia por `channelMessageId` (índice unique sparse).

**Pendiente declarado (no verificable en local):** el E2E real con WhatsApp —
el socket de la sesión constroad vive en PROD (Mac mini); el send-proxy dev
solo cubre envíos salientes y el lease por sesión (SESSION-LEASE.spec) sigue
propuesto. El E2E se corre con el runbook §9 tras deploy.

### F2 — AgentRuntime con tool use + catálogo
- `LLMProvider` (4.2) con ambas implementaciones desde el inicio.
- Tools v1: `get_catalog`, `create_order` (borrador → confirmación explícita
  del cliente → persiste `bot-order`), `get_business_hours`,
  `escalate_to_human` (marca `conversation.status=human` + notifica dueño).
- System prompt por company: nombre, tono, catálogo con precios, reglas
  (nunca inventar precios/platos; si no está en catálogo → ofrecer
  alternativas; confirmar pedido ítem por ítem antes de crear).
- Notificación al dueño en cada `bot-order` nuevo: mensaje WhatsApp al
  `ownerNotifyTarget` con resumen + total (reusa envío existente).
- Contexto: últimos ~15 turnos + `conversation.summary` (resumen IA rodante
  para conversaciones largas; mantiene el costo plano).
- **Done:** pedido completo de prueba end-to-end (saludo → carta → pedido →
  confirmación → dueño notificado) con tokens registrados.

### F3 — Handoff humano (crítico pre-venta)
- Detección `fromMe` en el listener: si el dueño responde manualmente a un
  `customerJid` con conversación activa → `pausedUntil = now +
  handoffPauseMinutes`; el bot calla en esa conversación.
- Comandos del dueño por WhatsApp (mensajes que empiezan con `!`): `!bot off`
  / `!bot on` (global), `!pausa` (esa conversación). Sin abrir el panel.
- Reactivación automática al vencer `pausedUntil` con mensaje de
  re-entrada suave ("¿te ayudo con algo más?") solo si el cliente escribe.
- **Done:** el dueño interviene desde su teléfono y el bot no responde hasta
  vencer la pausa; comandos `!` funcionan.

### F4 — Panel del dueño (Portal, shadcn, mobile-first)
- Gating: `company.vertical` en el modelo `Company` + navegación admin que
  muestra SOLO el módulo bot para verticales nuevos (el shell admin shadcn ya
  existe; envolver en `AdminShadcnSurface`).
- Páginas: `/admin/bot` (estado + toggle + conexión WhatsApp reusa UI de
  `/admin/empresa`), `/admin/bot/catalogo` (CRUD + disponibilidad + foto),
  `/admin/bot/pedidos` (board nuevo/confirmado/en preparación/entregado,
  polling; realtime queda fuera de v1).
- Theme por company (acento = marca del negocio; regla canónica existente).
- **Done:** dueño gestiona catálogo y pedidos desde el celular en ambos modos
  dark/light.

### F5 — Onboarding foto→catálogo + alta de cliente (la demo de venta)
- Upload de foto de la carta física (kit `media/*` + cámara shadcn
  compartida) → LLM con visión estructura `[{name, price, category,
  description}]` → preview editable → persistir `catalog-item[]`.
- **Reusar el adapter de visión ya existente** (`vision-ocr.service.ts`,
  agnóstico gemini/anthropic/openai-compatible, 12 tests — ver
  `specs/VISION-OCR-SETUP.spec.md`): mismo patrón provider+key+model
  por env, techos de costo (imágenes/día, 4 MB, timeout). OJO: DeepSeek es
  solo-texto en 2026 — la visión del onboarding NO puede ir por DeepSeek;
  Gemini Flash-Lite (~$0.0002/imagen) o Claude.
- Flujo de alta (interno, lo opera José): crear Company con vertical + plan →
  conectar número (QR/pairing existente) → cargar carta → bot vivo.
  Meta: < 30 min por cliente.
- Script de demo pre-venta: company "demo" + carta del prospecto cargada
  antes de la visita; el prospecto escribe al número demo y ve SU menú.
- **Done:** alta completa de un negocio real en < 30 min.

### F6 — Resumen semanal IA + quotas por plan
- Cron job (infra existente) por company: agrega `bot-order` de la semana →
  LLM genera resumen accionable (ventas, top items, horas pico, 1
  recomendación) → WhatsApp al dueño. Es el gancho de retención del producto.
- Quotas: nuevo contador `botConversationsThisMonth` en `usage_metrics`
  vía `quota-validator`; al 100% del plan el bot responde con mensaje de
  "atención manual" y alerta a José (nunca cortar en seco a mitad de pedido).
- A/B de `LLMProvider` por company con métricas: tasa de pedido completado,
  escaladas, costo/conversación → decidir DeepSeek como default de plan base.
- **Done:** resumen semanal llegando + tablero interno de margen por cliente.

### F7 — Hardening operativo
- Ver §7 (infra). Backups automáticos de `data/sessions/` (creds Baileys) +
  restore probado. Watchdog existente extendido: alerta si una sesión de
  company con `vertical!=asphalt` está desconectada > 5 min en horario del
  negocio (para restaurantes, un bot caído en hora de almuerzo = churn).
- Runbook de incidentes: qué hacer si Meta desloguea una sesión (re-QR con
  el cliente por videollamada corta).
- **Done:** caída simulada detectada y notificada < 5 min; restore de sesión
  probado.

### F8 — CONTINGENCIA: migración a WhatsApp Cloud API (oficial)

Disparadores para ejecutar esta fase (cualquiera):
- Baneos de números de clientes atribuibles al uso de Baileys (≥2 casos).
- Cambio de protocolo de WhatsApp que rompa Baileys sin fix upstream en días.
- Cliente enterprise que exija canal oficial.

Pasos (por company, migración gradual — no big bang):

1. **Prerequisitos Meta (una vez, lado José):** Meta Business Manager
   verificado + app en Meta for Developers con producto WhatsApp + WABA
   (WhatsApp Business Account). Token permanente de sistema (System User).
2. **Webhook en lila-app (una vez):** `POST /api/webhooks/whatsapp` público
   HTTPS (el funnel Tailscale existente sirve; evaluar mover a VPS §7),
   verificación del `hub.challenge`, validación de firma `X-Hub-Signature`.
   Un solo webhook para todas las companies; el payload trae
   `phone_number_id` → mapear a `companyId`.
3. **`CloudApiChannel`:** implementar la interfaz 4.1 con Graph API
   (`/messages` para texto/media, media upload/download por `media_id`).
   El AgentRuntime NO cambia (ese es el punto del adapter).
4. **Modelo:** `bot-config.channelProvider: 'baileys' | 'cloud-api'` +
   `cloudApi: { phoneNumberId, wabaId }`. El router de F1 despacha según
   provider. Mapear `customerJid` ↔ número E.164 (Cloud API no usa jid).
5. **Número del cliente — decisión con el dueño (comunicar SIEMPRE antes):**
   - Opción A (recomendada): número NUEVO dedicado al bot (chip prepago);
     el dueño conserva su número personal en su app. Cero fricción.
   - Opción B: migrar su número actual a la API. ADVERTENCIA: el número queda
     atado a la plataforma API; deja de funcionar en la app WhatsApp normal
     (el dueño pierde su historial en el teléfono para ese número). Solo si
     el número es "de marca" y el dueño acepta el tradeoff.
6. **Ventana 24h y plantillas:** los mensajes de RESPUESTA dentro de la
   ventana de servicio de 24h (que abre cada mensaje del cliente final) son
   GRATIS — y este bot es ~100% eso. Solo se necesitan plantillas (template
   messages, categoría `utility`, aprobación de Meta) para iniciar contacto
   fuera de ventana: v1 solo `pedido_listo` y `resumen_semanal` (el resumen
   al dueño puede seguir saliendo por el sender Baileys de ConstRoad o
   Telegram si se quiere evitar plantillas al inicio).
7. **Corte por company:** conectar Cloud API en paralelo → smoke test con
   número de prueba → flip `channelProvider` → observar 48h → apagar sesión
   Baileys de esa company. Rollback = flip inverso (mantener ambas rutas
   vivas durante la transición).
8. **Costos post-migración:** conversaciones de servicio $0; plantillas
   utility Perú ~céntimos por envío. El costo real de F8 es el trabajo de
   verificación Meta + plantillas, no el tráfico.

**Regla de oro asociada (vigente desde F1):** el producto NO hace outbound
masivo/marketing por Baileys. Eso minimiza el riesgo de baneo (patrón de uso
indistinguible de un humano respondiendo) y hace que F8 quizá nunca se
necesite.

## 6) Riesgos

| Riesgo | Mitigación |
|---|---|
| Baneo de número (Baileys, no oficial) | Cada cliente usa SU número (riesgo distribuido, bajo volumen, solo conversación entrante); F8 lista; no prometer inmunidad al vender |
| Bot caído en hora pico | F7: watchdog por vertical + horario del negocio; runbook re-QR |
| LLM alucina precios/platos | Tools obligatorias (el bot solo cita catálogo), confirmación explícita pre-orden, temperatura baja |
| Costo LLM se come el margen | Registro tokens por conversación desde F2; prompt caching; A/B DeepSeek en F6 |
| El bot molesta al dueño (pisa conversaciones) | F3 antes de cualquier venta real |
| Crecimiento de `conversation-message` | TTL/archivado 90 días |
| Un solo operador (José) | Onboarding < 30 min, comandos `!` para autoservicio del dueño, alertas centralizadas Telegram |

## 7) Infraestructura (Mac mini → qué hacer de verdad)

El cuello NO es cómputo: Baileys + el agente corren en 2 GB de RAM. El
riesgo real de la Mac mini es **disponibilidad**: un solo punto de falla de
luz, ISP y Tailscale para bots de clientes que pagan.

- **v1 (0–10 clientes):** seguir en la Mac mini + UPS + (ideal) failover de
  internet 4G. Costo mínimo, suficiente para validar ventas.
- **v2 (10+ clientes o primer cliente exigente):** mover el runtime de bots
  a un VPS chico (2–4 GB, ~S/25–50/mes: Hetzner/Contabo/DO), con PM2 +
  backups de `data/sessions/`. La Mac mini conserva las cargas pesadas de
  ConstRoad (Puppeteer/FFmpeg/storage). El Mongo ya es Atlas (compartido),
  así que el runtime es portable.
- **Comprar Mac Studio / mini Pro: NO para esto.** Más CPU no arregla
  uptime; esa plata rinde más en UPS + internet de respaldo + VPS + caja
  para los primeros meses de operación. Reevaluar hardware solo si la carga
  local de PDF/video de ConstRoad lo pide por sí misma.

## 8) Orden de ejecución y criterio comercial

F1→F2→F3 = bot vendible en demo (~2 semanas). F5 (onboarding/demo) puede
adelantarse en paralelo a F4 porque es la herramienta de VENTA. No firmar
clientes reales antes de F3 (handoff). F6 es la retención; F7 antes del
cliente #5; F8 solo por disparadores.

## 9) Piloto F1 con número único (runbook E2E)

**Bot = sender de constroad `51949376824`. Cliente QA = José `51902049935`.**
El bot corre donde corre el socket: PROD (Mac mini). En dev el send-proxy
(`WHATSAPP_PROXY_TARGET_URL`) solo reenvía SALIENTES a prod y los entrantes
nunca llegan a la máquina local (lease por sesión: no implementado;
alternativa `WHATSAPP_LOCAL_SESSIONS` requiere un segundo número que no hay).

1. José commitea; la Mac mini buildea lila desde git HEAD (deploy normal).
2. En el `.env` de PROD: `WHATSAPP_AGENT_ENABLED=true` + **reiniciar el
   proceso** (mismo gotcha que `CRON_SECRET`/`VISION_API_KEY`: el env se lee
   al arrancar).
3. Seed del piloto (mongosh contra `constroad_db`):
   ```js
   db.bot_configs.insertOne({
     companyId: '<ObjectId de constroad como string>',
     vertical: 'restaurant', enabled: true, channelProvider: 'baileys',
     greeting: 'Hola', testNumbers: ['51902049935'],
     handoffPauseMinutes: 30, createdAt: new Date(), updatedAt: new Date(),
   })
   ```
4. José escribe "hola quiero un cuarto de pollo" desde su número al
   `949376824` → espera: presencia "escribiendo…", respuesta echo con
   saludo + cita del mensaje, y en Mongo 1 doc en `bot_conversations` +
   2 en `bot_conversation_messages` (customer + bot).
5. Verificar aislamiento: otro número escribiendo al sender NO recibe
   respuesta (allowlist) y los grupos/alertas de dispatch siguen intactos.
6. Apagado rápido: `enabled:false` en `bot_configs` (tarda ≤60 s por el
   cache de contexto) o `WHATSAPP_AGENT_ENABLED=false` + restart (inmediato).

Resultado del E2E → documentarlo en esta sección (tabla paso → resultado).

## 10) Dolores reales de chatbots y diseño de humanización

Qué reporta la comunidad/industria que FALLA (fuentes: análisis de fallas
2025-2026, guías UX conversacional, papers de typing behavior arXiv
2507.22352 y 2510.08912) y cómo este producto lo neutraliza:

| Dolor reportado | Dónde lo matamos |
|---|---|
| Muros de menús rígidos ("marca 1, marca 2") que hacen abandonar | Agente LLM conversacional sin menús (F2); el cliente escribe como a un humano |
| No entiende y REPITE el mismo mensaje en loop | Tras 2 fallos de comprensión consecutivos → `escalate_to_human` + aviso al dueño (F2/F3); jamás repetir la misma respuesta dos veces |
| No hay salida a humano ("speak to agent" ignorado) | Handoff F3: el dueño responde y el bot calla; pedir "hablar con alguien" escala siempre |
| Inventa precios/datos (bots cotizando precios falsos = reclamos) | El bot SOLO cita catálogo vía tools; sin match → ofrece alternativas; confirmación ítem por ítem antes de crear pedido |
| Respuesta instantánea = se siente robot (los estudios: delay corto > cero delay y > delay largo) | Presencia `composing` + `calculateTypingDelay` cap 4 s (F1 ya lo hace); pausas no uniformes |
| Wall of text (párrafos largos) | Estilo F2: respuestas ≤3 líneas; si hay que listar el menú, burbujas separadas con pausas entre envíos |
| Amnesia (repreguntar lo ya dicho) | Persistencia F1 + summary rodante F2: el bot recuerda pedido, nombre y dirección dentro de la conversación |
| Data desactualizada (horarios/platos que ya no existen) | Catálogo vivo en DB con toggle `available` (el dueño lo apaga en 5 s desde el panel F4) |
| Tono corporativo acartonado | El prompt legacy de "María" (asphalt-sales.prompt) ya fija el estándar: cálido, peruano, sin muletillas repetidas; se replica por vertical con `tone` |
| Fingir ser humano (rompe confianza al descubrirse) | Regla de prompt: si preguntan, admite ser asistente virtual del negocio, sin drama y sigue ayudando |
| Responder a las 3 am como si nada | `businessHours` + `offHoursMessage` (F2): fuera de horario dice cuándo abren y toma el pedido para mañana |
