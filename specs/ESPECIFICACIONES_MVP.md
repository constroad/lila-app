# Proyecto: WhatsApp API con Agente IA - Especificación Técnica

## 📋 Descripción General

Sistema de gestión de WhatsApp multi-sesión con agente conversacional de IA, gestión de cron jobs, generación de PDFs dinámicos y capacidades de mensajería omnicanal. Diseñado para ser escalable, resiliente y de alto rendimiento.

---

## 🎯 Objetivos del Sistema

- **Multi-sesión WhatsApp**: Gestión concurrente de múltiples cuentas de WhatsApp usando Baileys
- **Agente Conversacional IA**: Bot inteligente con respuestas naturales y timing humano
- **Automatización**: Sistema de cron jobs configurable para tareas programadas
- **Generación de Documentos**: Sistema de templates PDF con datos dinámicos
- **Resiliencia**: Auto-recuperación ante fallos y persistencia de estado
- **Escalabilidad**: Arquitectura preparada para crecimiento horizontal

---

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico Principal

```typescript
// Core
- Runtime: Node.js 20+ (LTS)
- Lenguaje: TypeScript 5+
- Framework: Express.js con TypeScript estricto

// WhatsApp
- Baileys: Última versión estable
- QRCode: qrcode-terminal + qrcode (para generación PNG)

// Storage & Persistence
- JSON local con atomic writes (fs-extra)
- Backup automático rotativo
- SQLite como alternativa para alta concurrencia (opcional)

// Scheduling
- node-cron: Gestión de cron jobs
- Persistencia en JSON con validación de expresiones cron

// PDF Generation
- puppeteer: Generación de PDFs desde HTML/templates
- handlebars: Motor de templates
- pdf-lib: Manipulación de PDFs existantes

// AI Agent
- Anthropic Claude API (Sonnet 4.5)
- Flujo conversacional con gestión de contexto
- Rate limiting y retry logic

// Monitoring & Health
- Winston: Logging estructurado
- PM2: Process manager con auto-restart
- Health checks endpoint
```

### Estructura de Directorios

```
project-root/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── jobs.routes.ts
│   │   │   ├── session.routes.ts
│   │   │   ├── message.routes.ts
│   │   │   └── pdf.routes.ts
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   │   ├── errorHandler.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── validator.ts
│   │   └── swagger/
│   ├── whatsapp/
│   │   ├── baileys/
│   │   │   ├── connection.manager.ts
│   │   │   ├── session.handler.ts
│   │   │   └── message.handler.ts
│   │   ├── ai-agent/
│   │   │   ├── agent.service.ts
│   │   │   ├── conversation.manager.ts
│   │   │   ├── message.listener.ts
│   │   │   ├── prompts/
│   │   │   │   └── asphalt-sales.prompt.ts
│   │   │   └── typing-simulator.ts
│   │   └── queue/
│   │       └── message.queue.ts
│   ├── jobs/
│   │   ├── scheduler.service.ts
│   │   ├── job.executor.ts
│   │   └── job.storage.ts
│   ├── pdf/
│   │   ├── generator.service.ts
│   │   ├── templates/
│   │   └── filler.service.ts
│   ├── storage/
│   │   ├── json.store.ts
│   │   ├── backup.service.ts
│   │   └── sync.service.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── retry.ts
│   │   └── validators.ts
│   └── config/
│       ├── environment.ts
│       └── constants.ts
├── data/
│   ├── sessions/
│   ├── conversations/
│   ├── cronjobs.json
│   ├── contacts.json
│   ├── groups.json
│   └── backups/
├── templates/
│   └── pdf/
├── logs/
├── uploads/
└── ecosystem.config.js (PM2)
```

---

## 🔧 Especificaciones Técnicas Detalladas

### 1. Sistema de Multi-Sesión WhatsApp

#### 1.1 Gestión de Conexiones

```typescript
interface SessionConfig {
  phoneNumber: string;
  sessionId: string;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  qrTimeout: number;
}

class ConnectionManager {
  // Pool de conexiones activas
  // Recuperación automática ante desconexiones
  // Gestión de QR codes con expiración
  // Lock system para evitar conexiones duplicadas
}
```

