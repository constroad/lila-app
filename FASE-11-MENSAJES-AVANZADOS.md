# FASE 11: MENSAJES AVANZADOS

**Fecha:** 27 Enero 2026
**Estado:** ✅ Completado
**Duración:** 1 día

---

## 🎯 Objetivos Cumplidos

- ✅ Soporte de **menciones** en mensajes de texto
- ✅ Envío de **polls** (encuestas interactivas)
- ✅ **Menús de texto numerados** (alternativa a buttons deprecados)
- ✅ Integración con quotas y rate limiting

---

## 📋 Funcionalidades Implementadas

### 1. Mensajes con Menciones (@usuario)

Las APIs existentes ahora soportan menciones mediante el parámetro opcional `mentions`.

#### API Actualizada: `POST /api/messages/:sessionPhone/text`

**Request:**
```json
{
  "to": "51999999999",
  "message": "Hola @Juan y @Maria, les escribo para...",
  "mentions": ["51988888888", "51977777777"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "mentionsCount": 2
}
```

**Características:**
- ✅ Parámetro `mentions` opcional (array de teléfonos)
- ✅ Se normalizan automáticamente a formato JID
- ✅ Funciona en chats grupales
- ✅ Los usuarios mencionados reciben notificación especial

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:3001/api/messages/51949376824/text \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "51999999999@g.us",
    "message": "Hola @Juan, revisa este documento",
    "mentions": ["51988888888"]
  }'
```

---

### 2. Polls (Encuestas Interactivas)

Los polls son el reemplazo oficial de los buttons deprecados en WhatsApp.

#### API: `POST /api/messages/:sessionPhone/poll`

**Request - Single Choice (opción única):**
```json
{
  "to": "51999999999",
  "question": "¿Cuál es tu color favorito?",
  "options": ["Rojo", "Azul", "Verde", "Amarillo"],
  "selectableCount": 1
}
```

**Request - Multiple Choice (opciones múltiples):**
```json
{
  "to": "51999999999",
  "question": "Selecciona tus intereses (máximo 3)",
  "options": ["Deportes", "Música", "Tecnología", "Arte", "Cine", "Lectura"],
  "selectableCount": 3
}
```

**Response:**
```json
{
  "success": true,
  "message": "Poll sent successfully",
  "messageId": "3EB0C127D5B2C8E3E64D",
  "pollDetails": {
    "question": "¿Cuál es tu color favorito?",
    "optionsCount": 4,
    "selectableCount": 1
  }
}
```

**Validaciones:**
- ✅ Mínimo 2 opciones
- ✅ Máximo 12 opciones
- ✅ `selectableCount` entre 1 y número de opciones
- ✅ Si no se especifica `selectableCount`, default = 1

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:3001/api/messages/51949376824/poll \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "51999999999",
    "question": "¿Qué hora prefieres para la reunión?",
    "options": ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"],
    "selectableCount": 1
  }'
```

---

### 3. Menús de Texto Numerados

Alternativa simple a buttons cuando los polls no son apropiados.

#### API: `POST /api/messages/:sessionPhone/menu`

**Request:**
```json
{
  "to": "51999999999",
  "title": "Menú Principal",
  "options": [
    "Estado de Pedido",
    "Rastrear Entrega",
    "Contactar Soporte",
    "Cancelar Pedido"
  ],
  "footer": "Responde con el número de tu opción"
}
```

**Mensaje enviado:**
```
*Menú Principal*

1. Estado de Pedido
2. Rastrear Entrega
3. Contactar Soporte
4. Cancelar Pedido

Responde con el número de tu opción
```

**Response:**
```json
{
  "success": true,
  "message": "Text menu sent successfully",
  "menuDetails": {
    "title": "Menú Principal",
    "optionsCount": 4,
    "footer": "Responde con el número de tu opción"
  }
}
```

**Parámetros:**
- `title` (opcional): Título del menú
- `options` (requerido): Array de opciones
- `footer` (opcional): Texto al final, default = "_Reply with the number of your choice_"

**Manejo de respuestas del usuario:**

El usuario responderá con un número (1, 2, 3, etc.). Debes escuchar las respuestas en el listener de mensajes:

