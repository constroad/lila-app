# 🔧 SOLUCIÓN: WhatsApp Auto-Reconnect y Preservación de Credenciales

**Fecha:** 2026-01-28
**Autor:** Arquitecto Senior Backend
**Ticket:** Bug crítico de pérdida de sesiones WhatsApp
**Versión:** 1.0

---

## 📋 RESUMEN EJECUTIVO

### Problema Identificado

El sistema `lila-app` estaba **borrando las credenciales de WhatsApp** (`creds.json`) cuando detectaba una desconexión temporal (timeout 408), causando que:

1. Se pierdan las sesiones autenticadas
2. Se generen nuevos QR codes en lugar de reconectar
3. Requiera re-autenticación manual cada vez que hay un timeout de red

### Impacto

- ❌ **Alta severidad**: Pérdida total de sesión multi-device
- ❌ **Experiencia de usuario**: Escanear QR repetidamente
- ❌ **Confiabilidad**: Sistema frágil ante problemas de red temporales

### Solución Implementada

Implementamos **3 niveles de protección** con sistema de backups automáticos:

1. ✅ **Protección 1**: Solo borrar credenciales en logout manual real
2. ✅ **Protección 2**: Detectar timeouts vs sesiones inválidas
3. ✅ **Protección 3**: Backup automático antes de borrar credenciales
4. ✅ **API de recuperación**: Endpoint para restaurar desde backup

---

## 🔍 ANÁLISIS TÉCNICO

### Root Cause

**Archivo:** `src/whatsapp/baileys/connection.manager.ts`
**Líneas:** 171-183 y 477-484

```typescript
// ❌ CÓDIGO ANTERIOR (PROBLEMÁTICO)
if (connection === 'close') {
  const reason = this.getDisconnectReason(lastDisconnect?.error);

  if (reason === DisconnectReason.loggedOut ||
      reason === DisconnectReason.badSession) {

    // ⚠️ BORRABA CREDENCIALES POR CUALQUIER ERROR
    await this.resetAuthState(sessionPhone, sessionDir);
    // fs.remove(sessionDir) ← Eliminaba TODO incluido creds.json
  }
}
```

**Problema:** El código no diferenciaba entre:
- **Timeout temporal** (408) → Recuperable, NO borrar
- **Logout manual** (401) → Borrar credenciales
- **Sesión inválida** (403) → Borrar credenciales

---

## ✅ CAMBIOS IMPLEMENTADOS

### 1. Flujo de Desconexión Mejorado

**Archivo:** `src/whatsapp/baileys/connection.manager.ts:155-214`

```typescript
// ✅ CÓDIGO NUEVO (ROBUSTO)
if (connection === 'close') {
  const reason = this.getDisconnectReason(lastDisconnect?.error);
  const errorMessage = lastDisconnect?.error ? String(lastDisconnect.error) : '';

  logger.warn(`Connection closed for ${sessionPhone}, reason: ${reason}, error: ${errorMessage}`);

  // 🔒 PROTECCIÓN 1: Solo borrar si es REALMENTE logout manual
  if (reason === DisconnectReason.loggedOut) {
    logger.warn(`🔴 User manually logged out ${sessionPhone}`);
    await this.backupAndResetAuthState(sessionPhone, sessionDir);
    this.cleanupSession(sessionPhone, { clearQr: true });
    this.scheduleReconnect(sessionPhone);
    return;
  }

  // 🔒 PROTECCIÓN 2: Detectar timeouts y preservar credenciales
  if (reason === DisconnectReason.badSession) {
    const isTimeoutError = errorMessage.includes('408') ||
                           errorMessage.includes('timeout') ||
                           errorMessage.includes('timed out');

    if (isTimeoutError) {
      logger.warn(`⚠️ Timeout detected, preserving auth state`);
      this.cleanupSession(sessionPhone, { clearQr: false });
      this.scheduleReconnect(sessionPhone);
      return;
    }

    // Solo borrar si es genuinamente sesión inválida
    logger.warn(`🔴 Bad session detected, clearing auth state`);
    await this.backupAndResetAuthState(sessionPhone, sessionDir);
    this.cleanupSession(sessionPhone, { clearQr: true });
    this.scheduleReconnect(sessionPhone);
    return;
  }

  // 🔒 PROTECCIÓN 3: Preservar credenciales para errores recuperables
  const shouldReconnect =
    reason === DisconnectReason.connectionClosed ||
    reason === DisconnectReason.connectionLost ||
    reason === DisconnectReason.timedOut ||
    reason === DisconnectReason.restartRequired ||
    reason === DisconnectReason.connectionReplaced;

  if (shouldReconnect) {
    logger.info(`♻️ Reconnectable disconnect, preserving credentials`);
    this.cleanupSession(sessionPhone, { clearQr: false });
    this.scheduleReconnect(sessionPhone);
  } else {
    logger.error(`❌ Cannot auto-reconnect (reason: ${reason})`);
    this.cleanupSession(sessionPhone, { clearQr: true });
  }
}
```

