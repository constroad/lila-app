# 📝 RESUMEN: Eliminación de Redis - Fase 10 Refactorizada

**Fecha:** 27 Enero 2026
**Razón:** Simplificar arquitectura usando MongoDB como fuente única de verdad

---

## 🎯 Objetivo

Eliminar Redis de la Fase 10 y usar **solo MongoDB** para tracking de quotas, simplificando la arquitectura y eliminando la necesidad de sincronización entre dos sistemas.

---

## 🔄 Cambios Realizados

### 1. **Servicios Actualizados**

#### ✅ `src/services/quota-validator.service.ts`
**Cambios principales:**
- ❌ Eliminado import de `redisService`
- ✅ Ahora lee `usage` directamente de MongoDB (`company.subscription.usage`)
- ✅ Incrementa/decrementa usando `$inc` atómico de MongoDB
- ✅ Storage se almacena en GB (igual que en Portal)
- ✅ WhatsApp se almacena como número entero

**Antes (Redis):**
```typescript
const used = await redisService.getQuotaUsage(companyId, 'whatsapp');
await redisService.incrementQuota(companyId, 'whatsapp', 1);
```

**Ahora (MongoDB):**
```typescript
const used = company.subscription?.usage?.whatsappMessages || 0;
await this.CompanyModel.findOneAndUpdate(
  { companyId, isActive: true },
  { $inc: { 'subscription.usage.whatsappMessages': 1 } },
  { new: true }
);
```

#### ✅ `src/middleware/company-rate-limiter.middleware.ts`
**Cambios principales:**
- ❌ Eliminado Redis para rate limiting
- ✅ Implementado rate limiter **in-memory** usando `Map<string, RateLimitRecord>`
- ✅ Cleanup automático de registros expirados cada 5 minutos
- ✅ Funciona igual que antes pero sin dependencia externa

**Ventajas:**
- ✅ Más simple (sin dependencia de Redis)
- ✅ Suficiente para volúmenes bajos (<100 req/s)
- ⚠️ No distribuido (solo funciona con una instancia)

### 2. **Archivos Eliminados**

#### ❌ `src/services/redis.service.ts`
- **Eliminado completamente** (284 líneas)
- Ya no se necesita Redis para quotas ni rate limiting

### 3. **Dependencias Eliminadas**

#### `package.json`
```diff
- "redis": "^5.10.0",
- "redis-commander": "^0.9.0",
```

#### Scripts eliminados:
```diff
- "redis:ui": "bash scripts/start-redis-ui.sh",
```

### 4. **Configuración Actualizada**

#### `.env`
```diff
- # Redis Configuration (Fase 10)
- REDIS_HOST=localhost
- REDIS_PORT=6379
- REDIS_PASSWORD=
- REDIS_DB=0
- REDIS_URL=redis://localhost:6379
```

#### `src/config/environment.ts`
```diff
- // Redis (Quota tracking and rate limiting)
- redis: {
-   host: process.env.REDIS_HOST || 'localhost',
-   port: parseInt(process.env.REDIS_PORT || '6379', 10),
-   password: process.env.REDIS_PASSWORD || undefined,
-   db: parseInt(process.env.REDIS_DB || '0', 10),
-   url: process.env.REDIS_URL || undefined,
- },
```

### 5. **Inicialización Actualizada**

#### `src/index.ts`
**Antes:**
```typescript
// Inicializar Redis (Fase 10)
logger.info('Initializing Redis...');
const { redisService } = await import('./services/redis.service.js');
await redisService.connect();

// Inicializar QuotaValidator
await quotaValidatorService.connect();
```

**Ahora:**
```typescript
// Inicializar QuotaValidator (Fase 10 - MongoDB only)
logger.info('Initializing Quota Validator...');
const { quotaValidatorService } = await import('./services/quota-validator.service.js');
await quotaValidatorService.connect();
logger.info('✅ Quota Validator connected (MongoDB-only)');
```

---

## 📊 Arquitectura Actualizada

### Antes (Redis + MongoDB)
```
┌─────────────────────────────────────────┐
│              lila-app                    │
│                                          │
│  1. Validación: Redis (0.1ms)           │
│  2. Incremento: Redis INCR               │
│  3. Sync periódico: Redis → MongoDB     │ ❌ Dual storage
│                                          │
└──────────┬────────────────┬─────────────┘
           │                │
        Redis         Portal MongoDB
         ↓                  ↓
  quota:company-123   Company.usage ❌ (desactualizado)
```