```typescript
// En connection.manager.ts o message.listener.ts
socket.ev.on('messages.upsert', async ({ messages }) => {
  const message = messages[0];

  if (!message.message?.conversation) return;

  const text = message.message.conversation.trim();
  const choice = parseInt(text);

  if (!isNaN(choice) && choice >= 1 && choice <= 4) {
    // Procesar elección del menú
    switch(choice) {
      case 1:
        await handleOrderStatus(message.key.remoteJid);
        break;
      case 2:
        await handleTrackDelivery(message.key.remoteJid);
        break;
      case 3:
        await handleContactSupport(message.key.remoteJid);
        break;
      case 4:
        await handleCancelOrder(message.key.remoteJid);
        break;
    }
  }
});
```

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:3001/api/messages/51949376824/menu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "51999999999",
    "title": "¿En qué puedo ayudarte?",
    "options": [
      "Información de producto",
      "Estado de mi pedido",
      "Hablar con un asesor"
    ]
  }'
```

---

## 🔧 Ejemplos de Integración

### Ejemplo 1: Encuesta de Satisfacción

```typescript
// Enviar encuesta después de completar un pedido
async function sendSatisfactionSurvey(phone: string) {
  const response = await fetch('http://localhost:3001/api/messages/51949376824/poll', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: phone,
      question: '¿Cómo calificarías nuestro servicio?',
      options: ['⭐ Excelente', '⭐⭐ Bueno', '⭐⭐⭐ Regular', '⭐⭐⭐⭐ Malo'],
      selectableCount: 1,
    }),
  });

  return response.json();
}
```

### Ejemplo 2: Menú de Opciones con Manejo de Respuesta

```typescript
// Enviar menú
async function sendServiceMenu(phone: string) {
  await fetch('http://localhost:3001/api/messages/51949376824/menu', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: phone,
      title: 'Servicios Disponibles',
      options: [
        'Concreto Premezclado',
        'Asfalto en Caliente',
        'Transporte de Material',
        'Asesoría Técnica',
      ],
    }),
  });
}

// Escuchar respuesta
socket.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  const text = msg.message?.conversation;
  const from = msg.key.remoteJid;

  const choice = parseInt(text);

  if (choice >= 1 && choice <= 4) {
    const services = [
      'Concreto Premezclado',
      'Asfalto en Caliente',
      'Transporte de Material',
      'Asesoría Técnica',
    ];

    await socket.sendMessage(from, {
      text: `Excelente elección! Has seleccionado: ${services[choice - 1]}. Un asesor te contactará pronto.`,
    });
  }
});
```

### Ejemplo 3: Mensaje con Menciones en Grupo

```typescript
// Notificar a múltiples usuarios en un grupo
async function notifyTeamInGroup(groupJid: string, userPhones: string[], message: string) {
  await fetch('http://localhost:3001/api/messages/51949376824/text', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: groupJid,
      message: `${message}\n\n@Juan @Maria @Pedro`,
      mentions: userPhones, // ['51988888888', '51977777777', '51966666666']
    }),
  });
}
```

---

## 📊 Integración con Quotas y Rate Limiting

Todas las nuevas APIs están integradas con:

- ✅ **Rate Limiting**: 30 mensajes/minuto por empresa
- ✅ **Quota Validation**: Valida límite mensual antes de enviar
- ✅ **Usage Tracking**: Incrementa contador en MongoDB después de enviar

**Middleware Stack:**
```
requireTenant → whatsappRateLimiter → requireWhatsAppQuota → sendPoll/sendTextMenu
```

---

## 🧪 Testing

### Test 1: Enviar Poll

```bash
# Obtener token de desarrollo
TOKEN=$(curl -X POST http://localhost:3001/api/dev/token \
  -H "Content-Type: application/json" \
  -d '{"companyId": "company-123"}' | jq -r '.token')

# Enviar poll
curl -X POST http://localhost:3001/api/messages/51949376824/poll \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "51999999999",
    "question": "¿Cuál es tu disponibilidad?",
    "options": ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
    "selectableCount": 2
  }'