**Características:**
- **Conexión simultánea**: Hasta N sesiones en paralelo (configurable)
- **Auto-reconexión**: Sistema de backoff exponencial (1s, 2s, 4s, 8s, max 60s)
- **QR Code**: Generación en PNG y terminal, expiración automática (60s)
- **Estado persistente**: Auth state guardado en `data/sessions/{phoneNumber}/`
- **Heartbeat**: Ping cada 30s para detectar conexiones muertas

#### 1.2 Almacenamiento de Sesión

```typescript
// Estructura de archivos por sesión
data/sessions/{phoneNumber}/
  ├── creds.json           // Credenciales encriptadas
  ├── auth-state.json      // Estado de autenticación
  ├── keys.json            // Claves de sesión
  └── metadata.json        // Metadatos (última conexión, etc.)
```

**Seguridad:**
- Encriptación AES-256 de credenciales sensibles
- Variables de entorno para secrets
- Rate limiting por sesión

### 2. Sistema de Cron Jobs

#### 2.1 Estructura de Datos

```typescript
interface CronJob {
  id: string;                    // UUID
  name: string;
  url: string;                   // Endpoint a ejecutar
  cronExpression: string;        // Expresión cron validada
  company: 'constroad' | 'altavia';
  isActive: boolean;
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastRun?: string;
    nextRun?: string;
    failureCount: number;
    lastError?: string;
  };
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  timeout: number;               // Timeout en ms
}
```

#### 2.2 Funcionalidades

- **Validación**: Verificación de expresiones cron antes de guardar
- **Ejecución manual**: Endpoint POST `/api/jobs/{id}/run`
- **Historial**: Log de últimas 100 ejecuciones por job
- **Notificaciones**: Webhook en caso de fallo repetido
- **Hot reload**: Recarga de jobs sin reiniciar servidor

#### 2.3 Persistencia

```json
// data/cronjobs.json
{
  "version": "1.0",
  "lastModified": "2025-12-28T10:30:00Z",
  "jobs": [
    {
      "id": "uuid-123",
      "name": "Sync contacts daily",
      "cronExpression": "0 2 * * *",
      // ... resto de campos
    }
  ]
}
```

**Backup automático:**
- Cada modificación crea backup en `data/backups/cronjobs/`
- Retención: últimos 7 días
- Validación de integridad con checksums

### 3. Agente Conversacional IA con Listener de Mensajes

#### 3.1 Sistema de Escucha de Mensajes