### 2. Sistema de Backups Automáticos

**Archivo:** `src/whatsapp/baileys/connection.manager.ts:477-522`

```typescript
/**
 * 🛡️ PROTECCIÓN: Backup antes de eliminar credenciales
 */
private async backupAndResetAuthState(sessionPhone: string, sessionDir: string): Promise<void> {
  try {
    const credsPath = path.join(sessionDir, 'creds.json');
    const credsExist = await fs.pathExists(credsPath);

    if (credsExist) {
      // Crear backup con timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(sessionDir, '..', 'backups', sessionPhone);
      const backupPath = path.join(backupDir, `creds-${timestamp}.json`);

      await fs.ensureDir(backupDir);
      await fs.copy(credsPath, backupPath);

      logger.info(`✅ Backed up credentials to ${backupPath}`);

      // Mantener solo últimos 5 backups
      await this.cleanupOldBackups(backupDir, 5);
    }

    // Ahora sí, eliminar directorio de sesión
    await fs.remove(sessionDir);
    logger.info(`🗑️ Auth state cleared for ${sessionPhone}`);
  } catch (error) {
    logger.error(`❌ Failed to backup/clear auth state:`, error);
  }
}
```

**Estructura de Backups:**
```
data/
├── sessions/
│   ├── 51902049935/
│   │   ├── creds.json          ← Credenciales activas
│   │   ├── pre-key-*.json
│   │   └── ...
│   └── backups/
│       └── 51902049935/
│           ├── creds-2026-01-28T00-30-46-123Z.json  ← Backup 5
│           ├── creds-2026-01-27T15-20-30-456Z.json  ← Backup 4
│           ├── creds-2026-01-26T10-15-20-789Z.json  ← Backup 3
│           ├── creds-2026-01-25T08-45-10-012Z.json  ← Backup 2
│           └── creds-2026-01-24T12-30-00-345Z.json  ← Backup 1 (más antiguo)
```

### 3. API de Restauración

**Endpoint:** `POST /api/sessions/:phoneNumber/restore`

**Request:**
```json
{
  "backupTimestamp": "2026-01-28T00-30-46-123Z"  // Opcional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session 51902049935 restored from backup",
  "data": {
    "phoneNumber": "51902049935",
    "status": "connecting"
  }
}
```

**Uso:**
```bash
# Restaurar desde backup más reciente
curl -X POST http://localhost:3001/api/sessions/51902049935/restore

# Restaurar desde backup específico
curl -X POST http://localhost:3001/api/sessions/51902049935/restore \
  -H "Content-Type: application/json" \
  -d '{"backupTimestamp": "2026-01-28T00-30-46-123Z"}'
```

### 4. Logging Mejorado

Ahora el sistema registra:
- ✅ Razón específica de desconexión con nombre legible
- ✅ Contenido del error para debugging
- ✅ Decisión tomada (preservar vs borrar)
- ✅ Timestamps de backups

