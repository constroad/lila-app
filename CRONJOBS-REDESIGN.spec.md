# Especificación de Rediseño - Sistema de CronJobs Multi-tenant

**Proyecto:** Lila-App & Portal (CONSTROAD)
**Versión:** 2.0.0
**Fecha:** 2026-02-03
**Autor:** Sistema de Análisis Técnico

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis del Estado Actual](#análisis-del-estado-actual)
3. [Requisitos del Rediseño](#requisitos-del-rediseño)
4. [Arquitectura Propuesta](#arquitectura-propuesta)
5. [Modelo de Datos Nuevo](#modelo-de-datos-nuevo)
6. [Cambios en Backend (lila-app)](#cambios-en-backend-lila-app)
7. [Cambios en Frontend (Portal)](#cambios-en-frontend-portal)
8. [Diseño UI/UX Premium](#diseño-uiux-premium)
9. [Plan de Migración](#plan-de-migración)
10. [Fases de Implementación](#fases-de-implementación)
11. [Casos de Uso](#casos-de-uso)
12. [Consideraciones Técnicas](#consideraciones-técnicas)
13. [Testing y Validación](#testing-y-validación)
14. [Apéndices](#apéndices)

---

## 1. Resumen Ejecutivo

### 🎯 Objetivo Principal

Transformar el sistema de cronjobs de un modelo hardcoded limitado a 2 empresas, hacia un sistema **multi-tenant escalable** que permita:

- ✅ Cualquier empresa (`companyId` de `shared_db`) pueda gestionar sus propios cronjobs
- ✅ Selección dinámica de grupos de WhatsApp desde la configuración del sender
- ✅ Validación de configuración de sender antes de crear cronjobs
- ✅ UI/UX moderna y premium para gestión de cronjobs
- ✅ Preparación para funcionalidades futuras (menciones, templates, etc.)

### 📊 Impacto Esperado

| Métrica | Actual | Propuesto | Mejora |
|---------|--------|-----------|--------|
| Empresas Soportadas | 2 (hardcoded) | Ilimitadas | ∞ |
| Selección de Grupos | Hardcoded en código | Dinámica desde UI | 100% |
| Almacenamiento | JSON file | MongoDB (shared_db) | Escalable |
| Validación de Sender | No | Sí (pre-creación) | Nueva feature |
| UI Quality | Básica | Premium/Moderna | +200% |
| Menciones | No | Preparado | Próximamente |

---

## 2. Análisis del Estado Actual

### 🔍 Arquitectura Existente

#### **Backend (lila-app)**

```
┌─────────────────────────────────────────────────────────────┐
│                        LILA-APP                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  JobScheduler (scheduler.service.ts)                 │  │
│  │  - Almacena en: data/cronjobs.json                   │  │
│  │  - Usa: node-cron                                    │  │
│  │  - Filtra por: company ('constroad' | 'altavia')    │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ConnectionManager (baileys)                         │  │
│  │  - sendTextMessage(sender, chatId, body)             │  │
│  │  - sender: hardcoded en cada cronjob                 │  │
│  │  - chatId: hardcoded en cada cronjob                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### **Frontend (Portal)**

```
┌─────────────────────────────────────────────────────────────┐
│                         PORTAL                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  /admin/cron-jobs                                           │
│  ├─ CronList.tsx                                            │
│  │  - Tabla básica                                          │
│  │  - Filtro manual por empresa                            │
│  │                                                          │
│  └─ CronBuilder.tsx                                         │
│     - Dropdown empresa: 2 opciones hardcoded               │
│     - Dropdown grupos: desde useWhatsapp()                 │
│     - Constructor de cron visual                            │
│                                                              │
│  Company Model (shared_db)                                  │
│  └─ whatsappConfig: { sender, adminGroupId }              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 📄 Modelo actual (data/cronjobs.json)

**Schema real observado (2026-02-03):**

```json
{
  "id": "uuid",
  "name": "string",
  "url": "string",
  "cronExpression": "string",
  "company": "constroad" | "altavia",
  "type": "message" | "api",
  "isActive": true,
  "message": {
    "sender": "string",
    "chatId": "string",
    "body": "string"
  },
  "lastExecution": "ISO",
  "status": "success" | "error",
  "history": [
    { "status": "success" | "error", "timestamp": "ISO", "error": "string?" }
  ],
  "metadata": {
    "createdAt": "ISO",
    "updatedAt": "ISO",
    "failureCount": 0,
    "lastRun": "ISO?"
  },
  "retryPolicy": { "maxRetries": 3, "backoffMultiplier": 2 },
  "timeout": 30000
}
```

**Notas clave:**
- `type` no siempre existe; se infiere por presencia de `message` o `url`.
- `url` está presente en jobs API y suele ser `""` en jobs message.
- `message.sender` existe hoy, pero el rediseño debe resolver el sender desde `Company.whatsappConfig.sender`.
- `metadata.lastRun` aparece en algunos jobs, mientras `lastExecution` está a nivel raíz.
- `id` es UUID string; se preservará en `metadata.legacyId` para trazabilidad.

### ⚠️ Problemas Identificados

#### **Críticos (P0)**

1. **Hardcoded Companies**
   - Ubicaciones:
     - `lila-app/src/types/index.ts:78` → `company: 'constroad' | 'altavia'`
     - `Portal/src/models/cronJob.ts:5-7` → `enum CronCompany`
   - **Impacto:** Imposible agregar nuevas empresas sin cambio de código

2. **Almacenamiento No Escalable**
   - `data/cronjobs.json` (file storage)
   - Sin backup automático centralizado
   - No tiene `companyId` real, solo enum string

3. **Duplicación de Sender**
   - Sender configurado en: `Company.whatsappConfig.sender`
   - Sender duplicado en: `CronJob.message.sender` (cada job)
   - **Problema:** Si sender cambia en Company, cronjobs quedan desactualizados

4. **Sin Validación de Configuración**
   - Se puede crear cronjob sin verificar si sender existe/está activo
   - No hay feedback si sender no configurado

#### **Moderados (P1)**

5. **Grupos Hardcoded en Jobs Existentes**
   - `GROUP_PLANT_CONSTROAD` en varios cronjobs de Portal
   - Ubicación: `Portal/src/pages/api/cron/employee-daily-alert.ts:56`

6. **Sin Control Multi-tenant**
   - Cronjobs de todas las empresas visibles por todos
   - No hay RBAC (role-based access control)

7. **UI Básica**
   - Diseño funcional pero no premium
   - Sin animaciones, feedback visual limitado
   - No responsive optimizado

---

## 3. Requisitos del Rediseño

### 📝 Requisitos Funcionales

#### **RF-001: Almacenamiento en MongoDB**
- Los cronjobs deben almacenarse en MongoDB (`shared_db`) con `companyId` real
- Reemplazar `data/cronjobs.json` por `CronJob` collection

#### **RF-002: Selección Dinámica de Company**
- Al crear cronjob, dropdown con todas las companies activas de `shared_db`
- No más enum hardcoded

#### **RF-003: Selección Dinámica de Grupo WhatsApp**
- Para tipo "message": dropdown de grupos obtenidos desde el sender configurado
- Para tipo "api": no aplica (pero preparar para futuro)

#### **RF-004: Validación Pre-Creación**
- Si company no tiene sender configurado: mostrar mensaje de error
- Mensaje: "No hay sender de WhatsApp configurado para esta empresa. Configure uno antes de crear cronjobs."
- Botón "Crear Cronjob" debe estar deshabilitado

#### **RF-005: Rediseño UI Premium**
- Listado de cronjobs: tabla moderna con cards, estados visuales, animaciones
- Formulario: wizard steps, validación en tiempo real, preview
- Tema: consistente con Portal (Chakra UI)

#### **RF-006: Preparación para Menciones**
- Modelo debe incluir campo `mentions` (array de phone numbers)
- UI debe tener sección colapsada "Menciones (Próximamente)"
- No implementar lógica de envío aún

#### **RF-007: Ajuste para Tipo API**
- Cuando tipo = "api", mantener campo URL
- No mostrar selector de grupo
- (Futuro: permitir notificar a grupo después de API call)

#### **RF-008: Compatibilidad con Modelo JSON Actual**
- El rediseño debe mapear sin pérdida los campos actuales (`id`, `company`, `cronExpression`, `url`, `timeout`, `metadata.*`, `history`)
- Aceptar `type` faltante durante migración e inferirlo por `message` o `url`
- Mantener trazabilidad mínima con `metadata.legacyId` y `metadata.legacyCompany`
- Mantener compatibilidad temporal con `message.sender` (legacy) para auditoría (no usar en envío)

### 🎨 Requisitos No Funcionales

#### **RNF-001: Performance**
- Cargar listado de cronjobs < 500ms
- Obtener grupos de WhatsApp < 1s
- Sin re-renders innecesarios en formulario

#### **RNF-002: Escalabilidad**
- Soportar 1000+ empresas
- Soportar 10,000+ cronjobs activos
- Queries con índices optimizados

#### **RNF-003: Seguridad**
- Solo usuarios con rol `admin` o `super-admin` pueden gestionar cronjobs
- Cada company solo ve sus propios cronjobs (excepto super-admin)
- Validación de ownership en APIs

#### **RNF-004: Compatibilidad**
- Migración sin pérdida de datos existentes
- APIs backward compatible durante transición
- UI responsive (mobile, tablet, desktop)

---

## 4. Arquitectura Propuesta

### 🏗️ Nueva Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                            SHARED_DB (MongoDB)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  companies Collection                                       │   │
│  │  ├─ companyId: 'const-001'                                 │   │
│  │  ├─ name: 'CONSTROAD'                                      │   │
│  │  ├─ whatsappConfig: {                                      │   │
│  │  │    sender: '51902049935',                               │   │
│  │  │    adminGroupId: '120363288945205546@g.us'              │   │
│  │  │  }                                                       │   │
│  │  └─ subscription.usage.cronJobs: 5                         │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              ↓ references                           │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  cronjobs Collection (NEW)                                 │   │
│  │  ├─ _id: ObjectId                                          │   │
│  │  ├─ companyId: 'const-001'  ← REAL REFERENCE              │   │
│  │  ├─ name: 'Daily Alert'                                    │   │
│  │  ├─ type: 'message' | 'api'                                │   │
│  │  ├─ isActive: true                                         │   │
│  │  ├─ message: {                                             │   │
│  │  │    chatId: '120363288945205546@g.us',  ← DYNAMIC        │   │
│  │  │    body: 'Mensaje...',                                  │   │
│  │  │    mentions: ['51987654321']  ← NEW (for future)        │   │
│  │  │  }                                                       │   │
│  │  ├─ apiConfig: { url, method, headers }  ← For type=api   │   │
│  │  ├─ schedule: { cronExpression, timezone, nextRun, lastRun }│  │
│  │  ├─ retryPolicy: { maxRetries, backoff }                   │   │
│  │  ├─ metadata: { createdBy, updatedBy, createdAt }          │   │
│  │  └─ history: [{ status, timestamp, error }]  ← Keep last 50│   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                               ↓ consumed by
┌─────────────────────────────────────────────────────────────────────┐
│                           LILA-APP (Backend)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  JobScheduler v2 (NEW)                                      │   │
│  │  - Reads from: MongoDB cronjobs collection                  │   │
│  │  - Filters by: companyId (real)                             │   │
│  │  - Resolves sender: from Company.whatsappConfig             │   │
│  │  - Syncs: on startup + on CRUD operations                   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  ConnectionManager (unchanged)                              │   │
│  │  - sendTextMessage(sender, chatId, body, mentions?)        │   │
│  │  - sender: resolved from Company at execution time          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                               ↓ API
┌─────────────────────────────────────────────────────────────────────┐
│                           PORTAL (Frontend)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  /admin/cron-jobs                                                   │
│  ├─ CronJobList.tsx (NEW - Premium Design)                         │
│  │  - Cards layout con estados visuales                            │
│  │  - Filtros avanzados (company, tipo, estado)                    │
│  │  - Animaciones y transiciones                                   │
│  │                                                                  │
│  └─ CronJobWizard.tsx (NEW - Multi-step)                           │
│     ├─ Step 1: Seleccionar Company (dynamic dropdown)              │
│     │  - Validar sender configurado                                │
│     │  - Mostrar estado de configuración                           │
│     ├─ Step 2: Tipo y Configuración                                │
│     │  - Si message: selector de grupo (dynamic desde sender)      │
│     │  - Si api: campo URL + método                                │
│     ├─ Step 3: Schedule (visual cron builder)                      │
│     ├─ Step 4: Menciones (preparado, disabled)                     │
│     └─ Step 5: Preview y Confirmación                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 🔄 Flujo de Datos Nuevo

#### **Creación de CronJob**

```
PORTAL UI
  ↓
1. Usuario navega a /admin/cron-jobs
  ↓
2. Click "Nuevo CronJob"
  ↓
3. STEP 1: Seleccionar Company
   - GET /api/companies (activas)
   - Usuario selecciona company
   - Validar: GET /api/companies/{companyId}/notifications
   - Si sender no configurado:
     → Mostrar warning
     → Deshabilitar "Siguiente"
     → Botón "Ir a Configuración"
   ↓
4. STEP 2: Tipo y Configuración
   - Radio: API / Mensaje
   - Si Mensaje:
     → GET /api/whatsapp/v2/groups?sender={companyWhatsappSender}
     → Dropdown de grupos (id, name, participants)
     → TextArea mensaje con preview
   - Si API:
     → Input URL
     → Dropdown método (GET, POST)
     → (Futuro: selector de grupo para notificación post-API)
   ↓
5. STEP 3: Schedule
   - Visual cron builder
   - Preview human-readable
   - Validación expresión cron
   ↓
6. STEP 4: Menciones (preparado)
   - Sección colapsada
   - Texto: "Próximamente: mencionar usuarios específicos"
   - Input deshabilitado con placeholder
   ↓
7. STEP 5: Preview
   - Card con resumen completo
   - Botón "Probar Ahora" (opcional)
   - Botón "Crear y Activar"
   ↓
8. Submit: POST /api/jobs
   Body: {
     companyId: 'const-001',  ← REAL ID
     type: 'message',
     name: 'Daily Alert',
     schedule: {
       cronExpression: '0 10 * * *',
       timezone: 'America/Lima'
     },
     message: {
       chatId: '120363288945205546@g.us',
       body: 'Mensaje...',
       mentions: []  ← Vacío por ahora
     },
     isActive: true
   }
   ↓
LILA-APP API
9. POST /api/jobs
   - Valida companyId existe en shared_db
   - Valida company tiene sender configurado
   - Valida chatId es válido (formato @g.us)
   - Valida cronExpression
   - Valida límite de cronjobs (subscription.limits.cronJobs)
   ↓
10. Guardar en MongoDB shared_db.cronjobs
   ↓
11. jobScheduler.syncFromDatabase()
   - Re-carga todos los jobs activos
   - Programa con node-cron
   ↓
12. Respuesta exitosa
   → Portal muestra mensaje de éxito
   → Redirect a listado
   → Cronjob aparece en tabla
```

#### **Ejecución de CronJob**

```
node-cron trigger (basado en schedule.cronExpression)
  ↓
1. JobScheduler.executeJob(jobId)
   ↓
2. Obtener cronjob desde MongoDB
   ↓
3. Obtener Company desde shared_db por companyId
   ↓
4. Resolver sender: Company.whatsappConfig.sender
   - Si no existe: marcar error, no ejecutar
   ↓
5. Validar sender tiene sesión activa
   - connectionManager.hasActiveSession(sender)
   - Si no: marcar error, intentar reconectar
   ↓
6. Si type = 'message':
   - connectionManager.sendTextMessage(
       sender: resolvedSender,
       recipient: cronjob.message.chatId,
       text: cronjob.message.body,
       mentions: cronjob.message.mentions  ← Preparado
     )
   ↓
7. Si type = 'api':
   - axios.request({
       url: cronjob.apiConfig.url,
       method: cronjob.apiConfig.method
     })
   ↓
8. Actualizar historial en MongoDB
   - Agregar entrada a history array
   - Actualizar lastExecution y schedule.lastRun
   - Si error: incrementar failureCount (mapeado desde metadata.failureCount legacy)
   ↓
9. Aplicar retryPolicy si fallo
   - maxRetries con backoff exponencial
```

---

## 5. Modelo de Datos Nuevo

### 📦 Schema: CronJob (MongoDB - shared_db)

```typescript
// Location: lila-app/src/models/cronjob.model.ts (NEW FILE)

import mongoose, { Schema, Document } from 'mongoose';

export interface ICronJobMessage {
  sender?: string;                  // LEGACY: viene de cronjobs.json (no usar para envío)
  chatId: string;                    // ID del grupo WhatsApp (ej: 120363288945205546@g.us)
  body: string;                      // Cuerpo del mensaje
  mentions?: string[];               // Array de números para mencionar (ej: ['51987654321'])
}

export interface ICronJobApiConfig {
  url: string;                       // URL del endpoint
  method: 'GET' | 'POST' | 'PUT';   // Método HTTP
  headers?: Record<string, string>;  // Headers custom (ej: Authorization)
  body?: any;                        // Body para POST/PUT
}

export interface ICronJobSchedule {
  cronExpression: string;            // Expresión cron (5 partes)
  timezone?: string;                 // Timezone (default: America/Lima)
  nextRun?: Date;                    // Próxima ejecución calculada
  lastRun?: Date;                    // Última ejecución
}

export interface ICronJobRetryPolicy {
  maxRetries: number;                // Máximo de reintentos (default: 3)
  backoffMultiplier: number;         // Multiplicador de backoff (default: 2)
  currentRetries?: number;           // Reintentos actuales (reset on success)
}

export interface ICronJobHistoryEntry {
  status: 'success' | 'error';       // Estado de la ejecución
  timestamp: Date;                   // Cuándo se ejecutó
  duration?: number;                 // Duración en ms
  error?: string;                    // Mensaje de error si falló
  metadata?: any;                    // Metadata adicional (response, etc.)
}

export interface ICronJobMetadata {
  createdBy?: string;                // Usuario que creó (email/userId)
  updatedBy?: string;                // Usuario que actualizó
  createdAt: Date;                   // Fecha de creación
  updatedAt: Date;                   // Fecha de actualización
  tags?: string[];                   // Tags para categorizar (ej: ['alertas', 'reportes'])
  legacyId?: string;                 // UUID original de cronjobs.json
  legacyCompany?: string;            // Company legacy (constroad/altavia)
}

export interface ICronJob extends Document {
  companyId: string;                 // ← KEY: Reference a companies.companyId (shared_db)
  name: string;                      // Nombre descriptivo del job
  type: 'api' | 'message';          // Tipo de job
  isActive: boolean;                 // Si está activo o pausado
  timeout?: number;                  // Timeout en ms (default: 30000)

  // Configuration (based on type)
  message?: ICronJobMessage;         // Si type = 'message'
  apiConfig?: ICronJobApiConfig;     // Si type = 'api'

  // Scheduling
  schedule: ICronJobSchedule;        // Configuración de schedule

  // Retry & Error Handling
  retryPolicy: ICronJobRetryPolicy;  // Política de reintentos

  // Execution State
  status?: 'idle' | 'running' | 'success' | 'error';  // Estado actual
  lastExecution?: Date;              // Última ejecución
  failureCount: number;              // Contador de fallos consecutivos
  lastError?: string;                // Último error

  // History
  history: ICronJobHistoryEntry[];   // Últimas N ejecuciones (limit: 50)

  // Metadata
  metadata: ICronJobMetadata;        // Información de auditoría
}

const CronJobMessageSchema = new Schema<ICronJobMessage>({
  sender: { type: String },          // LEGACY: mantener para compatibilidad
  chatId: { type: String, required: true },
  body: { type: String, required: true },
  mentions: [{ type: String }]
}, { _id: false });

const CronJobApiConfigSchema = new Schema<ICronJobApiConfig>({
  url: { type: String, required: true },
  method: { type: String, enum: ['GET', 'POST', 'PUT'], default: 'GET' },
  headers: { type: Map, of: String },
  body: Schema.Types.Mixed
}, { _id: false });

const CronJobScheduleSchema = new Schema<ICronJobSchedule>({
  cronExpression: { type: String, required: true },
  timezone: { type: String, default: 'America/Lima' },
  nextRun: Date,
  lastRun: Date
}, { _id: false });

const CronJobRetryPolicySchema = new Schema<ICronJobRetryPolicy>({
  maxRetries: { type: Number, default: 3 },
  backoffMultiplier: { type: Number, default: 2 },
  currentRetries: { type: Number, default: 0 }
}, { _id: false });

const CronJobHistoryEntrySchema = new Schema<ICronJobHistoryEntry>({
  status: { type: String, enum: ['success', 'error'], required: true },
  timestamp: { type: Date, required: true },
  duration: Number,
  error: String,
  metadata: Schema.Types.Mixed
}, { _id: false });

const CronJobMetadataSchema = new Schema<ICronJobMetadata>({
  createdBy: String,
  updatedBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  tags: [String],
  legacyId: String,
  legacyCompany: String
}, { _id: false });

const CronJobSchema = new Schema<ICronJob>({
  companyId: {
    type: String,
    required: true,
    index: true  // ← INDEX: Para queries rápidas por empresa
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['api', 'message'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true  // ← INDEX: Para filtrar activos rápidamente
  },
  timeout: { type: Number, default: 30000 },

  message: CronJobMessageSchema,
  apiConfig: CronJobApiConfigSchema,

  schedule: {
    type: CronJobScheduleSchema,
    required: true
  },

  retryPolicy: {
    type: CronJobRetryPolicySchema,
    default: () => ({
      maxRetries: 3,
      backoffMultiplier: 2,
      currentRetries: 0
    })
  },

  status: {
    type: String,
    enum: ['idle', 'running', 'success', 'error'],
    default: 'idle'
  },
  lastExecution: Date,
  failureCount: {
    type: Number,
    default: 0
  },
  lastError: String,

  history: {
    type: [CronJobHistoryEntrySchema],
    default: []
  },

  metadata: {
    type: CronJobMetadataSchema,
    default: () => ({
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: []
    })
  }
}, {
  timestamps: true  // Auto-maneja createdAt y updatedAt
});

// Índices compuestos para queries comunes
CronJobSchema.index({ companyId: 1, isActive: 1 });
CronJobSchema.index({ companyId: 1, type: 1 });
CronJobSchema.index({ 'schedule.nextRun': 1 }, { sparse: true });

// Validación custom: message XOR apiConfig
CronJobSchema.pre('validate', function(next) {
  if (this.type === 'message' && !this.message) {
    next(new Error('message is required when type is "message"'));
  } else if (this.type === 'api' && !this.apiConfig) {
    next(new Error('apiConfig is required when type is "api"'));
  } else {
    next();
  }
});

// Limitar historial a últimas 50 entradas
CronJobSchema.pre('save', function(next) {
  if (this.history && this.history.length > 50) {
    this.history = this.history.slice(-50);
  }
  next();
});

export const CronJobModel = mongoose.model<ICronJob>('CronJob', CronJobSchema);
```

### 🔁 Compatibilidad con `cronjobs.json` (mapeo explícito)

| Campo actual (JSON) | Nuevo modelo | Regla |
| --- | --- | --- |
| `id` | `metadata.legacyId` | Preservar UUID para trazabilidad |
| `company` | `companyId` + `metadata.legacyCompany` | Mapear slug → companyId real |
| `cronExpression` | `schedule.cronExpression` | Migrar directo |
| `url` | `apiConfig.url` | Migrar directo |
| `type` (opcional) | `type` | Inferir: `message` si hay `message`, si no `api` |
| `message.sender` | `message.sender` (legacy) | No usar en envío; resolver sender desde Company |
| `metadata.failureCount` | `failureCount` | Migrar sin pérdida |
| `metadata.lastRun` | `schedule.lastRun` | Mantener último run real |
| `lastExecution` | `lastExecution` | Mantener como fuente de verdad |
| `timeout` | `timeout` | Default 30000 ms |

### 🔗 Relación con Company

```typescript
// Location: Portal/src/models/shared/company.model.ts (UPDATED)

// Agregar a ICompanyValidationSchema:
interface ICompanyValidationSchema {
  // ... campos existentes

  // ← NUEVO: Límite de cronjobs en subscription
  subscription: {
    // ... existente
    limits: {
      // ... existente
      cronJobs: number;  // Máximo de cronjobs activos
    };
    usage: {
      // ... existente
      cronJobs: number;  // Contador actual de cronjobs
    };
  };

  // ← EXISTENTE: Configuración de WhatsApp (ya existe)
  whatsappConfig?: {
    sender?: string;           // Número de WhatsApp del sender
    adminGroupId?: string;     // Grupo admin para notificaciones
    aiEnabled?: boolean;       // Si AI está habilitada
  };
}
```

---

## 6. Cambios en Backend (lila-app)

### 📁 Estructura de Archivos (Nueva)

```
lila-app/
├── src/
│   ├── models/
│   │   └── cronjob.model.ts                    ← NUEVO: Mongoose model
│   │
│   ├── jobs/
│   │   ├── scheduler.service.v2.ts             ← NUEVO: Reescrito para MongoDB
│   │   ├── scheduler.service.ts                ← DEPRECATED: Mantener temporalmente
│   │   └── executor.service.ts                 ← NUEVO: Lógica de ejecución separada
│   │
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── jobs.controller.v2.ts           ← NUEVO: Con validación multi-tenant
│   │   │   └── jobs.controller.ts              ← DEPRECATED
│   │   │
│   │   ├── routes/
│   │   │   ├── jobs.routes.v2.ts               ← NUEVO
│   │   │   └── jobs.routes.ts                  ← DEPRECATED
│   │   │
│   │   └── middlewares/
│   │       ├── validateCompany.middleware.ts   ← NUEVO: Valida companyId
│   │       └── validateSender.middleware.ts    ← NUEVO: Valida sender configurado
│   │
│   ├── database/
│   │   ├── sharedConnection.ts                 ← NUEVO: Conexión a shared_db
│   │   └── models.ts                           ← ACTUALIZAR: Exportar CronJobModel
│   │
│   ├── utils/
│   │   ├── validators.ts                       ← ACTUALIZAR: Nuevas validaciones
│   │   └── cronHelpers.ts                      ← NUEVO: Helpers de cron (calcular nextRun, etc.)
│   │
│   └── types/
│       └── index.ts                            ← ACTUALIZAR: Eliminar hardcoded enum
│
└── data/
    └── cronjobs.json                           ← DEPRECATED: Migrar a MongoDB
└── scripts/
    └── migrate-cronjobs-to-mongo.ts            ← NUEVO: Script de migración
```

### 🔧 Implementación de Servicios

#### **A. JobScheduler v2 (scheduler.service.v2.ts)**

```typescript
// Location: lila-app/src/jobs/scheduler.service.v2.ts

import cron from 'node-cron';
import { CronJobModel, ICronJob } from '../models/cronjob.model.js';
import { CompanyModel } from '../models/company.model.js';  // Asumir que existe
import { ConnectionManager } from '../whatsapp/baileys/connection.manager.js';
import { JobExecutor } from './executor.service.js';
import logger from '../utils/logger.js';

interface ScheduledTask {
  jobId: string;
  task: cron.ScheduledTask;
}

class JobSchedulerV2 {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private executor: JobExecutor;
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.executor = new JobExecutor(connectionManager);
  }

  /**
   * Inicializa el scheduler
   * - Conecta a MongoDB shared_db
   * - Carga y programa todos los jobs activos
   */
  async initialize(): Promise<void> {
    try {
      logger.info('[JobScheduler] Initializing v2...');

      // Cargar jobs activos desde MongoDB
      const activeJobs = await CronJobModel.find({ isActive: true });

      logger.info(`[JobScheduler] Found ${activeJobs.length} active jobs`);

      // Programar cada job
      for (const job of activeJobs) {
        await this.scheduleJob(job);
      }

      logger.info('[JobScheduler] Initialization complete');
    } catch (error) {
      logger.error('[JobScheduler] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo cronjob
   * @param data Datos del cronjob (sin companyId validado aún)
   * @returns Cronjob creado
   */
  async createJob(data: Partial<ICronJob>): Promise<ICronJob> {
    try {
      // Validar que company existe
      const company = await CompanyModel.findOne({ companyId: data.companyId });
      if (!company) {
        throw new Error(`Company ${data.companyId} not found`);
      }

      // Validar que tiene sender configurado
      if (!company.whatsappConfig?.sender) {
        throw new Error(`Company ${data.companyId} does not have WhatsApp sender configured`);
      }

      // Validar límite de cronjobs
      const currentCount = await CronJobModel.countDocuments({
        companyId: data.companyId,
        isActive: true
      });

      if (currentCount >= company.subscription.limits.cronJobs) {
        throw new Error(`Cronjob limit reached for company ${data.companyId}`);
      }

      // Crear job en MongoDB
      const job = await CronJobModel.create({
        ...data,
        metadata: {
          ...data.metadata,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Incrementar contador de uso
      await CompanyModel.updateOne(
        { companyId: data.companyId },
        { $inc: { 'subscription.usage.cronJobs': 1 } }
      );

      // Programar si está activo
      if (job.isActive) {
        await this.scheduleJob(job);
      }

      logger.info(`[JobScheduler] Created job ${job._id} for company ${job.companyId}`);

      return job;
    } catch (error) {
      logger.error('[JobScheduler] Failed to create job:', error);
      throw error;
    }
  }

  /**
   * Actualiza un cronjob existente
   */
  async updateJob(jobId: string, updates: Partial<ICronJob>): Promise<ICronJob> {
    try {
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Actualizar en MongoDB
      Object.assign(job, updates, {
        'metadata.updatedAt': new Date(),
        'metadata.updatedBy': updates.metadata?.updatedBy
      });

      await job.save();

      // Re-programar si cambió cronExpression o isActive
      if (updates.schedule?.cronExpression || updates.isActive !== undefined) {
        this.unscheduleJob(jobId);

        if (job.isActive) {
          await this.scheduleJob(job);
        }
      }

      logger.info(`[JobScheduler] Updated job ${jobId}`);

      return job;
    } catch (error) {
      logger.error('[JobScheduler] Failed to update job:', error);
      throw error;
    }
  }

  /**
   * Elimina un cronjob
   */
  async deleteJob(jobId: string): Promise<void> {
    try {
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Desprogramar
      this.unscheduleJob(jobId);

      // Decrementar contador de uso
      await CompanyModel.updateOne(
        { companyId: job.companyId },
        { $inc: { 'subscription.usage.cronJobs': -1 } }
      );

      // Eliminar de MongoDB
      await CronJobModel.deleteOne({ _id: jobId });

      logger.info(`[JobScheduler] Deleted job ${jobId}`);
    } catch (error) {
      logger.error('[JobScheduler] Failed to delete job:', error);
      throw error;
    }
  }

  /**
   * Ejecuta un job inmediatamente (manual)
   */
  async runJobNow(jobId: string): Promise<void> {
    try {
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      logger.info(`[JobScheduler] Running job ${jobId} manually`);

      await this.executor.execute(job);
    } catch (error) {
      logger.error('[JobScheduler] Failed to run job manually:', error);
      throw error;
    }
  }

  /**
   * Obtiene jobs filtrados por company
   */
  async getJobsByCompany(companyId: string): Promise<ICronJob[]> {
    return CronJobModel.find({ companyId }).sort({ 'metadata.createdAt': -1 });
  }

  /**
   * Programa un job con node-cron
   */
  private async scheduleJob(job: ICronJob): Promise<void> {
    try {
      const task = cron.schedule(
        job.schedule.cronExpression,
        async () => {
          await this.executor.execute(job);
        },
        {
          timezone: job.schedule.timezone || 'America/Lima',
          scheduled: true
        }
      );

      this.scheduledTasks.set(job._id.toString(), {
        jobId: job._id.toString(),
        task
      });

      logger.info(`[JobScheduler] Scheduled job ${job._id} with expression ${job.schedule.cronExpression}`);
    } catch (error) {
      logger.error(`[JobScheduler] Failed to schedule job ${job._id}:`, error);
      throw error;
    }
  }

  /**
   * Desprograma un job
   */
  private unscheduleJob(jobId: string): void {
    const scheduled = this.scheduledTasks.get(jobId);
    if (scheduled) {
      scheduled.task.stop();
      this.scheduledTasks.delete(jobId);
      logger.info(`[JobScheduler] Unscheduled job ${jobId}`);
    }
  }

  /**
   * Detiene todos los jobs (graceful shutdown)
   */
  async shutdown(): Promise<void> {
    logger.info('[JobScheduler] Shutting down...');

    for (const [jobId, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }

    this.scheduledTasks.clear();

    logger.info('[JobScheduler] Shutdown complete');
  }

  /**
   * Re-sincroniza todos los jobs desde MongoDB (útil después de cambios externos)
   */
  async syncFromDatabase(): Promise<void> {
    logger.info('[JobScheduler] Syncing from database...');

    // Desprogramar todos
    for (const [jobId, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();

    // Recargar
    await this.initialize();
  }
}

export default JobSchedulerV2;
```

#### **B. JobExecutor (executor.service.ts)**

```typescript
// Location: lila-app/src/jobs/executor.service.ts

import { ICronJob, CronJobModel } from '../models/cronjob.model.js';
import { CompanyModel } from '../models/company.model.js';
import { ConnectionManager } from '../whatsapp/baileys/connection.manager.js';
import axios from 'axios';
import logger from '../utils/logger.js';

export class JobExecutor {
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Ejecuta un cronjob
   * - Resuelve sender desde Company
   * - Ejecuta según tipo (message o api)
   * - Actualiza historial
   * - Aplica retry policy si falla
   */
  async execute(job: ICronJob): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info(`[JobExecutor] Executing job ${job._id} (${job.name}) for company ${job.companyId}`);

      // Marcar como running
      await CronJobModel.updateOne(
        { _id: job._id },
        { status: 'running', lastExecution: new Date() }
      );

      // Resolver sender desde Company
      const company = await CompanyModel.findOne({ companyId: job.companyId });
      if (!company) {
        throw new Error(`Company ${job.companyId} not found`);
      }

      const sender = company.whatsappConfig?.sender;
      if (!sender && job.type === 'message') {
        throw new Error(`No sender configured for company ${job.companyId}`);
      }

      // Ejecutar según tipo
      if (job.type === 'message') {
        await this.executeMessage(job, sender!);
      } else if (job.type === 'api') {
        await this.executeApi(job);
      }

      const duration = Date.now() - startTime;

      // Marcar como success
      await this.recordSuccess(job, duration);

      logger.info(`[JobExecutor] Job ${job._id} completed successfully in ${duration}ms`);

    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error(`[JobExecutor] Job ${job._id} failed:`, error);

      // Intentar retry
      if (job.retryPolicy.currentRetries! < job.retryPolicy.maxRetries) {
        await this.scheduleRetry(job, error);
      } else {
        await this.recordError(job, error, duration);
      }
    }
  }

  /**
   * Ejecuta job tipo message
   */
  private async executeMessage(job: ICronJob, sender: string): Promise<void> {
    if (!job.message) {
      throw new Error('Message configuration is missing');
    }

    const { chatId, body, mentions } = job.message;

    // Enviar mensaje a WhatsApp
    await this.connectionManager.sendTextMessage(
      sender,
      chatId,
      body,
      {
        mentions: mentions || [],  // ← Preparado para menciones
        queueOnFail: true
      }
    );

    logger.info(`[JobExecutor] Message sent to ${chatId}`);
  }

  /**
   * Ejecuta job tipo api
   */
  private async executeApi(job: ICronJob): Promise<void> {
    if (!job.apiConfig) {
      throw new Error('API configuration is missing');
    }

    const { url, method, headers, body } = job.apiConfig;

    const response = await axios.request({
      url,
      method,
      headers: headers || {},
      data: body,
      timeout: job.timeout || 30000
    });

    logger.info(`[JobExecutor] API call to ${url} returned ${response.status}`);
  }

  /**
   * Registra ejecución exitosa
   */
  private async recordSuccess(job: ICronJob, duration: number): Promise<void> {
    await CronJobModel.updateOne(
      { _id: job._id },
      {
        status: 'success',
        failureCount: 0,
        lastError: null,
        'retryPolicy.currentRetries': 0,
        $push: {
          history: {
            $each: [{
              status: 'success',
              timestamp: new Date(),
              duration
            }],
            $slice: -50  // Mantener últimas 50
          }
        }
      }
    );
  }

  /**
   * Registra error
   */
  private async recordError(job: ICronJob, error: any, duration: number): Promise<void> {
    await CronJobModel.updateOne(
      { _id: job._id },
      {
        status: 'error',
        $inc: { failureCount: 1 },
        lastError: error.message,
        $push: {
          history: {
            $each: [{
              status: 'error',
              timestamp: new Date(),
              duration,
              error: error.message
            }],
            $slice: -50
          }
        }
      }
    );
  }

  /**
   * Programa retry con backoff
   */
  private async scheduleRetry(job: ICronJob, error: any): Promise<void> {
    const currentRetries = job.retryPolicy.currentRetries || 0;
    const backoffDelay = Math.pow(job.retryPolicy.backoffMultiplier, currentRetries) * 1000;

    logger.info(`[JobExecutor] Scheduling retry ${currentRetries + 1}/${job.retryPolicy.maxRetries} for job ${job._id} in ${backoffDelay}ms`);

    await CronJobModel.updateOne(
      { _id: job._id },
      {
        'retryPolicy.currentRetries': currentRetries + 1
      }
    );

    setTimeout(async () => {
      await this.execute(job);
    }, backoffDelay);
  }
}
```

#### **C. Controllers v2 (jobs.controller.v2.ts)**

```typescript
// Location: lila-app/src/api/controllers/jobs.controller.v2.ts

import { Request, Response } from 'express';
import JobSchedulerV2 from '../../jobs/scheduler.service.v2.js';
import { validateCronJobCreate, validateCronJobUpdate } from '../../utils/validators.js';
import logger from '../../utils/logger.js';

export class JobsControllerV2 {
  private scheduler: JobSchedulerV2;

  constructor(scheduler: JobSchedulerV2) {
    this.scheduler = scheduler;
  }

  /**
   * POST /api/jobs
   * Crea un nuevo cronjob
   */
  createJob = async (req: Request, res: Response) => {
    try {
      // Validar body
      const validation = validateCronJobCreate(req.body);
      if (!validation.success) {
        return res.status(400).json({
          ok: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      const job = await this.scheduler.createJob(validation.data);

      return res.status(201).json({
        ok: true,
        data: job
      });

    } catch (error: any) {
      logger.error('[JobsController] Create job failed:', error);

      return res.status(500).json({
        ok: false,
        message: error.message
      });
    }
  };

  /**
   * GET /api/jobs
   * Lista cronjobs con filtros opcionales
   * Query params: companyId, type, isActive
   */
  listJobs = async (req: Request, res: Response) => {
    try {
      const { companyId, type, isActive } = req.query;

      const filter: any = {};
      if (companyId) filter.companyId = companyId;
      if (type) filter.type = type;
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      const jobs = await CronJobModel.find(filter).sort({ 'metadata.createdAt': -1 });

      return res.json({
        ok: true,
        data: jobs
      });

    } catch (error: any) {
      logger.error('[JobsController] List jobs failed:', error);

      return res.status(500).json({
        ok: false,
        message: error.message
      });
    }
  };

  /**
   * GET /api/jobs/:id
   * Obtiene un cronjob específico
   */
  getJob = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const job = await CronJobModel.findById(id);

      if (!job) {
        return res.status(404).json({
          ok: false,
          message: 'Job not found'
        });
      }

      return res.json({
        ok: true,
        data: job
      });

    } catch (error: any) {
      logger.error('[JobsController] Get job failed:', error);

      return res.status(500).json({
        ok: false,
        message: error.message
      });
    }
  };

  /**
   * PATCH /api/jobs/:id
   * Actualiza un cronjob
   */
  updateJob = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Validar updates
      const validation = validateCronJobUpdate(req.body);
      if (!validation.success) {
        return res.status(400).json({
          ok: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      const job = await this.scheduler.updateJob(id, validation.data);

      return res.json({
        ok: true,
        data: job
      });

    } catch (error: any) {
      logger.error('[JobsController] Update job failed:', error);

      return res.status(500).json({
        ok: false,
        message: error.message
      });
    }
  };

  /**
   * DELETE /api/jobs/:id
   * Elimina un cronjob
   */
  deleteJob = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await this.scheduler.deleteJob(id);

      return res.json({
        ok: true,
        message: 'Job deleted successfully'
      });

    } catch (error: any) {
      logger.error('[JobsController] Delete job failed:', error);

      return res.status(500).json({
        ok: false,
        message: error.message
      });
    }
  };

  /**
   * POST /api/jobs/:id/run
   * Ejecuta un cronjob inmediatamente
   */
  runJobNow = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await this.scheduler.runJobNow(id);

      return res.json({
        ok: true,
        message: 'Job execution started'
      });

    } catch (error: any) {
      logger.error('[JobsController] Run job failed:', error);

      return res.status(500).json({
        ok: false,
        message: error.message
      });
    }
  };
}
```

#### **D. Middlewares de Validación**

```typescript
// Location: lila-app/src/api/middlewares/validateCompany.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { CompanyModel } from '../../models/company.model.js';

export const validateCompanyExists = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;

    if (!companyId) {
      return res.status(400).json({
        ok: false,
        message: 'companyId is required'
      });
    }

    const company = await CompanyModel.findOne({ companyId });

    if (!company) {
      return res.status(404).json({
        ok: false,
        message: `Company ${companyId} not found`
      });
    }

    // Adjuntar company al request para usarlo en controller
    (req as any).company = company;

    next();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Failed to validate company'
    });
  }
};

// Location: lila-app/src/api/middlewares/validateSender.middleware.ts

export const validateSenderConfigured = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const company = (req as any).company;  // Asume que validateCompanyExists se ejecutó antes

    if (!company) {
      return res.status(400).json({
        ok: false,
        message: 'Company validation failed'
      });
    }

    if (!company.whatsappConfig?.sender) {
      return res.status(400).json({
        ok: false,
        message: `Company ${company.companyId} does not have WhatsApp sender configured`,
        hint: 'Configure a sender in Company settings before creating cronjobs'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Failed to validate sender'
    });
  }
};
```

---

## 7. Cambios en Frontend (Portal)

### 📁 Estructura de Archivos (Nueva)

```
Portal/src/
├── pages/
│   ├── admin/
│   │   └── cron-jobs/
│   │       └── index.tsx                       ← ACTUALIZAR: Nueva UI premium
│   │
│   └── api/
│       └── companies/
│           └── [id]/
│               └── cronjobs.ts                 ← NUEVO: Proxy a lila-app con RBAC
│
├── components/
│   ├── CronJobs/
│   │   ├── CronJobList.tsx                     ← REDISEÑO COMPLETO
│   │   ├── CronJobWizard.tsx                   ← NUEVO: Wizard multi-step
│   │   ├── CronJobCard.tsx                     ← NUEVO: Card individual premium
│   │   ├── CronJobFilters.tsx                  ← NUEVO: Filtros avanzados
│   │   ├── CronScheduleBuilder.tsx             ← ACTUALIZAR: Mejorar visual
│   │   ├── MentionsSelector.tsx                ← NUEVO: Selector de menciones (disabled)
│   │   └── CronJobPreview.tsx                  ← NUEVO: Preview antes de crear
│   │
│   └── shared/
│       ├── CompanySelector.tsx                 ← NUEVO: Dropdown dinámico de companies
│       └── WhatsAppGroupSelector.tsx           ← NUEVO: Dropdown de grupos dinámico
│
├── hooks/
│   ├── useCronJobs.ts                          ← NUEVO: Hook para gestionar cronjobs
│   ├── useCompanies.ts                         ← ACTUALIZAR: Obtener todas las companies
│   └── useWhatsAppGroups.ts                    ← NUEVO: Obtener grupos filtrados por sender
│
├── models/
│   └── cronJob.ts                              ← ACTUALIZAR: Sincronizar con backend
│
└── utils/
    ├── cronUtils.ts                            ← ACTUALIZAR: Helpers adicionales
    └── cronValidation.ts                       ← NUEVO: Validaciones client-side
```

### 🎨 Componentes UI Principales

#### **A. CronJobList.tsx (Rediseño)**

```tsx
// Location: Portal/src/components/CronJobs/CronJobList.tsx

import { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Flex,
  Heading,
  Button,
  useDisclosure,
  Skeleton,
  Badge,
  Text,
  Icon,
  HStack,
  VStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  Tooltip,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiFilter, FiMoreVertical, FiPlay, FiPause, FiEdit, FiTrash2, FiClock, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { useCronJobs } from '@/hooks/useCronJobs';
import { CronJobCard } from './CronJobCard';
import { CronJobWizard } from './CronJobWizard';
import { CronJobFilters } from './CronJobFilters';
import { cronToHumanReadable } from '@/utils/cronUtils';

const MotionBox = motion(Box);

export const CronJobList = () => {
  const { jobs, isLoading, refetch, deleteJob, toggleActive } = useCronJobs();
  const { isOpen: isWizardOpen, onOpen: onWizardOpen, onClose: onWizardClose } = useDisclosure();
  const { isOpen: isFiltersOpen, onToggle: onToggleFilters } = useDisclosure();

  const [selectedJob, setSelectedJob] = useState(null);
  const [filters, setFilters] = useState({
    companyId: null,
    type: null,
    status: null,
    search: ''
  });

  const filteredJobs = useMemo(() => {
    return jobs?.filter(job => {
      if (filters.companyId && job.companyId !== filters.companyId) return false;
      if (filters.type && job.type !== filters.type) return false;
      if (filters.status && job.status !== filters.status) return false;
      if (filters.search && !job.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [jobs, filters]);

  const handleEdit = (job) => {
    setSelectedJob(job);
    onWizardOpen();
  };

  const handleDelete = async (jobId) => {
    if (confirm('¿Estás seguro de eliminar este cronjob?')) {
      await deleteJob(jobId);
      refetch();
    }
  };

  const handleToggleActive = async (jobId, currentActive) => {
    await toggleActive(jobId, !currentActive);
    refetch();
  };

  return (
    <Box>
      {/* Header */}
      <Flex justify="space-between" align="center" mb={6}>
        <VStack align="start" spacing={1}>
          <Heading size="lg" fontWeight="bold">
            CronJobs Programados
          </Heading>
          <Text color="gray.500" fontSize="sm">
            Gestiona tareas automatizadas y notificaciones
          </Text>
        </VStack>

        <HStack spacing={3}>
          <Tooltip label="Filtros avanzados">
            <Button
              leftIcon={<FiFilter />}
              variant={isFiltersOpen ? 'solid' : 'outline'}
              colorScheme="gray"
              onClick={onToggleFilters}
            >
              Filtros
            </Button>
          </Tooltip>

          <Button
            leftIcon={<FiPlus />}
            colorScheme="accent"
            size="md"
            onClick={() => {
              setSelectedJob(null);
              onWizardOpen();
            }}
            boxShadow="md"
            _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg' }}
            transition="all 0.2s"
          >
            Nuevo CronJob
          </Button>
        </HStack>
      </Flex>

      {/* Filters Panel */}
      <AnimatePresence>
        {isFiltersOpen && (
          <MotionBox
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            mb={6}
          >
            <CronJobFilters filters={filters} onChange={setFilters} />
          </MotionBox>
        )}
      </AnimatePresence>

      {/* Stats Bar */}
      <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4} mb={6}>
        <Box
          bg="white"
          p={4}
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          boxShadow="sm"
        >
          <Flex align="center" justify="space-between">
            <VStack align="start" spacing={0}>
              <Text fontSize="2xl" fontWeight="bold">
                {filteredJobs?.length || 0}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Total CronJobs
              </Text>
            </VStack>
            <Icon as={FiClock} w={8} h={8} color="blue.400" />
          </Flex>
        </Box>

        <Box
          bg="white"
          p={4}
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          boxShadow="sm"
        >
          <Flex align="center" justify="space-between">
            <VStack align="start" spacing={0}>
              <Text fontSize="2xl" fontWeight="bold" color="green.500">
                {filteredJobs?.filter(j => j.isActive).length || 0}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Activos
              </Text>
            </VStack>
            <Icon as={FiCheckCircle} w={8} h={8} color="green.400" />
          </Flex>
        </Box>

        <Box
          bg="white"
          p={4}
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          boxShadow="sm"
        >
          <Flex align="center" justify="space-between">
            <VStack align="start" spacing={0}>
              <Text fontSize="2xl" fontWeight="bold" color="red.500">
                {filteredJobs?.filter(j => j.status === 'error').length || 0}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Con Errores
              </Text>
            </VStack>
            <Icon as={FiXCircle} w={8} h={8} color="red.400" />
          </Flex>
        </Box>
      </Grid>

      {/* Jobs Grid */}
      {isLoading ? (
        <Grid templateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap={6}>
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} height="200px" borderRadius="xl" />
          ))}
        </Grid>
      ) : filteredJobs?.length === 0 ? (
        <Alert status="info" borderRadius="xl">
          <AlertIcon />
          No hay cronjobs que coincidan con los filtros seleccionados
        </Alert>
      ) : (
        <Grid templateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap={6}>
          <AnimatePresence>
            {filteredJobs?.map((job) => (
              <MotionBox
                key={job._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <CronJobCard
                  job={job}
                  onEdit={() => handleEdit(job)}
                  onDelete={() => handleDelete(job._id)}
                  onToggleActive={() => handleToggleActive(job._id, job.isActive)}
                />
              </MotionBox>
            ))}
          </AnimatePresence>
        </Grid>
      )}

      {/* Wizard Modal */}
      <CronJobWizard
        isOpen={isWizardOpen}
        onClose={onWizardClose}
        job={selectedJob}
        onSave={() => {
          refetch();
          onWizardClose();
        }}
      />
    </Box>
  );
};
```

#### **B. CronJobWizard.tsx (Nuevo)**

```tsx
// Location: Portal/src/components/CronJobs/CronJobWizard.tsx

import { useState, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  Stepper,
  Step,
  StepIndicator,
  StepStatus,
  StepIcon,
  StepNumber,
  StepTitle,
  StepDescription,
  StepSeparator,
  VStack,
  Button,
  HStack,
  useSteps,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Link
} from '@chakra-ui/react';
import { FiArrowRight, FiArrowLeft, FiCheck } from 'react-icons/fi';
import { CompanySelector } from '@/components/shared/CompanySelector';
import { WhatsAppGroupSelector } from '@/components/shared/WhatsAppGroupSelector';
import { CronScheduleBuilder } from './CronScheduleBuilder';
import { MentionsSelector } from './MentionsSelector';
import { CronJobPreview } from './CronJobPreview';
import { useCompanies } from '@/hooks/useCompanies';
import { useWhatsAppSender } from '@/hooks/useWhatsAppSender';
import { toast } from '@/components/Toast';

const steps = [
  { title: 'Empresa', description: 'Seleccionar empresa' },
  { title: 'Configuración', description: 'Tipo y mensaje' },
  { title: 'Programación', description: 'Cuando ejecutar' },
  { title: 'Menciones', description: 'Usuarios a mencionar' },
  { title: 'Confirmar', description: 'Revisar y crear' }
];

export const CronJobWizard = ({ isOpen, onClose, job, onSave }) => {
  const { activeStep, setActiveStep } = useSteps({ index: 0, count: steps.length });

  // Form state
  const [formData, setFormData] = useState({
    companyId: null,
    name: '',
    type: 'message',
    message: {
      chatId: null,
      body: '',
      mentions: []
    },
    apiConfig: {
      url: '',
      method: 'GET'
    },
    schedule: {
      cronExpression: '',
      timezone: 'America/Lima'
    },
    isActive: true
  });

  // Validation state
  const [senderConfigured, setSenderConfigured] = useState(false);
  const [senderLoading, setSenderLoading] = useState(false);

  const { companies } = useCompanies();
  const { sender, configured } = useWhatsAppSender({ companyId: formData.companyId });

  // Check sender when company changes
  useEffect(() => {
    if (formData.companyId) {
      setSenderLoading(true);
      // configured viene del hook useWhatsAppSender
      setSenderConfigured(configured);
      setSenderLoading(false);
    }
  }, [formData.companyId, configured]);

  const handleNext = () => {
    // Validaciones por paso
    if (activeStep === 0 && !formData.companyId) {
      toast.error('Selecciona una empresa');
      return;
    }

    if (activeStep === 0 && !senderConfigured) {
      toast.error('La empresa no tiene sender configurado');
      return;
    }

    if (activeStep === 1) {
      if (formData.type === 'message' && !formData.message.chatId) {
        toast.error('Selecciona un grupo de WhatsApp');
        return;
      }
      if (formData.type === 'api' && !formData.apiConfig.url) {
        toast.error('Ingresa una URL válida');
        return;
      }
    }

    if (activeStep === 2 && !formData.schedule.cronExpression) {
      toast.error('Configura la programación');
      return;
    }

    setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
  };

  const handleSubmit = async () => {
    try {
      const endpoint = job ? `/api/jobs/${job._id}` : '/api/jobs';
      const method = job ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to save cronjob');

      toast.success(job ? 'CronJob actualizado' : 'CronJob creado');
      onSave();
      handleClose();
    } catch (error) {
      toast.error('Error al guardar el cronjob');
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setFormData({
      companyId: null,
      name: '',
      type: 'message',
      message: { chatId: null, body: '', mentions: [] },
      apiConfig: { url: '', method: 'GET' },
      schedule: { cronExpression: '', timezone: 'America/Lima' },
      isActive: true
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="4xl">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent maxW="900px" borderRadius="2xl">
        <ModalHeader>
          {job ? 'Editar CronJob' : 'Crear Nuevo CronJob'}
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={6}>
          {/* Stepper */}
          <Stepper index={activeStep} mb={8} colorScheme="accent">
            {steps.map((step, index) => (
              <Step key={index}>
                <StepIndicator>
                  <StepStatus
                    complete={<StepIcon />}
                    incomplete={<StepNumber />}
                    active={<StepNumber />}
                  />
                </StepIndicator>

                <Box flexShrink="0">
                  <StepTitle>{step.title}</StepTitle>
                  <StepDescription>{step.description}</StepDescription>
                </Box>

                <StepSeparator />
              </Step>
            ))}
          </Stepper>

          {/* Step Content */}
          <Box minH="400px">
            {/* STEP 1: Seleccionar Empresa */}
            {activeStep === 0 && (
              <VStack spacing={6} align="stretch">
                <CompanySelector
                  companies={companies}
                  value={formData.companyId}
                  onChange={(companyId) => setFormData({ ...formData, companyId })}
                />

                {/* Validación de Sender */}
                {formData.companyId && !senderLoading && (
                  senderConfigured ? (
                    <Alert status="success" borderRadius="xl">
                      <AlertIcon />
                      <Box>
                        <AlertTitle>Sender configurado</AlertTitle>
                        <AlertDescription>
                          Número de WhatsApp: {sender}
                        </AlertDescription>
                      </Box>
                    </Alert>
                  ) : (
                    <Alert status="error" borderRadius="xl">
                      <AlertIcon />
                      <Box flex="1">
                        <AlertTitle>No hay sender configurado</AlertTitle>
                        <AlertDescription>
                          Esta empresa no tiene un número de WhatsApp configurado.
                          Configura uno antes de crear cronjobs.
                        </AlertDescription>
                      </Box>
                      <Link href={`/admin/companies/${formData.companyId}/settings`} isExternal>
                        <Button size="sm" colorScheme="red">
                          Ir a Configuración
                        </Button>
                      </Link>
                    </Alert>
                  )
                )}
              </VStack>
            )}

            {/* STEP 2: Tipo y Configuración */}
            {activeStep === 1 && (
              <VStack spacing={6} align="stretch">
                {/* Radio: API / Mensaje */}
                {/* Input: Nombre */}
                {/* Si mensaje: WhatsAppGroupSelector + TextArea body */}
                {/* Si API: Input URL + Dropdown método */}
              </VStack>
            )}

            {/* STEP 3: Programación */}
            {activeStep === 2 && (
              <CronScheduleBuilder
                value={formData.schedule.cronExpression}
                onChange={(cronExpression) =>
                  setFormData({
                    ...formData,
                    schedule: { ...formData.schedule, cronExpression }
                  })
                }
              />
            )}

            {/* STEP 4: Menciones (Preparado) */}
            {activeStep === 3 && (
              <VStack spacing={6} align="stretch">
                <Alert status="info" borderRadius="xl">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Próximamente</AlertTitle>
                    <AlertDescription>
                      La funcionalidad de menciones estará disponible en una próxima actualización.
                    </AlertDescription>
                  </Box>
                </Alert>

                <MentionsSelector
                  value={formData.message.mentions}
                  onChange={(mentions) =>
                    setFormData({
                      ...formData,
                      message: { ...formData.message, mentions }
                    })
                  }
                  disabled={true}
                />
              </VStack>
            )}

            {/* STEP 5: Preview */}
            {activeStep === 4 && (
              <CronJobPreview data={formData} />
            )}
          </Box>

          {/* Navigation Buttons */}
          <HStack justify="space-between" mt={8}>
            <Button
              leftIcon={<FiArrowLeft />}
              onClick={handleBack}
              isDisabled={activeStep === 0}
              variant="ghost"
            >
              Atrás
            </Button>

            {activeStep < steps.length - 1 ? (
              <Button
                rightIcon={<FiArrowRight />}
                colorScheme="accent"
                onClick={handleNext}
                isDisabled={activeStep === 0 && (!formData.companyId || !senderConfigured)}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                leftIcon={<FiCheck />}
                colorScheme="green"
                onClick={handleSubmit}
              >
                {job ? 'Actualizar' : 'Crear'} CronJob
              </Button>
            )}
          </HStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
```

#### **C. CronJobCard.tsx (Nuevo)**

```tsx
// Location: Portal/src/components/CronJobs/CronJobCard.tsx

import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Badge,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Tooltip,
  Icon
} from '@chakra-ui/react';
import { FiMoreVertical, FiEdit, FiTrash2, FiPlay, FiPause, FiClock, FiMessageSquare, FiLink } from 'react-icons/fi';
import { cronToHumanReadable } from '@/utils/cronUtils';
import { format } from 'date-fns';

export const CronJobCard = ({ job, onEdit, onDelete, onToggleActive }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'green';
      case 'error': return 'red';
      case 'running': return 'yellow';
      default: return 'gray';
    }
  };

  const getTypeIcon = (type) => {
    return type === 'message' ? FiMessageSquare : FiLink;
  };

  return (
    <Box
      bg="white"
      p={6}
      borderRadius="xl"
      border="1px solid"
      borderColor="gray.200"
      boxShadow="md"
      _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
      transition="all 0.2s"
      position="relative"
    >
      {/* Header */}
      <Flex justify="space-between" align="start" mb={4}>
        <HStack spacing={3}>
          <Icon
            as={getTypeIcon(job.type)}
            w={5}
            h={5}
            color={job.isActive ? 'accent.500' : 'gray.400'}
          />
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold" fontSize="md">
              {job.name}
            </Text>
            <Text fontSize="xs" color="gray.500">
              {job.companyName || job.companyId}
            </Text>
          </VStack>
        </HStack>

        <Menu>
          <MenuButton
            as={IconButton}
            icon={<FiMoreVertical />}
            variant="ghost"
            size="sm"
          />
          <MenuList>
            <MenuItem icon={<FiEdit />} onClick={onEdit}>
              Editar
            </MenuItem>
            <MenuItem
              icon={job.isActive ? <FiPause /> : <FiPlay />}
              onClick={onToggleActive}
            >
              {job.isActive ? 'Pausar' : 'Activar'}
            </MenuItem>
            <MenuItem icon={<FiTrash2 />} onClick={onDelete} color="red.500">
              Eliminar
            </MenuItem>
          </MenuList>
        </Menu>
      </Flex>

      {/* Status & Schedule */}
      <VStack align="stretch" spacing={3} mb={4}>
        <Flex justify="space-between" align="center">
          <HStack>
            <Badge colorScheme={getStatusColor(job.status)}>
              {job.status || 'idle'}
            </Badge>
            <Badge colorScheme={job.isActive ? 'green' : 'gray'}>
              {job.isActive ? 'Activo' : 'Pausado'}
            </Badge>
          </HStack>

          <Tooltip label={job.schedule.cronExpression}>
            <HStack fontSize="xs" color="gray.600">
              <Icon as={FiClock} />
              <Text>{cronToHumanReadable(job.schedule.cronExpression)}</Text>
            </HStack>
          </Tooltip>
        </Flex>

        {job.lastExecution && (
          <Text fontSize="xs" color="gray.500">
            Última ejecución: {format(new Date(job.lastExecution), 'dd/MM/yyyy HH:mm')}
          </Text>
        )}
      </VStack>

      {/* Content Preview */}
      {job.type === 'message' && job.message && (
        <Box
          bg="gray.50"
          p={3}
          borderRadius="md"
          fontSize="sm"
          color="gray.700"
          noOfLines={2}
        >
          {job.message.body}
        </Box>
      )}

      {job.type === 'api' && job.apiConfig && (
        <Box
          bg="gray.50"
          p={3}
          borderRadius="md"
          fontSize="sm"
          color="gray.700"
        >
          <Text fontWeight="medium">{job.apiConfig.method}</Text>
          <Text fontSize="xs" noOfLines={1}>{job.apiConfig.url}</Text>
        </Box>
      )}
    </Box>
  );
};
```

---

## 8. Diseño UI/UX Premium

### 🎨 Principios de Diseño

1. **Claridad Visual**
   - Iconos grandes y reconocibles
   - Jerarquía tipográfica clara
   - Espaciado generoso

2. **Feedback Inmediato**
   - Animaciones suaves (Framer Motion)
   - Estados de carga visibles
   - Mensajes de error/éxito contextuales

3. **Flujo Guiado**
   - Wizard multi-step con progreso visible
   - Validación en tiempo real
   - Hints y tooltips informativos

4. **Responsive Design**
   - Grid adaptativo (auto-fill minmax)
   - Touch-friendly en móvil
   - Colapso de sidebars en tablets

### 🎭 Paleta de Colores

```typescript
// Basado en tema existente de Portal
const colors = {
  accent: {
    50: '#E3F2FD',
    500: '#2196F3',
    600: '#1976D2'
  },
  success: {
    500: '#4CAF50'
  },
  error: {
    500: '#F44336'
  },
  warning: {
    500: '#FF9800'
  },
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    500: '#9E9E9E',
    700: '#616161'
  }
};
```

### 📐 Componentes Visuales

#### **Status Badge**
```
✓ Success → Verde con icono check
✗ Error   → Rojo con icono X
⏸ Pausado → Gris con icono pausa
▶ Running → Amarillo con spinner
```

#### **Cards de CronJob**
```
┌─────────────────────────────────────────┐
│ 📧 Mensaje    [•••]                     │
│ Daily Alert                              │
│ CONSTROAD                                │
│                                          │
│ ✓ Activo  🕒 Todos los días a las 10:00│
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ 🤖 ConstRoadBot:                    │ │
│ │ Es Lunes...                         │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ Última ejecución: 03/02/2026 10:00     │
└─────────────────────────────────────────┘
```

#### **Wizard Steps**
```
○──────○──────○──────○──────○
1      2      3      4      5
Empresa Config Program Mencion Confirm
        (Activo)
```

---

## 9. Plan de Migración

### 📦 Script de Migración

```typescript
// Location: lila-app/scripts/migrate-cronjobs-to-mongo.ts

import fs from 'fs-extra';
import path from 'path';
import mongoose from 'mongoose';
import { CronJobModel } from '../../src/models/cronjob.model.js';
import { CompanyModel } from '../../src/models/company.model.js';
import logger from '../../src/utils/logger.js';

interface LegacyCronJob {
  id: string;
  name: string;
  url: string;
  cronExpression: string;
  company: 'constroad' | 'altavia';  // ← Hardcoded
  isActive: boolean;
  type?: 'api' | 'message';
  message?: {
    sender: string;
    chatId: string;
    body: string;
  };
  lastExecution?: string;
  status?: 'success' | 'error';
  history?: Array<any>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    failureCount: number;
    lastRun?: string;
    lastError?: string;
  };
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  timeout?: number;
}

async function migrate() {
  try {
    logger.info('[Migration] Starting cronjobs migration...');

    // 1. Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_SHARED_URI || '');
    logger.info('[Migration] Connected to MongoDB');

    // 2. Leer cronjobs.json
    const cronJobsPath = path.join(process.cwd(), 'data', 'cronjobs.json');
    const legacyJobs: LegacyCronJob[] = await fs.readJson(cronJobsPath);

    logger.info(`[Migration] Found ${legacyJobs.length} legacy jobs`);

    // 3. Resolver companyId dinámicamente
    const companies = await CompanyModel.find({}, { companyId: 1, name: 1 });
    const resolveCompanyId = (legacyCompany: string): string | null => {
      const key = legacyCompany.toLowerCase().trim();
      const exact = companies.find((c) => c.companyId.toLowerCase() === key);
      if (exact) return exact.companyId;
      const match = companies.find((c) =>
        c.name?.toLowerCase().includes(key)
      );
      return match ? match.companyId : null;
    };

    // 4. Migrar cada job
    let migrated = 0;
    let skipped = 0;

    for (const legacyJob of legacyJobs) {
      try {
        // Mapear company enum a companyId real
        const companyId = resolveCompanyId(legacyJob.company);

        if (!companyId) {
          logger.warn(`[Migration] Skipping job ${legacyJob.id}: unknown company ${legacyJob.company}`);
          skipped++;
          continue;
        }

        // Verificar que company existe
        const company = await CompanyModel.findOne({ companyId });
        if (!company) {
          logger.warn(`[Migration] Skipping job ${legacyJob.id}: company ${companyId} not found in DB`);
          skipped++;
          continue;
        }

        // Convertir a nuevo formato
        const resolvedType = legacyJob.type || (legacyJob.message ? 'message' : 'api');
        const legacyUrl = legacyJob.url?.trim() || '';

        const newJob = {
          companyId,
          name: legacyJob.name,
          type: resolvedType,
          isActive: legacyJob.isActive,

          message: legacyJob.message ? {
            sender: legacyJob.message.sender, // legacy
            chatId: legacyJob.message.chatId,
            body: legacyJob.message.body,
            mentions: []  // Nuevo campo vacío
          } : undefined,

          apiConfig: resolvedType === 'api' && legacyUrl ? {
            url: legacyUrl,
            method: 'GET'
          } : undefined,

          schedule: {
            cronExpression: legacyJob.cronExpression,
            timezone: 'America/Lima',
            lastRun: legacyJob.metadata?.lastRun
              ? new Date(legacyJob.metadata.lastRun)
              : (legacyJob.lastExecution ? new Date(legacyJob.lastExecution) : undefined)
          },

          retryPolicy: legacyJob.retryPolicy || {
            maxRetries: 3,
            backoffMultiplier: 2,
            currentRetries: 0
          },

          status: legacyJob.status || 'idle',
          lastExecution: legacyJob.lastExecution ? new Date(legacyJob.lastExecution) : undefined,
          failureCount: legacyJob.metadata?.failureCount || 0,
          lastError: legacyJob.metadata?.lastError,
          timeout: legacyJob.timeout ?? 30000,

          history: (legacyJob.history || []).map(h => ({
            status: h.status,
            timestamp: new Date(h.timestamp),
            error: h.error
          })),

          metadata: {
            createdAt: new Date(legacyJob.metadata.createdAt),
            updatedAt: new Date(legacyJob.metadata.updatedAt),
            legacyId: legacyJob.id,
            legacyCompany: legacyJob.company,
            tags: []
          }
        };

        // Insertar en MongoDB
        await CronJobModel.create(newJob);

        logger.info(`[Migration] Migrated job: ${legacyJob.name} (${legacyJob.id} -> ${companyId})`);
        migrated++;

      } catch (error) {
        logger.error(`[Migration] Error migrating job ${legacyJob.id}:`, error);
        skipped++;
      }
    }

    // 4. Crear backup del archivo original
    const backupPath = cronJobsPath + `.backup-${Date.now()}`;
    await fs.copy(cronJobsPath, backupPath);
    logger.info(`[Migration] Backup created at: ${backupPath}`);

    // 5. Resumen
    logger.info(`[Migration] Complete!`);
    logger.info(`  - Migrated: ${migrated}`);
    logger.info(`  - Skipped: ${skipped}`);
    logger.info(`  - Total: ${legacyJobs.length}`);

    // 6. Cerrar conexión
    await mongoose.disconnect();

    process.exit(0);

  } catch (error) {
    logger.error('[Migration] Fatal error:', error);
    process.exit(1);
  }
}

// Ejecutar
migrate();
```

### 🚀 Ejecución de Migración

```bash
# 1. Preparar
cd lila-app
npm install  # Asegurar dependencias

# 2. Verificar mapping automático de companies (dry-run)
npx tsx scripts/migrate-cronjobs-to-mongo.ts

# 3. Ejecutar migración
npx tsx scripts/migrate-cronjobs-to-mongo.ts --execute

# 4. Verificar resultados
# Check MongoDB: shared_db.cronjobs collection
# Check backup: data/backups/cronjobs.json.{timestamp}.bak

# 5. Probar en desarrollo
npm run dev

# 6. Si todo OK, desplegar en producción
```

---

## 10. Fases de Implementación

### 🏗️ Roadmap de Desarrollo

#### **FASE 1: Backend Foundation (Semana 1)**

**Objetivo:** Crear base de datos y APIs v2

- [ ] Crear modelo `cronjob.model.ts` en lila-app
- [ ] Implementar `JobSchedulerV2` (scheduler.service.v2.ts)
- [ ] Implementar `JobExecutor` (executor.service.ts)
- [ ] Crear controllers v2 (jobs.controller.v2.ts)
- [ ] Implementar middlewares (validateCompany, validateSender)
- [ ] Actualizar rutas (jobs.routes.v2.ts)
- [ ] Testing unitario de servicios

**Entregable:** APIs funcionando con MongoDB

---

#### **FASE 2: Migration Script (Semana 1-2)**

**Objetivo:** Migrar datos existentes

- [ ] Crear script de migración (migrate-cronjobs-to-mongo.ts)
- [ ] Mapear companies hardcoded a companyId real
- [ ] Ejecutar migración en dev
- [ ] Validar integridad de datos migrados
- [ ] Crear documentación de rollback

**Entregable:** Datos migrados exitosamente

---

#### **FASE 3: Frontend - Hooks y Utilidades (Semana 2)**

**Objetivo:** Preparar infraestructura frontend

- [ ] Crear `useCronJobs` hook
- [ ] Crear `useCompanies` hook actualizado
- [ ] Crear `useWhatsAppGroups` hook
- [ ] Actualizar `cronUtils.ts` con helpers nuevos
- [ ] Crear `cronValidation.ts` para validaciones client-side
- [ ] Actualizar modelo `cronJob.ts` en Portal

**Entregable:** Hooks y utilidades funcionales

---

#### **FASE 4: Frontend - Componentes Básicos (Semana 2-3)**

**Objetivo:** Crear componentes reutilizables

- [ ] `CompanySelector.tsx` (dropdown dinámico)
- [ ] `WhatsAppGroupSelector.tsx` (dropdown grupos)
- [ ] `CronScheduleBuilder.tsx` (mejorado)
- [ ] `MentionsSelector.tsx` (preparado, disabled)
- [ ] `CronJobPreview.tsx` (preview antes de crear)

**Entregable:** Componentes base funcionales

---

#### **FASE 5: Frontend - UI Premium (Semana 3)**

**Objetivo:** Rediseñar interfaz principal

- [x] Rediseñar `CronJobList.tsx` con cards premium
- [x] Crear `CronJobCard.tsx` con animaciones
- [x] Crear `CronJobFilters.tsx` (filtros avanzados)
- [x] Implementar stats bar (total, activos, errores)
- [x] Agregar animaciones con Framer Motion

**Entregable:** Listado premium funcional

---

#### **FASE 6: Frontend - Wizard (Semana 3-4)**

**Objetivo:** Crear flujo de creación guiado

- [x] Implementar `CronJobWizard.tsx` (multi-step)
- [x] STEP 1: Seleccionar empresa + validar sender
- [x] STEP 2: Configuración (tipo, mensaje/api, grupo + menciones disabled)
- [x] STEP 3: Programación (cron builder)
- [x] STEP 4: Preview y confirmación
- [x] Integrar con APIs de lila-app

**Entregable:** Wizard completo funcional

---

#### **FASE 7: Testing e Integración (Semana 4)**

**Objetivo:** Asegurar calidad

- [ ] Testing E2E de flujo completo (creación, edición, eliminación)
- [ ] Testing de validaciones (sender, límites, permisos)
- [x] Unit tests base: cronHelpers + validators (lila-app)
- [x] Unit tests: JobExecutor ejecuta message + api (lila-app)
- [ ] Testing de ejecución de cronjobs (message y api) en entorno real
- [ ] Testing de UI responsiva (mobile, tablet, desktop)
- [ ] Testing de performance (carga de 100+ cronjobs)
- [ ] Code review y refactoring

**Entregable:** Sistema testeado y estable

---

#### ✅ Checklist QA UI/Performance (Fase 7)

- Ejecutar seed de carga: `npx tsx scripts/seed-cronjobs.ts --companyId=constroad --count=120 --prefix=perf-cron --cleanup`
- Verificar render en 375px, 768px, 1024px y desktop (stats bar, filtros, cards, wizard)
- Validar scroll fluido con 100+ items y acciones (run/edit/delete)
- Confirmar que filtros siguen siendo responsivos con dataset grande

---

#### **FASE 8: Despliegue y Monitoreo (Semana 4-5)**

**Objetivo:** Deploy a producción

- [ ] Desplegar backend (lila-app) a staging
- [ ] Ejecutar migración en staging
- [ ] Desplegar frontend (Portal) a staging
- [ ] Testing en staging con datos reales
- [ ] Configurar monitoreo (logs, alerts)
- [ ] Desplegar a producción
- [ ] Monitoreo post-deploy (primeras 48h)

**Entregable:** Sistema en producción estable

---

#### **FASE 9: Preparación para Menciones (Futuro)**

**Objetivo:** Dejar base para siguiente feature

- [ ] Documentar cómo agregar lógica de menciones
- [ ] Preparar backend: actualizar `sendTextMessage` con menciones
- [ ] Preparar frontend: habilitar `MentionsSelector`
- [ ] Crear guía de implementación de menciones

**Entregable:** Roadmap para menciones

---

### ⏱️ Timeline Estimado

```
Semana 1: Backend + Migration           [====================] 100%
Semana 2: Frontend Hooks + Básicos      [====================] 100%
Semana 3: UI Premium + Wizard           [====================] 100%
Semana 4: Testing + Deploy              [====================] 100%
----------------------------------------
TOTAL: 4-5 semanas (Sprint de 1 mes)
```

---

## 11. Casos de Uso

### 📝 CU-001: Crear CronJob de Mensaje

**Actor:** Administrador de empresa

**Flujo:**
1. Usuario navega a `/admin/cron-jobs`
2. Click en "Nuevo CronJob"
3. **STEP 1:** Selecciona su empresa del dropdown
   - Sistema valida si tiene sender configurado
   - Si no: muestra error y botón "Ir a Configuración"
   - Si sí: muestra mensaje de éxito con número de sender
4. Click "Siguiente"
5. **STEP 2:** Selecciona tipo "Mensaje"
   - Sistema carga grupos de WhatsApp del sender
   - Usuario selecciona grupo del dropdown
   - Usuario escribe mensaje en TextArea
   - Preview del mensaje se muestra
6. Click "Siguiente"
7. **STEP 3:** Configura schedule
   - Usuario selecciona "Diario"
   - Configura hora: 10:00
   - Preview: "Todos los días a las 10:00"
8. Click "Siguiente"
9. **STEP 4:** (Menciones - skip por ahora)
   - Muestra mensaje "Próximamente"
10. Click "Siguiente"
11. **STEP 5:** Preview completo
    - Usuario revisa toda la configuración
    - Click "Crear CronJob"
12. Sistema guarda en MongoDB
13. Sistema programa con node-cron
14. Redirect a listado
15. Cronjob aparece en card

**Resultado Esperado:** CronJob creado y activo

---

### 📝 CU-002: Validación de Sender No Configurado

**Actor:** Administrador de empresa sin sender

**Flujo:**
1. Usuario navega a `/admin/cron-jobs`
2. Click en "Nuevo CronJob"
3. **STEP 1:** Selecciona su empresa
   - Sistema consulta `/api/companies/{id}/notifications`
   - Response: `{ sender: null, configured: false }`
   - Sistema muestra Alert de error:
     ```
     ⚠️ No hay sender configurado
     Esta empresa no tiene un número de WhatsApp configurado.
     Configure uno antes de crear cronjobs.
     [Ir a Configuración →]
     ```
   - Botón "Siguiente" está deshabilitado
4. Usuario click en "Ir a Configuración"
5. Redirect a `/admin/companies/{id}/settings`
6. Usuario configura sender en `whatsappConfig.sender`
7. Vuelve a `/admin/cron-jobs`
8. Ahora sí puede continuar

**Resultado Esperado:** Usuario guiado a configurar sender

---

### 📝 CU-003: Editar CronJob Existente

**Actor:** Administrador

**Flujo:**
1. Usuario ve listado de cronjobs
2. Click en menú "•••" de un cronjob
3. Click "Editar"
4. Wizard se abre con datos pre-cargados
5. Usuario modifica el grupo de WhatsApp (STEP 2)
6. Usuario modifica el horario (STEP 3)
7. Click "Actualizar CronJob"
8. Sistema actualiza en MongoDB
9. Sistema desprograma y reprograma con nueva configuración
10. Cronjob se actualiza en listado

**Resultado Esperado:** CronJob actualizado

---

### 📝 CU-004: Ejecutar CronJob Manualmente

**Actor:** Administrador

**Flujo:**
1. Usuario ve listado de cronjobs
2. Click en menú "•••" de un cronjob
3. Click "Ejecutar Ahora"
4. Sistema llama a `/api/jobs/{id}/run`
5. Backend ejecuta inmediatamente (sin esperar cron)
6. Si type=message: envía mensaje a grupo
7. Si type=api: llama a endpoint
8. Sistema actualiza historial
9. Card muestra status actualizado
10. Toast de éxito: "CronJob ejecutado correctamente"

**Resultado Esperado:** CronJob ejecutado manualmente

---

## 12. Consideraciones Técnicas

### 🔐 Seguridad

#### **Autenticación y Autorización**

```typescript
// Middleware para verificar permisos
// Location: Portal/src/middleware/cronJobAuth.ts

export const canManageCronJobs = (req, res, next) => {
  const user = req.session.user;

  // Solo admin y super-admin pueden gestionar cronjobs
  if (!['admin', 'super-admin'].includes(user.role)) {
    return res.status(403).json({
      ok: false,
      message: 'No tienes permisos para gestionar cronjobs'
    });
  }

  // Super-admin puede ver todas las empresas
  if (user.role === 'super-admin') {
    return next();
  }

  // Admin solo puede gestionar cronjobs de su empresa
  const { companyId } = req.body || req.query;

  if (companyId && companyId !== user.companyId) {
    return res.status(403).json({
      ok: false,
      message: 'No puedes gestionar cronjobs de otra empresa'
    });
  }

  next();
};
```

#### **Validación de Inputs**

- **Frontend:** Validación con Zod antes de submit
- **Backend:** Validación con Joi/Zod en controller
- **Sanitización:** Escapar caracteres especiales en mensajes
- **Rate Limiting:** Limitar creación de cronjobs a 10/hora por empresa

#### **Secrets Management**

- **NO hardcodear** tokens, API keys en cronjobs
- Usar variables de entorno o vault
- Para API jobs: permitir headers pero encriptar valores sensibles

---

### ⚡ Performance

#### **Optimización de Queries**

```typescript
// Índices en MongoDB
db.cronjobs.createIndex({ companyId: 1, isActive: 1 });
db.cronjobs.createIndex({ companyId: 1, type: 1 });
db.cronjobs.createIndex({ 'schedule.nextRun': 1 });

// Query optimizada para listado
CronJobModel.find({ companyId, isActive: true })
  .select('-history')  // Excluir historial pesado
  .sort({ 'metadata.createdAt': -1 })
  .limit(100);

// Para historial: query separada
CronJobModel.findById(id).select('history');
```

#### **Caching**

- **Frontend:** Cache de companies en localStorage (TTL: 5 min)
- **Frontend:** Cache de grupos de WhatsApp (TTL: 2 min)
- **Backend:** Cache de Company lookups en memoria (LRU cache)

#### **Paginación**

```typescript
// Para listados grandes
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 20;
const skip = (page - 1) * limit;

const jobs = await CronJobModel.find(filter)
  .skip(skip)
  .limit(limit);

const total = await CronJobModel.countDocuments(filter);

return {
  data: jobs,
  pagination: {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  }
};
```

---

### 🔄 Sincronización

#### **Problema:** Jobs programados en memoria se pierden en restart

**Solución:**

1. **Al iniciar lila-app:**
   - Cargar todos los jobs activos desde MongoDB
   - Re-programar con node-cron
   - Calcular `nextRun` para cada job

2. **Al crear/actualizar job:**
   - Guardar en MongoDB primero
   - Luego programar en memoria
   - Si falla programación: rollback en DB

3. **Graceful Shutdown:**
   - Al recibir SIGTERM/SIGINT:
   - Detener todos los cron tasks
   - Esperar ejecuciones en curso (timeout: 30s)
   - Desconectar de MongoDB
   - Exit

#### **Cálculo de nextRun**

```typescript
import cronParser from 'cron-parser';

function calculateNextRun(cronExpression: string, timezone: string): Date {
  const interval = cronParser.parseExpression(cronExpression, {
    currentDate: new Date(),
    tz: timezone
  });

  return interval.next().toDate();
}

// Actualizar en MongoDB
await CronJobModel.updateOne(
  { _id: jobId },
  { 'schedule.nextRun': calculateNextRun(cronExpression, timezone) }
);
```

---

### 📊 Monitoreo y Logging

#### **Logs Estructurados**

```typescript
// Formato de logs
logger.info('[JobScheduler]', {
  action: 'execute',
  jobId: job._id,
  companyId: job.companyId,
  type: job.type,
  duration: 1234,
  status: 'success'
});

// Alertas de error
logger.error('[JobScheduler]', {
  action: 'execute',
  jobId: job._id,
  error: error.message,
  stack: error.stack
});
```

#### **Métricas**

- **Total executions:** Contador por día
- **Success rate:** Porcentaje de éxito
- **Average duration:** Promedio de tiempo de ejecución
- **Failures by company:** Fallos agrupados por empresa

#### **Alertas**

- **Email/Slack:** Si cronjob falla 3 veces consecutivas
- **Dashboard:** Mostrar jobs con errores en UI
- **Webhook:** Notificar a company admin si su cronjob falla

---

### 🧪 Testing

#### **Unit Tests**

```typescript
// Example: Testing JobScheduler.createJob()
describe('JobScheduler.createJob', () => {
  it('should create job successfully', async () => {
    const data = {
      companyId: 'const-001',
      name: 'Test Job',
      type: 'message',
      message: { chatId: '123@g.us', body: 'Test' },
      schedule: { cronExpression: '0 10 * * *' },
      isActive: true
    };

    const job = await scheduler.createJob(data);

    expect(job).toBeDefined();
    expect(job.companyId).toBe('const-001');
  });

  it('should throw error if sender not configured', async () => {
    const data = { companyId: 'no-sender-company', ... };

    await expect(scheduler.createJob(data))
      .rejects
      .toThrow('does not have WhatsApp sender configured');
  });

  it('should validate cronjob limit', async () => {
    // Mock company con límite alcanzado
    // Intentar crear job
    // Expect error: "Cronjob limit reached"
  });
});
```

#### **Integration Tests**

```typescript
// Example: Testing API endpoints
describe('POST /api/jobs', () => {
  it('should create cronjob via API', async () => {
    const response = await request(app)
      .post('/api/jobs')
      .send({
        companyId: 'const-001',
        name: 'API Test Job',
        ...
      })
      .expect(201);

    expect(response.body.ok).toBe(true);
    expect(response.body.data).toHaveProperty('_id');
  });
});
```

#### **E2E Tests (Cypress)**

```typescript
describe('CronJob Creation Flow', () => {
  it('should create cronjob from wizard', () => {
    cy.visit('/admin/cron-jobs');
    cy.get('[data-cy=new-cronjob-button]').click();

    // Step 1: Select company
    cy.get('[data-cy=company-selector]').select('CONSTROAD');
    cy.get('[data-cy=next-button]').click();

    // Step 2: Configure
    cy.get('[data-cy=type-message]').click();
    cy.get('[data-cy=group-selector]').select('Grupo Planta');
    cy.get('[data-cy=message-body]').type('Test message');
    cy.get('[data-cy=next-button]').click();

    // Step 3: Schedule
    cy.get('[data-cy=schedule-daily]').click();
    cy.get('[data-cy=hour-input]').type('10');
    cy.get('[data-cy=next-button]').click();

    // Skip Step 4 (mentions)
    cy.get('[data-cy=next-button]').click();

    // Step 5: Confirm
    cy.get('[data-cy=create-button]').click();

    cy.url().should('include', '/admin/cron-jobs');
    cy.contains('Test message').should('be.visible');
  });
});
```

---

## 13. Testing y Validación

### ✅ Checklist de Aceptación

#### **Backend (lila-app)**

- [ ] Modelo `CronJob` creado en MongoDB
- [ ] APIs v2 funcionando (`/api/jobs/*`)
- [ ] Validación de `companyId` existe
- [ ] Validación de sender configurado
- [ ] Validación de límites de cronjobs
- [ ] JobScheduler carga jobs desde MongoDB
- [ ] Jobs se ejecutan según cronExpression
- [ ] Historial se guarda en MongoDB (últimos 50)
- [ ] Retry policy funciona correctamente
- [ ] Graceful shutdown detiene todos los jobs

#### **Frontend (Portal)**

- [ ] Listado premium de cronjobs funcional
- [ ] Filtros por company, tipo, estado
- [ ] Stats bar muestra totales correctos
- [ ] Wizard multi-step funciona
- [ ] Step 1: Dropdown dinámico de companies
- [ ] Step 1: Validación de sender muestra error
- [ ] Step 2: Dropdown dinámico de grupos WhatsApp
- [ ] Step 2: Preview de mensaje funciona
- [ ] Step 3: Cron builder genera expresión correcta
- [ ] Step 4: Menciones muestra "Próximamente"
- [ ] Step 5: Preview completo correcto
- [ ] Creación de cronjob exitosa
- [ ] Edición de cronjob funciona
- [ ] Eliminación con confirmación
- [ ] Toggle activo/pausado funciona
- [ ] Ejecutar manualmente funciona
- [ ] UI responsiva (mobile, tablet, desktop)
- [ ] Animaciones suaves (Framer Motion)

#### **Migración**

- [ ] Script de migración ejecuta sin errores
- [ ] Todos los jobs legacy migrados
- [ ] Mapping de companies correcto
- [ ] Backup del archivo JSON creado
- [ ] Jobs migrados funcionan en nuevo sistema

---

## 14. Apéndices

### A. Glosario

| Término | Definición |
|---------|------------|
| **CronJob** | Tarea programada que se ejecuta automáticamente según un schedule |
| **Sender** | Número de WhatsApp configurado en una empresa para enviar mensajes |
| **ChatId** | Identificador único de un grupo de WhatsApp (ej: `120363288945205546@g.us`) |
| **Cron Expression** | Expresión de 5 partes que define cuándo ejecutar un job (ej: `0 10 * * *`) |
| **Retry Policy** | Política de reintentos en caso de fallo (maxRetries, backoff) |
| **Multi-tenant** | Arquitectura donde múltiples empresas comparten la misma aplicación |
| **Shared_db** | Base de datos compartida que contiene datos de todas las empresas |

### B. Referencias

- **node-cron:** https://www.npmjs.com/package/node-cron
- **Baileys (WhatsApp Library):** https://github.com/WhiskeySockets/Baileys
- **Chakra UI:** https://chakra-ui.com/
- **Framer Motion:** https://www.framer.com/motion/
- **Mongoose:** https://mongoosejs.com/

### C. Estructura de Cron Expression

```
 ┌───────────── minute (0 - 59)
 │ ┌───────────── hour (0 - 23)
 │ │ ┌───────────── day of month (1 - 31)
 │ │ │ ┌───────────── month (1 - 12)
 │ │ │ │ ┌───────────── day of week (0 - 6) (0 = Sunday)
 │ │ │ │ │
 * * * * *

Ejemplos:
- 0 10 * * *       → Todos los días a las 10:00
- 30 14 * * 1      → Todos los lunes a las 14:30
- 0 0 1 * *        → Primer día de cada mes a las 00:00
- */15 * * * *     → Cada 15 minutos
- 0 9-17 * * 1-5   → De lunes a viernes, de 9am a 5pm (cada hora)
```

### D. Diagrama de Estados de CronJob

```
           ┌─────────┐
           │  IDLE   │ ← Estado inicial
           └────┬────┘
                │
        [cron trigger]
                │
                ▼
           ┌─────────┐
           │ RUNNING │ ← Ejecutando
           └────┬────┘
                │
       ┌────────┴────────┐
       │                 │
   [success]         [error]
       │                 │
       ▼                 ▼
  ┌─────────┐      ┌─────────┐
  │ SUCCESS │      │  ERROR  │
  └────┬────┘      └────┬────┘
       │                 │
       │          [retry < maxRetries]
       │                 │
       └────────┬────────┘
                │
          [wait for next]
                │
                ▼
           ┌─────────┐
           │  IDLE   │
           └─────────┘
```

---

## 📌 Notas Finales

### Prioridades de Implementación

1. **P0 (Crítico):**
   - Migrar a MongoDB
   - Eliminar hardcoding de companies
   - Validación de sender

2. **P1 (Alto):**
   - UI premium
   - Wizard multi-step
   - Filtros avanzados

3. **P2 (Medio):**
   - Animaciones
   - Stats dashboard
   - Historial detallado

4. **P3 (Bajo):**
   - Menciones (futuro)
   - Templates de mensajes
   - Webhooks de notificación

### Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Pérdida de datos en migración | Media | Alto | Backup antes de migrar, rollback plan |
| Sender no configurado en producción | Media | Medio | Validación pre-deploy, guía de configuración |
| Performance con 100+ jobs | Baja | Medio | Índices optimizados, paginación |
| Incompatibilidad con Baileys nueva versión | Baja | Alto | Pin version exacta (6.7.18) |

### Próximos Pasos (Post-Implementación)

1. **Menciones en Mensajes**
   - Selector de contactos
   - Formato de mención en WhatsApp (`@51987654321`)
   - Testing con grupos reales

2. **Templates de Mensajes**
   - Crear biblioteca de templates
   - Variables dinámicas ({{companyName}}, {{date}}, etc.)
   - Preview con datos reales

3. **Webhooks de Notificación**
   - Endpoint POST cuando job ejecuta
   - Payload con status, resultado, metadata
   - Integración con Slack/Discord

4. **Analytics Dashboard**
   - Gráficas de ejecuciones por día/semana/mes
   - Success rate por empresa
   - Tiempo promedio de ejecución
   - Jobs más utilizados

---

**FIN DE ESPECIFICACIÓN**

*Documento generado el 2026-02-03*
*Versión: 2.0.0*
*Autor: Sistema de Análisis Técnico para CONSTROAD*