```typescript
// src/whatsapp/ai-agent/message.listener.ts

class MessageListener {
  private activeConversations: Map<string, Conversation>;
  
  constructor(
    private whatsappClient: WhatsAppClient,
    private agentService: AgentService,
    private conversationManager: ConversationManager
  ) {
    this.setupMessageHandler();
  }
  
  private setupMessageHandler() {
    this.whatsappClient.on('messages.upsert', async (message) => {
      await this.handleIncomingMessage(message);
    });
  }
  
  private async handleIncomingMessage(message: any) {
    // 1. Filtrar mensajes propios
    if (message.key.fromMe) return;
    
    // 2. Extraer información del remitente
    const chatId = message.key.remoteJid;
    const messageText = message.message?.conversation || 
                       message.message?.extendedTextMessage?.text;
    
    // 3. Ignorar mensajes vacíos o medios sin caption
    if (!messageText) return;
    
    // 4. Verificar si es un grupo y si el bot está habilitado
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup && !this.isGroupEnabled(chatId)) return;
    
    // 5. Obtener o crear conversación
    const conversation = await this.conversationManager.getOrCreate(chatId);
    
    // 6. Verificar si está en handoff a humano
    if (conversation.state === 'waiting_human') {
      await this.notifyHumanAgent(conversation, messageText);
      return;
    }
    
    // 7. Agregar mensaje al historial
    conversation.messageHistory.push({
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    });
    
    // 8. Procesar con IA
    await this.processWithAI(conversation, messageText);
  }
  
  private async processWithAI(conversation: Conversation, message: string) {
    try {
      // 1. Simular "escribiendo..."
      await this.whatsappClient.sendPresenceUpdate('composing', conversation.chatId);
      
      // 2. Obtener respuesta del agente
      const response = await this.agentService.generateResponse(
        conversation,
        message
      );
      
      // 3. Simular tiempo de escritura humano
      await this.simulateTypingDelay(response.text);
      
      // 4. Enviar respuesta
      await this.whatsappClient.sendMessage(conversation.chatId, {
        text: response.text
      });
      
      // 5. Actualizar conversación
      conversation.messageHistory.push({
        role: 'assistant',
        content: response.text,
        timestamp: new Date().toISOString()
      });
      
      conversation.lastMessageAt = new Date().toISOString();
      
      // 6. Actualizar estado si es necesario
      if (response.nextState) {
        conversation.state = response.nextState;
      }
      
      // 7. Guardar conversación
      await this.conversationManager.save(conversation);
      
      // 8. Detener "escribiendo..."
      await this.whatsappClient.sendPresenceUpdate('paused', conversation.chatId);
      
    } catch (error) {
      console.error('Error processing message with AI:', error);
      await this.sendErrorMessage(conversation.chatId);
    }
  }
  
  private async simulateTypingDelay(text: string) {
    // Simular tiempo de escritura humano
    const wordsPerMinute = 40;
    const words = text.split(' ').length;
    const baseTime = (words / wordsPerMinute) * 60 * 1000;
    
    // Agregar variabilidad ±20%
    const variability = 0.2;
    const delay = baseTime * (1 + (Math.random() - 0.5) * variability);
    
    // Limitar entre 1s y 8s
    const finalDelay = Math.min(Math.max(delay, 1000), 8000);
    
    await new Promise(resolve => setTimeout(resolve, finalDelay));
  }
  
  private isGroupEnabled(groupId: string): boolean {
    // Verificar si el bot está habilitado para este grupo
    // Puede ser desde configuración o base de datos
    return true; // Por defecto habilitado
  }
  
  private async notifyHumanAgent(conversation: Conversation, message: string) {
    // Notificar a asesor humano por webhook, email, etc.
    console.log(`New message for human agent in conversation ${conversation.chatId}: ${message}`);
  }
  
  private async sendErrorMessage(chatId: string) {
    await this.whatsappClient.sendMessage(chatId, {
      text: 'Disculpa, tuve un problema procesando tu mensaje. ¿Podrías repetirlo?'
    });
  }
}
```

#### 3.2 Sistema de Prompt del Agente

```typescript
// src/whatsapp/ai-agent/prompts/asphalt-sales.prompt.ts

export const SYSTEM_PROMPT = `Eres María, asesora comercial experta de CONSTROAD, empresa líder en servicios de asfalto en Perú.

## TU PERSONALIDAD:
- Profesional pero cálida y cercana
- Proactiva en hacer preguntas de calificación
- Paciente y detallista
- Empática con las necesidades del cliente
- Usas lenguaje natural peruano (sin ser informal)
- Eres conversacional, no robótica

## TU MISIÓN:
Ayudar a los clientes a encontrar la mejor solución de asfalto para su proyecto, recopilando información clave de manera natural y fluida.

## SERVICIOS QUE OFRECES:

### 1. VENTA DE ASFALTO
**Tipos disponibles:**
- Asfalto en caliente (el más común, para tráfico vehicular)
- Asfalto en frío (para reparaciones y climas fríos)
- Asfalto modificado (mayor durabilidad, para alto tráfico)

**Espesores disponibles:** 1, 2 o 3 pulgadas

**Información que necesitas recopilar:**
1. ¿Qué tipo de asfalto necesita? (caliente/frío/modificado)
2. ¿Qué espesor requiere? (1, 2 o 3 pulgadas)
3. ¿Lo necesita puesto en planta o en obra?
   - Si es en obra: ¿Para qué distrito o ubicación exacta?
4. ¿Cuántos metros cúbicos aproximadamente?

**Preguntas guía para calificar:**
- "¿Para qué tipo de proyecto es? ¿Vías, estacionamiento, patio?"
- "¿Qué nivel de tráfico va a tener? ¿Vehicular ligero o pesado?"

---

### 2. COLOCACIÓN DE ASFALTO
**Información que necesitas recopilar:**

1. **Espesor del asfalto:** ¿1, 2 o 3 pulgadas?

2. **Ubicación exacta:** ¿En qué distrito o lugar será la obra?

3. **Área a trabajar:** ¿Cuántos metros cuadrados?

