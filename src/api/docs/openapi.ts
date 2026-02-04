export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'WhatsApp API v2',
    version: '2.0.0',
    description: 'API para sesiones, mensajeria, jobs, PDFs y almacenamiento multi-tenant.',
  },
  servers: [
    {
      url: '/',
    },
  ],
  tags: [
    { name: 'Session', description: 'Sesiones de WhatsApp' },
    { name: 'WhatsApp', description: 'Envio de mensajes y archivos' },
    { name: 'Messages', description: 'Historial de conversaciones' },
    { name: 'Jobs', description: 'Cron jobs' },
    { name: 'PDF', description: 'Generacion de PDFs y templates' },
    { name: 'Drive', description: 'Almacenamiento multi-tenant (requiere JWT con companyId)' },
    { name: 'System', description: 'Health y estado del servidor' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token con companyId en el payload. Formato: Authorization: Bearer {token}',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              statusCode: { type: 'number' },
            },
          },
        },
      },
      DriveEntry: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del archivo o carpeta' },
          path: { type: 'string', description: 'Ruta relativa' },
          type: { type: 'string', enum: ['file', 'folder'] },
          size: { type: 'number', description: 'Tamaño en bytes (solo archivos)' },
          updatedAt: { type: 'string', format: 'date-time' },
          url: { type: 'string', description: 'URL publica (solo archivos)' },
          listUrl: { type: 'string', description: 'URL para listar (solo carpetas)' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Servidor activo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                    environment: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/status': {
      get: {
        tags: ['System'],
        summary: 'Estado del servidor y sesiones activas',
        responses: {
          200: {
            description: 'Estado del sistema',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        activeSessions: { type: 'number' },
                        nodeEnv: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/sessions': {
      post: {
        tags: ['Session'],
        summary: 'Crear nueva sesion WhatsApp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phoneNumber'],
                properties: {
                  phoneNumber: {
                    type: 'string',
                    description: 'Numero en formato internacional (ej. 51999999999)',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Sesion creada',
          },
          400: { description: 'Datos invalidos' },
        },
      },
      get: {
        tags: ['Session'],
        summary: 'Obtener todas las sesiones',
        responses: {
          200: { description: 'Listado de sesiones' },
        },
      },
    },
    '/api/sessions/list': {
      get: {
        tags: ['Session'],
        summary: 'Listar sesiones activas',
        responses: {
          200: {
            description: 'Listado de sesiones',
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}/qr': {
      get: {
        tags: ['Session'],
        summary: 'Obtener QR como imagen PNG',
        description: 'Usa ?format=json para recibir el QR como data URL.',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['json'] },
            description: 'Devuelve el QR como data URL en JSON',
          },
        ],
        responses: {
          200: {
            description: 'QR en PNG',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        qr: { type: 'string' },
                        qrImage: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'QR no disponible' },
        },
      },
    },
    '/api/sessions/{phoneNumber}/status': {
      get: {
        tags: ['Session'],
        summary: 'Estado de sesion WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Estado de sesion' },
          400: { description: 'Numero invalido' },
        },
      },
    },
    '/api/sessions/{phoneNumber}/logout': {
      post: {
        tags: ['Session'],
        summary: 'Cerrar sesion activa',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Sesion cerrada' },
          400: { description: 'Numero invalido' },
        },
      },
    },
    '/api/sessions/{phoneNumber}/groups': {
      get: {
        tags: ['Session'],
        summary: 'Listar grupos de WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de grupos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}/syncGroups': {
      get: {
        tags: ['Session'],
        summary: 'Sincronizar grupos de WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de grupos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}/contacts': {
      get: {
        tags: ['Session'],
        summary: 'Listar contactos de WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de contactos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}': {
      delete: {
        tags: ['Session'],
        summary: 'Desconectar sesion WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Sesion desconectada' },
          400: { description: 'Numero invalido' },
        },
      },
    },
    '/api/message': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar mensaje de texto (legacy)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionPhone', 'chatId', 'message'],
                properties: {
                  sessionPhone: { type: 'string' },
                  chatId: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mensaje enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/text': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar mensaje de texto',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'message'],
                properties: {
                  to: {
                    type: 'string',
                    description: 'Numero destino o JID (ej. 51999999999 o 51999999999@s.whatsapp.net)',
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mensaje enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/image': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar imagen',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'to'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  to: { type: 'string' },
                  caption: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Imagen enviada' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/video': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar video',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'to'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  to: { type: 'string' },
                  caption: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Video enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/file': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar archivo',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'to'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  to: { type: 'string' },
                  caption: { type: 'string' },
                  mimeType: {
                    type: 'string',
                    description: 'Opcional, se detecta por extension si no se envia',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Archivo enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/{chatId}': {
      get: {
        tags: ['Messages'],
        summary: 'Obtener conversacion',
        parameters: [
          { name: 'sessionPhone', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Conversacion' },
          404: { description: 'No encontrada' },
        },
      },
      delete: {
        tags: ['Messages'],
        summary: 'Cerrar conversacion',
        parameters: [
          { name: 'sessionPhone', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Conversacion cerrada' },
        },
      },
    },
    '/api/message/{sessionPhone}': {
      get: {
        tags: ['Messages'],
        summary: 'Listar conversaciones de sesion',
        parameters: [
          { name: 'sessionPhone', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Listado de conversaciones' },
        },
      },
    },
    '/api/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Crear cron job',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['companyId', 'name', 'type', 'schedule'],
                properties: {
                  companyId: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['api', 'message'] },
                  isActive: { type: 'boolean' },
                  timeout: { type: 'number' },
                  schedule: {
                    type: 'object',
                    required: ['cronExpression'],
                    properties: {
                      cronExpression: { type: 'string' },
                      timezone: { type: 'string' },
                    },
                  },
                  message: {
                    type: 'object',
                    properties: {
                      chatId: { type: 'string' },
                      body: { type: 'string' },
                      mentions: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  apiConfig: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      method: { type: 'string', enum: ['GET', 'POST', 'PUT'] },
                      headers: { type: 'object' },
                      body: {},
                    },
                  },
                  metadata: {
                    type: 'object',
                    properties: {
                      createdBy: { type: 'string' },
                      updatedBy: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  retryPolicy: {
                    type: 'object',
                    properties: {
                      maxRetries: { type: 'number' },
                      backoffMultiplier: { type: 'number' },
                      currentRetries: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Job creado' },
        },
      },
      get: {
        tags: ['Jobs'],
        summary: 'Listar cron jobs',
        parameters: [
          {
            name: 'companyId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filtrar jobs por empresa',
          },
          {
            name: 'type',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['api', 'message'] },
            description: 'Filtrar por tipo',
          },
          {
            name: 'isActive',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
            description: 'Filtrar por estado',
          },
        ],
        responses: {
          200: { description: 'Listado de jobs' },
        },
      },
    },
    '/api/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Obtener job por ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job encontrado' },
          404: { description: 'No encontrado' },
        },
      },
      patch: {
        tags: ['Jobs'],
        summary: 'Actualizar cron job',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['api', 'message'] },
                  isActive: { type: 'boolean' },
                  timeout: { type: 'number' },
                  schedule: {
                    type: 'object',
                    properties: {
                      cronExpression: { type: 'string' },
                      timezone: { type: 'string' },
                    },
                  },
                  message: {
                    type: 'object',
                    properties: {
                      chatId: { type: 'string' },
                      body: { type: 'string' },
                      mentions: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  apiConfig: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      method: { type: 'string', enum: ['GET', 'POST', 'PUT'] },
                      headers: { type: 'object' },
                      body: {},
                    },
                  },
                  metadata: {
                    type: 'object',
                    properties: {
                      updatedBy: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  retryPolicy: {
                    type: 'object',
                    properties: {
                      maxRetries: { type: 'number' },
                      backoffMultiplier: { type: 'number' },
                      currentRetries: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Job actualizado' },
        },
      },
      put: {
        tags: ['Jobs'],
        summary: 'Actualizar cron job (PUT)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['api', 'message'] },
                  isActive: { type: 'boolean' },
                  timeout: { type: 'number' },
                  schedule: {
                    type: 'object',
                    properties: {
                      cronExpression: { type: 'string' },
                      timezone: { type: 'string' },
                    },
                  },
                  message: {
                    type: 'object',
                    properties: {
                      chatId: { type: 'string' },
                      body: { type: 'string' },
                      mentions: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  apiConfig: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      method: { type: 'string', enum: ['GET', 'POST', 'PUT'] },
                      headers: { type: 'object' },
                      body: {},
                    },
                  },
                  metadata: {
                    type: 'object',
                    properties: {
                      updatedBy: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  retryPolicy: {
                    type: 'object',
                    properties: {
                      maxRetries: { type: 'number' },
                      backoffMultiplier: { type: 'number' },
                      currentRetries: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Job actualizado' },
        },
      },
      delete: {
        tags: ['Jobs'],
        summary: 'Eliminar cron job',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job eliminado' },
        },
      },
    },
    '/api/jobs/{id}/run': {
      post: {
        tags: ['Jobs'],
        summary: 'Ejecutar job inmediatamente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job ejecutado' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/pdf/generate': {
      post: {
        tags: ['PDF'],
        summary: 'Generar PDF desde template',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['templateId', 'data'],
                properties: {
                  templateId: { type: 'string' },
                  data: { type: 'object' },
                  filename: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'PDF generado' },
        },
      },
    },
    '/api/pdf/templates': {
      post: {
        tags: ['PDF'],
        summary: 'Crear template',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  htmlContent: { type: 'string' },
                },
                required: ['id', 'name', 'htmlContent'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Template creado' },
        },
      },
      get: {
        tags: ['PDF'],
        summary: 'Listar templates',
        responses: {
          200: { description: 'Listado de templates' },
        },
      },
    },
    '/api/pdf/templates/{templateId}': {
      delete: {
        tags: ['PDF'],
        summary: 'Eliminar template',
        parameters: [
          { name: 'templateId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Template eliminado' },
        },
      },
    },
    '/api/pdf/generate-vale': {
      post: {
        tags: ['PDF'],
        summary: 'Generar vale desde template PDF',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fields'],
                properties: {
                  template: {
                    type: 'string',
                    description: 'Nombre del template PDF en templates/pdf',
                    example: 'plantilla_dispatch_note.pdf',
                  },
                  fields: {
                    type: 'object',
                    required: [
                      'senores',
                      'obra',
                      'tipoMaterial',
                      'nroM3',
                      'placa',
                      'chofer',
                      'hora',
                      'fecha',
                    ],
                    properties: {
                      nroVale: { type: 'string' },
                      fecha: { type: 'string' },
                      senores: { type: 'string' },
                      obra: { type: 'string' },
                      tipoMaterial: { type: 'string' },
                      nroM3: { type: 'string' },
                      placa: { type: 'string' },
                      chofer: { type: 'string' },
                      hora: { type: 'string' },
                      nota: { type: 'string' },
                    },
                  },
                  coords: {
                    type: 'object',
                    description: 'Coordenadas opcionales por campo',
                  },
                  notify: {
                    type: 'object',
                    description: 'Notificaciones opcionales',
                    properties: {
                      whatsapp: {
                        type: 'object',
                        properties: {
                          from: {
                            type: 'string',
                            description: 'Session phone a usar para enviar',
                          },
                          to: {
                            type: 'string',
                            description:
                              'Numero o group id (ej. 51999999999 o 12345-67890)',
                          },
                          caption: { type: 'string' },
                        },
                      },
                      telegram: {
                        type: 'object',
                        properties: {
                          chatId: {
                            type: 'string',
                            description: 'Chat ID o username',
                          },
                          caption: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'PDF generado' },
        },
      },
    },
    '/api/pdf/templates/preview-grid': {
      get: {
        tags: ['PDF'],
        summary: 'Preview de template PDF con grilla',
        parameters: [
          {
            name: 'template',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Nombre del template PDF',
          },
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'scale',
            in: 'query',
            required: false,
            schema: { type: 'number', default: 1.5 },
          },
          {
            name: 'grid',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 50 },
          },
        ],
        responses: {
          200: {
            description: 'Imagen PNG con grilla',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/api/drive/list': {
      get: {
        tags: ['Drive'],
        summary: 'Listar archivos y carpetas (Multi-tenant)',
        description: 'Lista el contenido de una carpeta dentro del espacio de almacenamiento de la empresa. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del espacio de la empresa (ej: orders/project-1)',
          },
        ],
        responses: {
          200: {
            description: 'Listado de contenido',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        total: { type: 'number' },
                        entries: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/DriveEntry' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'No autorizado - Token invalido o ausente' },
          403: { description: 'Acceso denegado - Ruta fuera del espacio de la empresa' },
          404: { description: 'Ruta no encontrada' },
        },
      },
    },
    '/api/drive/info': {
      get: {
        tags: ['Drive'],
        summary: 'Obtener metadata de un archivo o carpeta (Multi-tenant)',
        description: 'Obtiene información detallada de un archivo o carpeta. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Ruta relativa del archivo o carpeta',
          },
        ],
        responses: {
          200: {
            description: 'Metadata del archivo o carpeta',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/DriveEntry' },
                  },
                },
              },
            },
          },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/folders': {
      post: {
        tags: ['Drive'],
        summary: 'Crear carpeta (Multi-tenant)',
        description: 'Crea una nueva carpeta en el espacio de la empresa. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  path: { type: 'string', description: 'Ruta padre (opcional, raiz si se omite)' },
                  name: { type: 'string', description: 'Nombre de la carpeta' },
                },
                example: {
                  path: 'orders',
                  name: 'project-1',
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Carpeta creada exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        path: { type: 'string' },
                        type: { type: 'string', example: 'folder' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Nombre de carpeta invalido' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'Ruta padre no encontrada' },
        },
      },
    },
    '/api/drive/files': {
      post: {
        tags: ['Drive'],
        summary: 'Subir archivo (Multi-tenant)',
        description: 'Sube un archivo al espacio de almacenamiento de la empresa. Requiere JWT con companyId. El archivo se almacenará en /companies/{companyId}/{path}/',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  path: { type: 'string', description: 'Ruta destino relativa (ej: orders/project-1)' },
                  file: { type: 'string', format: 'binary', description: 'Archivo a subir' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Archivo subido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        path: { type: 'string' },
                        type: { type: 'string', example: 'file' },
                        size: { type: 'number' },
                        url: { type: 'string', description: 'URL publica del archivo' },
                        urlAbsolute: { type: 'string', description: 'URL absoluta' },
                      },
                    },
                  },
                  example: {
                    success: true,
                    data: {
                      name: 'factura.pdf',
                      path: 'orders/project-1/factura.pdf',
                      type: 'file',
                      size: 102400,
                      url: '/files/companies/company-123/orders/project-1/factura.pdf',
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Archivo invalido o faltante' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
        },
      },
    },
    '/api/drive/entry': {
      delete: {
        tags: ['Drive'],
        summary: 'Eliminar archivo o carpeta (Multi-tenant)',
        description: 'Elimina un archivo o carpeta del espacio de la empresa. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Ruta del archivo o carpeta a eliminar',
          },
        ],
        responses: {
          200: {
            description: 'Eliminado exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Ruta requerida' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/move': {
      patch: {
        tags: ['Drive'],
        summary: 'Mover o renombrar archivo/carpeta (Multi-tenant)',
        description: 'Mueve o renombra un archivo o carpeta dentro del espacio de la empresa. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['from', 'to'],
                properties: {
                  from: { type: 'string', description: 'Ruta origen' },
                  to: { type: 'string', description: 'Ruta destino' },
                },
                example: {
                  from: 'orders/old-name.pdf',
                  to: 'orders/project-1/new-name.pdf',
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Movido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        from: { type: 'string' },
                        to: { type: 'string' },
                        url: { type: 'string' },
                        urlAbsolute: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Rutas requeridas o invalidas' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'Origen no encontrado' },
        },
      },
    },
    '/api/drive/pdf/info': {
      get: {
        tags: ['Drive'],
        summary: 'Obtener metadata de un PDF (Multi-tenant)',
        description: 'Obtiene información de un PDF (número de páginas, dimensiones, etc.). Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'URL publica del PDF',
          },
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
        ],
        responses: {
          200: { description: 'Metadata del PDF' },
          400: { description: 'Parametro invalido' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/pdf/page': {
      get: {
        tags: ['Drive'],
        summary: 'Renderizar pagina de PDF a imagen (Multi-tenant)',
        description: 'Renderiza una página de un PDF a imagen PNG. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'URL publica del PDF',
          },
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'scale',
            in: 'query',
            required: false,
            schema: { type: 'number', default: 1.5 },
            description: 'Escala de render (0.5 - 3)',
          },
        ],
        responses: {
          200: {
            description: 'Imagen PNG de la pagina',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          400: { description: 'Parametro invalido' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/pdf/preview-grid': {
      get: {
        tags: ['Drive'],
        summary: 'Preview de PDF con grilla para coordenadas (Multi-tenant)',
        description: 'Renderiza una página de PDF con grilla superpuesta para ayudar a encontrar coordenadas. Requiere JWT con companyId.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'URL publica del PDF',
          },
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'scale',
            in: 'query',
            required: false,
            schema: { type: 'number', default: 1.5 },
          },
          {
            name: 'grid',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 50 },
            description: 'Tamaño de grilla en puntos',
          },
        ],
        responses: {
          200: {
            description: 'Imagen PNG con grilla',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          400: { description: 'Parametro invalido' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado' },
          404: { description: 'No encontrado' },
        },
      },
    },
  },
};