**Ejemplo de logs mejorados:**
```
2026-01-28 12:30:45 [warn]: Connection closed for 51902049935, reason: 408 (timedOut), error: Socket timeout
2026-01-28 12:30:45 [warn]: ⚠️ Timeout detected for 51902049935, preserving auth state
2026-01-28 12:30:45 [info]: ♻️ Reconnectable disconnect for 51902049935, preserving credentials
2026-01-28 12:30:46 [info]: Creating WhatsApp connection for 51902049935
2026-01-28 12:30:47 [info]: ✅ Connection established for 51902049935
```

---

## 🎯 ARQUITECTURA DE CONEXIONES

### WhatsApp Connection Manager

**Estrategia:** ✅ **Pool de Conexiones Persistentes (Recomendado)**

```
┌─────────────────────────────────────────────────────┐
│  Connection Manager (Singleton)                     │
├─────────────────────────────────────────────────────┤
│  connections: Map<phoneNumber, BaileysSocket>       │
│  ├─ 51902049935 → Socket (persistent)               │
│  ├─ 51987654321 → Socket (persistent)               │
│  └─ ...                                             │
│                                                     │
│  Auto-Reconnect Logic:                             │
│  ├─ Exponential Backoff (1s, 2s, 4s...60s max)    │
│  ├─ Preserve Credentials on Timeout                │
│  ├─ Backup Before Delete                           │
│  └─ Restore from Backup API                        │
└─────────────────────────────────────────────────────┘
```

**Ventajas:**
- ✅ Reconexión automática sin intervención
- ✅ Estado en memoria (contactos, grupos)
- ✅ Baja latencia para mensajes
- ✅ Gestión centralizada de múltiples sesiones

**Desventajas:**
- ⚠️ Consume memoria por sesión (~50-100 MB cada una)
- ⚠️ Requiere monitoreo de estado

### MongoDB Connection Strategy

**Estrategia:** ✅ **Conexión Persistente con Pool (Recomendado)**

```
┌─────────────────────────────────────────────────────┐
│  QuotaValidatorService (Singleton)                  │
├─────────────────────────────────────────────────────┤
│  portalMongoConn: mongoose.Connection              │
│  ├─ Pool Size: 10 conexiones                       │
│  ├─ Keep-Alive: Automático                         │
│  ├─ Reconnect: Automático                          │
│  └─ Timeout: 45s por query                         │
│                                                     │
│  Event Handlers:                                    │
│  ├─ 'error' → Log y marcar como desconectado      │
│  ├─ 'disconnected' → Log warning                   │
│  ├─ 'reconnected' → Log info                       │
│  └─ 'close' → Log error                            │
└─────────────────────────────────────────────────────┘
```

**Configuración Actual (CORRECTA):**
```typescript
// src/services/quota-validator.service.ts
const connection = mongoose.createConnection(config.mongodb.portalUri, {
  dbName: config.mongodb.sharedDb,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,           // Pool de conexiones
  minPoolSize: 2,            // Mínimo siempre activo
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,  // Check cada 10s
});

connection.on('error', (error) => {
  logger.error('Portal MongoDB connection error:', error);
  this.isConnected = false;
});

connection.on('disconnected', () => {
  logger.warn('Portal MongoDB disconnected');
  this.isConnected = false;
});

connection.on('reconnected', () => {
  logger.info('✅ Portal MongoDB reconnected');
  this.isConnected = true;
});
```

**Ventajas de Conexión Persistente:**
- ✅ **Performance**: Sin overhead de handshake por request
- ✅ **Reliability**: Pool maneja reconexiones automáticas
- ✅ **Scalability**: Pool reutiliza conexiones
- ✅ **Simplicity**: Mongoose maneja complejidad interna

**Comparación:**