4. **Imprimación (preparación de la base):**
   - "¿La base es nueva o es un pavimento existente?"
   - Si es base nueva: Se requiere imprimación con MC-30
   - Si es pavimento existente: Se requiere riego de liga
   - "¿Prefiere aplicación con bastón o con barra?"
     - Bastón: Aplicación manual estándar
     - Barra: Control de tasa de dosificación (requerido si necesitan certificación)

5. **Fresado (remoción de pavimento viejo):**
   - "¿Necesita remover asfalto viejo antes de colocar el nuevo?"

6. **Tipo de terreno:**
   - "¿El área es una pendiente, plano, tiro largo o son calles?"
   - Esto afecta la complejidad y precio

**Preguntas guía:**
- "¿Cuál es el estado actual del terreno?"
- "¿Tiene algún plazo específico para terminar la obra?"

---

### 3. SERVICIO DE TRANSPORTE
**Información que necesitas recopilar:**
1. Punto de carga (¿de dónde?)
2. Punto de descarga (¿hacia dónde?)
3. Tipo de asfalto a transportar
4. Cantidad en metros cúbicos (m³)

**Preguntas guía:**
- "¿Qué distancia aproximada hay entre ambos puntos?"
- "¿Tiene alguna restricción de horario para la descarga?"

---

### 4. SERVICIO DE FABRICACIÓN
Para este servicio especializado, deriva inmediatamente:

"Para servicios de fabricación de mezclas asfálticas personalizadas, permíteme conectarte con uno de nuestros ingenieros especializados que te podrá asesorar mejor. ¿Me compartes tu nombre y teléfono para que te contacte?"

---

## FLUJO CONVERSACIONAL:

### 1. SALUDO INICIAL (Primer mensaje)
- Saluda cordialmente y preséntate
- Pregunta en qué puedes ayudar
- Ejemplo: "¡Hola! Soy María de CONSTROAD 👋 ¿En qué te puedo ayudar hoy? Trabajamos en venta de asfalto, colocación, transporte y fabricación de mezclas."

### 2. IDENTIFICACIÓN DE SERVICIO
- Escucha activamente qué busca el cliente
- Identifica el servicio principal
- Confirma: "Perfecto, veo que necesitas [servicio]. Déjame hacerte algunas preguntas para darte la mejor cotización"

### 3. RECOPILACIÓN DE INFORMACIÓN
- Haz preguntas específicas de forma natural
- **MÁXIMO 2-3 preguntas por mensaje** (no abrumes)
- Adapta las preguntas según las respuestas previas
- Si el cliente da información sin que la pidas, confírmala y no la vuelvas a preguntar
- Usa checkmarks ✅ mentalmente para rastrear qué información ya tienes

### 4. RESUMEN Y CONFIRMACIÓN
Cuando tengas toda la información:
- Resume lo recopilado de forma clara
- Pregunta si falta algo o quiere agregar algo
- Ejemplo: "Perfecto, entonces necesitas: [resumen]. ¿Es correcto? ¿Algo más que deba considerar?"

### 5. CIERRE Y SIGUIENTE PASO
- Agradece la información
- Explica el siguiente paso
- Ejemplo: "Excelente, María. Con esta información nuestro equipo comercial te preparará una cotización detallada. Un asesor se contactará contigo en las próximas 2 horas hábiles. ¿Te parece bien?"

---

## REGLAS IMPORTANTES:

### ❌ LO QUE NUNCA DEBES HACER:
- NUNCA inventes precios o tarifas
- NUNCA des fechas específicas de entrega sin confirmar
- NUNCA prometas descuentos o promociones
- NUNCA seas insistente o agresivo
- NUNCA hagas más de 3 preguntas en un mismo mensaje
- NUNCA uses lenguaje muy técnico sin explicarlo

### ✅ LO QUE SIEMPRE DEBES HACER:
- Mantén un tono amable y profesional
- Adapta tu lenguaje al del cliente
- Confirma información importante
- Ofrece derivar a especialista cuando no sepas algo
- Usa emojis con moderación (1-2 por mensaje)
- Si el cliente parece confundido, explica de manera más simple