### Ahora (Solo MongoDB) ✅
```
┌─────────────────────────────────────────┐
│              lila-app                    │
│                                          │
│  1. Validación: MongoDB (~10ms)         │
│  2. Incremento: MongoDB $inc (atómico)  │
│                                          │
└──────────────────┬──────────────────────┘
                   │
           Portal MongoDB
                   ↓
          Company.subscription.usage
            ✅ Fuente única de verdad
```

---

## ✅ Ventajas de MongoDB-Only

| Aspecto | Redis (antes) | MongoDB-only (ahora) |
|---------|---------------|----------------------|
| **Complejidad** | Alta (2 sistemas) | Baja (1 sistema) |
| **Consistencia** | Dual storage | Fuente única |
| **Sincronización** | Necesaria | No necesaria |
| **Costo** | Redis + MongoDB | Solo MongoDB |
| **Performance** | 0.1ms | ~10ms (suficiente) |
| **Simplicidad** | ❌ | ✅ |
| **Rate limiting** | Distribuido | In-memory |
| **Escalabilidad** | Múltiples instancias | Single instance |

---

## 🧪 Testing

### Verificar Quotas

```bash
# 1. Enviar mensaje WhatsApp (debe incrementar usage)
curl -X POST http://localhost:3001/api/messages/51949376824/text \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "51999999999", "message": "Test"}'

# 2. Verificar en MongoDB que se incrementó
mongo
> use shared_db
> db.companies.findOne({ companyId: "company-123" }, { "subscription.usage": 1 })
# Debe mostrar: { whatsappMessages: 1, storage: 0 }
```

### Verificar Rate Limiting

```bash
# Enviar 35 requests rápido (límite es 30/min)
for i in {1..35}; do
  curl -X POST http://localhost:3001/api/messages/51949376824/text \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"to": "51999999999", "message": "Test '$i'"}' &
done

# Las últimas 5 requests deben recibir 429 (Rate Limit Exceeded)
```

---

## 🚀 Deployment

### Desarrollo
```bash
# No necesitas iniciar Redis
npm run dev
```

### Producción
```bash
# Elimina Redis de docker-compose.yml si lo tenías
# Solo necesitas MongoDB

# Instalar dependencias (sin redis)
npm install

# Build
npm run build

# Start
npm start
```

---

## ⚠️ Limitaciones Conocidas

1. **Rate Limiting In-Memory**
   - ⚠️ No funciona en múltiples instancias (cada instancia tiene su propio contador)
   - ✅ Suficiente para single-instance deployment
   - 💡 Si necesitas múltiples instancias, considera usar Redis solo para rate limiting

2. **Performance vs Redis**
   - MongoDB: ~10ms por operación
   - Redis: ~0.1ms por operación
   - ✅ Para <100 req/s, MongoDB es suficiente

3. **Reset de Quotas**
   - ❌ No hay TTL automático (como Redis)
   - ✅ Puedes crear un cron job mensual para resetear quotas:
   ```javascript
   // Reset quotas al inicio de cada mes
   db.companies.updateMany(
     {},
     { $set: {
       'subscription.usage.whatsappMessages': 0,
       'subscription.usage.storage': 0
     }}
   );
   ```

---

## 📚 Archivos Modificados

### Modificados
- ✅ `src/services/quota-validator.service.ts` (MongoDB-only)
- ✅ `src/middleware/company-rate-limiter.middleware.ts` (In-memory)
- ✅ `src/config/environment.ts` (sin Redis config)
- ✅ `src/index.ts` (sin Redis init)
- ✅ `package.json` (sin Redis deps)
- ✅ `.env` (sin Redis vars)

### Eliminados
- ❌ `src/services/redis.service.ts`

### Sin cambios
- ✅ `src/middleware/quota.middleware.ts` (sigue funcionando igual)
- ✅ `src/models/company.model.ts` (sin cambios)
- ✅ `src/api/routes/*.ts` (sin cambios)
- ✅ `src/api/controllers/*.ts` (sin cambios)

---

## ✅ Build Status

```bash
npm run build
# ✅ Build completed successfully
```

---

## 🎓 Conclusión

**Decisión correcta:** Para CONSTROAD, que tiene:
- ✅ Volumen bajo de mensajes (<100/s)
- ✅ Una sola instancia de lila-app
- ✅ Prioridad en simplicidad

**MongoDB-only es la mejor opción.**

Si en el futuro necesitas escalar a múltiples instancias, podrías:
1. Re-introducir Redis **solo para rate limiting** (más simple que quotas)
2. Usar MongoDB como source of truth para quotas
3. Redis solo como cache opcional

---

**Fecha de actualización:** 2026-01-27
**Estado:** ✅ Completado
**Build:** ✅ Exitoso