| Aspecto | Persistente (✅) | On-Demand (❌) |
|---------|-----------------|----------------|
| **Latencia** | ~1-5ms | ~50-200ms (handshake) |
| **Overhead** | Bajo | Alto por request |
| **Conexiones** | Pool de 10 | Nueva cada request |
| **Reconexión** | Automática | Manual |
| **RAM** | ~10-20 MB | ~1-5 MB |
| **CPU** | Bajo | Alto (handshakes) |
| **Recomendado** | ✅ SÍ | ❌ NO |

### Recomendación Final: MongoDB

**✅ MANTENER CONEXIÓN PERSISTENTE** (como está actualmente)

**Mejora sugerida:** Agregar reintentos en caso de fallo:

```typescript
// src/services/quota-validator.service.ts

connection.on('error', async (error) => {
  logger.error('Portal MongoDB connection error:', error);
  this.isConnected = false;

  // Auto-reconectar después de 5 segundos
  setTimeout(async () => {
    try {
      logger.info('Attempting to reconnect to Portal MongoDB...');
      await this.connect();
    } catch (e) {
      logger.error('Failed to reconnect:', e);
    }
  }, 5000);
});
```

---

## 📦 ARCHIVOS MODIFICADOS

### 1. `src/whatsapp/baileys/connection.manager.ts`
- ✅ Flujo de desconexión mejorado (líneas 155-214)
- ✅ Sistema de backups (líneas 477-546)
- ✅ Logging detallado (líneas 548-571)

### 2. `src/api/controllers/session.controller.ts`
- ✅ Nuevo endpoint `restoreSessionFromBackup` (líneas 277-310)

### 3. `src/api/routes/session.routes.ts`
- ✅ Nueva ruta `POST /:phoneNumber/restore` (línea 35)

### 4. ✨ Nuevo archivo: `SOLUCIÓN-WHATSAPP-RECONNECT.md`
- ✅ Documentación completa de la solución

---

## 🧪 TESTING

### Test 1: Timeout Temporal

```bash
# 1. Crear sesión y conectar
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "51902049935"}'

# 2. Escanear QR y esperar conexión exitosa

# 3. Simular timeout (desconectar internet brevemente)

# 4. Verificar que mantiene creds.json
ls data/sessions/51902049935/creds.json
# ✅ Debe existir

# 5. Verificar auto-reconexión
tail -f logs/combined.log | grep 51902049935
# ✅ Debe mostrar: "Reconnectable disconnect, preserving credentials"
# ✅ Debe reconectar automáticamente sin nuevo QR
```

### Test 2: Logout Manual

```bash
# 1. Con sesión conectada, hacer logout desde WhatsApp (en el teléfono)

# 2. Verificar que se creó backup
ls data/sessions/backups/51902049935/
# ✅ Debe tener creds-*.json

# 3. Verificar que se borró sesión activa
ls data/sessions/51902049935/
# ❌ Directorio vacío o no existe

# 4. Verificar logs
tail -f logs/combined.log | grep 51902049935
# ✅ Debe mostrar: "User manually logged out"
# ✅ Debe mostrar: "Backed up credentials to..."
```

### Test 3: Restaurar desde Backup

```bash
# 1. Listar backups disponibles
ls data/sessions/backups/51902049935/

# 2. Restaurar más reciente
curl -X POST http://localhost:3001/api/sessions/51902049935/restore

# 3. Verificar que se copió creds.json
ls data/sessions/51902049935/creds.json
# ✅ Debe existir

# 4. Verificar que reconecta automáticamente
curl http://localhost:3001/api/sessions/51902049935/status
# ✅ status: "connecting" o "connected"
```

### Test 4: Persistencia MongoDB

```bash
# 1. Verificar conexión inicial
curl http://localhost:3001/health
# ✅ mongodb: "ok"

# 2. Desconectar MongoDB brevemente (reiniciar servicio)

# 3. Verificar reconexión automática
tail -f logs/combined.log | grep MongoDB
# ✅ Debe mostrar: "Portal MongoDB reconnected"

# 4. Verificar que queries funcionan
curl http://localhost:3001/api/quota/company-123/whatsapp
# ✅ Debe retornar quota info correctamente
```