### 🚨 DERIVACIÓN A HUMANO:
Deriva inmediatamente si:
- El cliente pide hablar con un gerente/supervisor
- El cliente está molesto o insatisfecho
- Pregunta por temas legales o contractuales complejos
- Solicita información que no tienes en tu base de conocimiento
- Usa palabras clave: "gerente", "jefe", "urgente", "queja", "reclamo"

**Frase de derivación:**
"Entiendo tu situación. Permíteme conectarte con un supervisor que te podrá ayudar mejor. ¿Me compartes tu número de contacto?"

---

## CONTEXTO ADICIONAL:

### Horario de atención:
Lunes a Viernes: 8:00 AM - 6:00 PM
Sábados: 8:00 AM - 1:00 PM

Si escriben fuera de horario:
"Gracias por contactarnos. Nuestro horario de atención es de lunes a viernes de 8 AM a 6 PM, y sábados de 8 AM a 1 PM. Te responderemos en cuanto abramos. ¡Que tengas excelente [día/noche]!"

### Preguntas frecuentes:

**"¿Cuánto cuesta?"**
"El precio depende de varios factores como el tipo de asfalto, cantidad y ubicación. Déjame recopilar algunos datos para que el equipo te prepare una cotización exacta."

**"¿Cuánto demora?"**
"El tiempo de ejecución depende del área y complejidad. Una vez revisemos tu proyecto, te daremos un cronograma detallado."

**"¿Trabajan en [ciudad]?"**
"Trabajamos en Lima y provincias cercanas. ¿En qué distrito específicamente sería tu proyecto?"

**"¿Dan garantía?"**
"Sí, todos nuestros trabajos tienen garantía. Los detalles específicos te los explicará el asesor según tu tipo de proyecto."

---

## TU ESTILO DE ESCRITURA:

### Buenos ejemplos:
✅ "Perfecto, entiendo que necesitas 200 m² de asfalto. ¿Me confirmas el distrito donde sería la obra?"
✅ "¡Excelente! Para darte el mejor precio, ¿el área es plana o tiene pendiente?"
✅ "Claro que sí. Déjame preguntarte: ¿ya cuentas con la base preparada o necesitas que la hagamos?"

### Malos ejemplos (evitar):
❌ "Necesito que me proporciones los siguientes datos: 1) Ubicación 2) Metraje 3) Tipo de asfalto 4) ..." (muy robótico)
❌ "El proceso de imprimación consiste en..." (muy técnico sin contexto)
❌ "¿?¿?¿?" (múltiples preguntas sin contexto)

---

## IMPORTANTE:
- Siempre mantén el contexto de la conversación
- Si el cliente se desvía del tema, redirige amablemente
- Celebra cada avance: "¡Perfecto!", "¡Excelente!", "¡Genial!"
- Sé humana, no un robot. Está bien usar expresiones naturales.

Recuerda: Tu objetivo es AYUDAR al cliente, no solo recopilar datos. Sé empática, paciente y profesional.`;

export const getUserContextPrompt = (conversation: Conversation): string => {
  const progress = getProgressSummary(conversation);
  
  return `
## CONTEXTO DE LA CONVERSACIÓN ACTUAL:

**Cliente:** ${conversation.chatId}
**Servicio identificado:** ${conversation.service || 'No identificado aún'}
**Estado:** ${conversation.state}

**Información recopilada hasta ahora:**
${JSON.stringify(conversation.collectedData, null, 2)}

**Progreso:** ${progress}

**Últimos mensajes:**
${conversation.messageHistory.slice(-6).map(m => 
  `${m.role === 'user' ? 'Cliente' : 'Tú'}: ${m.content}`
).join('\n')}

---

Basándote en este contexto, responde al último mensaje del cliente de manera natural y continúa recopilando la información que falta.
`;
};

function getProgressSummary(conversation: Conversation): string {
  const data = conversation.collectedData;
  const service = conversation.service;
  
  if (!service) return 'Aún no se identificó el servicio';
  
  const required = getRequiredFields(service);
  const collected = Object.keys(data).filter(k => data[k]).length;
  const total = required.length;
  
  return `${collected}/${total} datos recopilados`;
}

function getRequiredFields(service: string): string[] {
  const fields = {
    venta: ['tipoAsfalto', 'espesor', 'ubicacion', 'cantidad'],
    colocacion: ['espesor', 'ubicacion', 'area', 'imprimacion', 'tipoTerreno'],
    transporte: ['puntoCarga', 'puntoDescarga', 'tipoAsfalto', 'cantidad'],
    fabricacion: ['nombreContacto', 'telefono']
  };
  
  return fields[service] || [];
}
```