```

### Test 2: Enviar Menú de Texto

```bash
curl -X POST http://localhost:3001/api/messages/51949376824/menu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "51999999999",
    "title": "Opciones de Servicio",
    "options": ["Nuevo Pedido", "Consultar Pedido", "Hablar con Ventas"]
  }'
```

### Test 3: Mensaje con Menciones

```bash
curl -X POST http://localhost:3001/api/messages/51949376824/text \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "51999999999@g.us",
    "message": "Equipo, @Juan necesita ayuda con el pedido #123",
    "mentions": ["51988888888"]
  }'
```

---

## ⚠️ Limitaciones Conocidas

### 1. Buttons Deprecados

**❌ No funciona:**
```typescript
// Buttons fueron deprecados en Mayo 2024
await socket.sendMessage(jid, {
  text: 'Select an option',
  buttons: [...] // ❌ No soportado en Baileys 6.4.0
});
```

**✅ Usar en su lugar:**
- **Polls** para opciones de selección
- **Menús de texto** para navegación

### 2. Polls - Limitaciones de WhatsApp

- Máximo 12 opciones por poll
- Mínimo 2 opciones
- El texto de la pregunta tiene límite de ~100 caracteres
- Cada opción tiene límite de ~30 caracteres
- No se pueden editar después de enviar

### 3. Menciones

- Solo funcionan en chats grupales
- En chats 1-1, las menciones se muestran como texto normal
- Los números deben estar registrados en WhatsApp

---

## 📄 Archivos Modificados

### Modificados
- ✅ `src/api/controllers/message.controller.ts`
  - Actualizado `sendTextMessage` con soporte de menciones
  - Añadido `sendPoll`
  - Añadido `sendTextMenu`

- ✅ `src/api/routes/message.routes.ts`
  - Añadido `POST /:sessionPhone/poll`
  - Añadido `POST /:sessionPhone/menu`

### Sin cambios
- ✅ `src/whatsapp/baileys/connection.manager.ts` (funciona como está)
- ✅ `src/middleware/quota.middleware.ts` (ya integrado)
- ✅ `src/middleware/company-rate-limiter.middleware.ts` (ya integrado)

---

## 🎓 Mejores Prácticas

### 1. Cuándo usar Polls vs Menús de Texto

**Usar Polls cuando:**
- ✅ Necesitas respuestas estructuradas
- ✅ Quieres ver estadísticas de respuestas
- ✅ Es una pregunta de opción múltiple clara
- ✅ Las opciones son fijas y limitadas

**Usar Menús de Texto cuando:**
- ✅ Necesitas navegación simple
- ✅ Las opciones pueden cambiar dinámicamente
- ✅ Quieres más control sobre el flujo
- ✅ Necesitas más de 12 opciones

### 2. Menciones en Grupos

```typescript
// ✅ Bueno: Mencionar usuarios relevantes
await sendTextMessage({
  to: groupJid,
  message: '@Pedro @Maria, el proyecto está listo para revisión',
  mentions: ['51988888888', '51977777777'],
});

// ❌ Malo: Mencionar a todos sin razón
await sendTextMessage({
  to: groupJid,
  message: 'Hola a todos @persona1 @persona2 @persona3...',
  mentions: [...30personas], // Spam
});
```

### 3. Manejo de Respuestas de Polls

WhatsApp envía las respuestas de polls como mensajes especiales. Asegúrate de escucharlos correctamente:

```typescript
socket.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];

  // Verificar si es respuesta de poll
  if (msg.message?.pollUpdateMessage) {
    const pollUpdate = msg.message.pollUpdateMessage;
    const selectedOptions = pollUpdate.vote?.selectedOptions || [];

    logger.info('User voted:', selectedOptions);

    // Procesar respuesta
    // ...
  }
});
```

---

## ✅ Build Status

```bash
npm run build
# ✅ Build completed successfully
```

---

## 🚀 Próximos Pasos

**Fase 12:** Migración de Módulos Existentes
- Migrar módulos de Portal a multi-tenant
- Actualizar hooks y componentes
- Tests de integración

---

**Fecha de última actualización:** 2026-01-27
**Estado:** ✅ Fase 11 completada
**Build:** ✅ Exitoso