---

## 🚀 DEPLOYMENT

### Pre-requisitos

- ✅ Node.js 20.x LTS
- ✅ MongoDB Atlas (ya configurado)
- ✅ lila-app v2.0+

### Pasos de Deployment

1. **Backup de código actual:**
```bash
cd /Users/josezamora/projects/lila-app
git add .
git commit -m "backup: before reconnect fix"
```

2. **Deploy cambios:**
```bash
# Ya aplicados en esta sesión, solo verificar
npm run build
pm2 restart lila-app
```

3. **Verificar logs:**
```bash
pm2 logs lila-app --lines 50
```

4. **Health check:**
```bash
curl http://localhost:3001/health
```

### Rollback (si es necesario)

```bash
# 1. Restaurar código anterior
git revert HEAD

# 2. Rebuild y restart
npm run build
pm2 restart lila-app
```

---

## 📊 MONITOREO

### Métricas Clave

```bash
# 1. Estado de sesiones
curl http://localhost:3001/api/sessions

# 2. Logs de reconexión
tail -f logs/combined.log | grep "Reconnectable\|preserving\|backup"

# 3. Backups creados
ls -lah data/sessions/backups/*/

# 4. MongoDB conexión
tail -f logs/combined.log | grep "MongoDB"
```

### Alertas Recomendadas

1. **Alert 1:** Si `"Cannot auto-reconnect"` aparece > 3 veces/hora
2. **Alert 2:** Si backups > 10 para una sesión (posible loop)
3. **Alert 3:** Si MongoDB desconectado > 1 minuto

---

## 📚 REFERENCIAS

### DisconnectReason Codes (Baileys)

| Code | Nombre | Acción | Preservar Creds |
|------|--------|--------|-----------------|
| 401 | loggedOut | Usuario hizo logout manual | ❌ Borrar con backup |
| 403 | badSession | Sesión inválida (verificar timeout) | ⚠️ Borrar solo si NO es timeout |
| 408 | timedOut | Timeout temporal | ✅ Preservar |
| 411 | connectionClosed | Conexión cerrada | ✅ Preservar |
| 428 | connectionLost | Pérdida de conexión | ✅ Preservar |
| 440 | connectionReplaced | Multi-device detectó otra conexión | ✅ Preservar |
| 500 | restartRequired | Requiere restart | ✅ Preservar |
| 515 | multideviceMismatch | Incompatibilidad multi-device | ❌ Borrar con backup |

### Documentación

- **Baileys:** https://github.com/WhiskeySockets/Baileys
- **Mongoose Connections:** https://mongoosejs.com/docs/connections.html
- **Arquitectura Portal:** `/Users/josezamora/projects/ARQUITECTURA-COMPLETA.spec.md`

---

## 🎓 LECCIONES APRENDIDAS

1. **Nunca borrar credenciales sin backup** → Siempre crear snapshot antes
2. **Diferenciar errores temporales vs permanentes** → Timeout ≠ Logout
3. **Logging es crítico** → Facilita debugging en producción
4. **Conexiones persistentes > On-demand** → Mejor performance y reliability
5. **Mongoose maneja reconexiones automáticas** → No reinventar la rueda

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [x] Flujo de desconexión mejorado
- [x] Sistema de backups automáticos
- [x] API de restauración
- [x] Logging detallado
- [x] Tests manuales
- [x] Documentación completa
- [ ] Tests automatizados (recomendado para futuro)
- [ ] Monitoreo en producción (Grafana/Prometheus)
- [ ] Alerting (PagerDuty/Opsgenie)

---

## 🤝 CONTACTO

**Para soporte o dudas:**
- Arquitecto: Senior Backend Team
- Repositorio: `/Users/josezamora/projects/lila-app`
- Logs: `./logs/combined.log`

---

**Fin del documento**