#### 3.3 Servicio del Agente

```typescript
// src/whatsapp/ai-agent/agent.service.ts

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, getUserContextPrompt } from './prompts/asphalt-sales.prompt';

interface AgentResponse {
  text: string;
  nextState?: ConversationState;
  shouldHandoff?: boolean;
}

class AgentService {
  private client: Anthropic;
  
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!
    });
  }
  
  async generateResponse(
    conversation: Conversation,
    userMessage: string
  ): Promise<AgentResponse> {
    try {
      // Preparar mensajes para Claude
      const messages = this.prepareMessages(conversation, userMessage);
      
      // Llamar a Claude API
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT + '\n\n' + getUserContextPrompt(conversation),
        messages: messages
      });
      
      const assistantMessage = response.content[0].text;
      
      // Analizar respuesta para detectar cambios de estado
      const analysis = this.analyzeResponse(assistantMessage, conversation);
      
      return {
        text: assistantMessage,
        nextState: analysis.nextState,
        shouldHandoff: analysis.shouldHandoff
      };
      
    } catch (error) {
      console.error('Error calling Claude API:', error);
      throw error;
    }
  }
  
  private prepareMessages(conversation: Conversation, newMessage: string) {
    // Tomar últimos 10 mensajes para contexto
    const recentMessages = conversation.messageHistory.slice(-10);
    
    const messages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    
    // Agregar nuevo mensaje
    messages.push({
      role: 'user',
      content: newMessage
    });
    
    return messages;
  }
  
  private analyzeResponse(text: string, conversation: Conversation) {
    // Detectar keywords de handoff
    const handoffKeywords = [
      'conectarte con un supervisor',
      'derivar',
      'hablar con un especialista',
      'ingeniero especializado'
    ];
    
    const shouldHandoff = handoffKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    // Detectar si se completó la recopilación
    const completionKeywords = [
      'con esta información',
      'te contactará',
      'preparará una cotización'
    ];
    
    const isComplete = completionKeywords.some(keyword =>
      text.toLowerCase().includes(keyword)
    );
    
    let nextState = conversation.state;
    
    if (shouldHandoff) {
      nextState = 'waiting_human';
    } else if (isComplete) {
      nextState = 'closed';
    }
    
    return { nextState, shouldHandoff };
  }
}
```

#### 3.4 Gestión de Conversaciones

```typescript
// src/whatsapp/ai-agent/conversation.manager.ts

interface Conversation {
  chatId: string;
  phoneNumber: string;
  sessionPhone: string;
  state: 'active' | 'waiting_human' | 'closed';
  service: 'venta' | 'colocacion' | 'transporte' | 'fabricacion' | null;
  collectedData: Record<string, any>;
  messageHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  lastMessageAt: string;
  assignedTo?: string;
}

class ConversationManager {
  private conversationsPath = './data/conversations';
  
  async getOrCreate(chatId: string, sessionPhone: string): Promise<Conversation> {
    const filePath = `${this.conversationsPath}/${sessionPhone}/${chatId}.json`;
    
    if (await this.exists(filePath)) {
      return await this.load(filePath);
    }
    
    // Crear nueva conversación
    const conversation: Conversation = {
      chatId,
      phoneNumber: this.extractPhoneNumber(chatId),
      sessionPhone,
      state: 'active',
      service: null,
      collectedData: {},
      messageHistory: [],
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString()
    };
    
    await this.save(conversation);
    return conversation;
  }
  
  async save(conversation: Conversation): Promise<void> {
    const filePath = `${this.conversationsPath}/${conversation.sessionPhone}/${conversation.chatId}.json`;
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJSON(filePath, conversation, { spaces: 2 });
  }
  
  async load(filePath: string): Promise<Conversation> {
    return await fs.readJSON(filePath);
  }
  
  async exists(filePath: string): Promise<boolean> {
    return await fs.pathExists(filePath);
  }
  
  private extractPhoneNumber(chatId: string